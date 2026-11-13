import type {
  ChatworkStatus,
  Conversation,
  HistorySnapshot,
  Message,
  SendMessageInput,
  SendMessageResult
} from '@omni-desk/contracts'
import {
  AppError,
  PRIORITY,
  Scheduler,
  sleep,
  toErrorPayload,
  type Priority,
  type RateGovernor,
  type SyncEngine,
  type SyncSink,
  type SyncStorage
} from '@omni-desk/connector-core'
import type { ChatworkProvider } from './provider'
import { formatChatworkReply } from './service'

/**
 * Chatwork の同期エンジン（設計: docs/chatwork-sync-design.md）。
 *
 * 1. 30 秒ごとにルーム一覧（1 回の API）を取得し、ルームごとの状態の変化を検知する
 * 2. 本文は「自分宛ての未読が増えた」「開いている」「起動時の追いつき」ルームだけ取得する
 *    （回数がルーム数ではなく、自分宛ての件数と利用者の操作に比例するようにする）
 * 3. すべての API 呼び出しを 1 つの優先度付きキューに通し、RateGovernor の予算内で実行する
 * 4. 自分宛てメッセージはローカルに保存し、次回起動時はそこから表示してから差分を取る
 */

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** ルームの状態の指紋。どれかが変わったら「何か起きた」とみなす */
export interface RoomSignature {
  /** last_update_time（ms） */
  lu: number
  /** message_num */
  mc: number
  /** unread_num */
  un: number
  /** mention_num（自分宛ての未読数） */
  mn: number
  /** mytask_num */
  tk: number
}

export const signatureOf = (r: Conversation): RoomSignature => ({
  lu: r.lastActivityAt ?? 0,
  mc: r.messageCount ?? 0,
  un: r.unreadCount ?? 0,
  mn: r.mentionCount ?? 0,
  tk: r.myTaskCount ?? 0
})

const sameSignature = (a: RoomSignature, b: RoomSignature): boolean =>
  a.lu === b.lu && a.mc === b.mc && a.un === b.un && a.mn === b.mn && a.tk === b.tk

export interface PersistedChatworkState {
  version: 1
  accountId: string
  savedAt: number
  signatures: Record<string, RoomSignature>
  mentions: Message[]
}

export type FetchReason = 'mention' | 'view' | 'backfill' | 'scan'

export interface FetchPlan {
  roomId: string
  reason: FetchReason
}

export interface RoomPlan {
  fetches: FetchPlan[]
  /** 変化したが今は取得しないルーム（キャッシュ済みの履歴が古くなった） */
  stale: string[]
  tasksChanged: boolean
}

/**
 * 前回と今回のルーム一覧を比べて、本文を取りに行くルームを決める（純粋関数）。
 *
 * - 自分宛ての未読が増えた / DM の未読が増えた → mention（優先）
 * - 開いているルームが変化した → view
 * - 起動時・復帰時の追いつき中に変化していた → backfill（余裕のあるときだけ）
 * - それ以外の変化 → scan（最も低い優先度。予算に余裕があるときだけ取得する）
 *   自分宛ての未読数は Chatwork 側で読むと戻るので、増加だけを見ていると 30 秒以内に読まれた自分宛てを取りこぼす。
 *   また自分の投稿（返信）を見つけて受信箱を対応済みにするためにも使う。
 */
export function planRoomFetches(
  prev: ReadonlyMap<string, RoomSignature> | null,
  rooms: readonly Conversation[],
  opts: { watched: string | null; catchUp: boolean; now: number; firstRunWindowMs?: number }
): RoomPlan {
  const fetches: FetchPlan[] = []
  const stale: string[] = []
  const firstRunFrom = opts.now - (opts.firstRunWindowMs ?? 3 * DAY)
  let tasksChanged = prev === null

  const prevTasks = prev ? [...prev.values()].reduce((sum, s) => sum + s.tk, 0) : 0
  const curTasks = rooms.reduce((sum, r) => sum + (r.myTaskCount ?? 0), 0)
  if (prev && prevTasks !== curTasks) tasksChanged = true

  for (const room of rooms) {
    const sig = signatureOf(room)
    const isDm = room.kind === 'dm'
    const before = prev?.get(room.id)

    if (!before) {
      // 初回起動、または新しく参加したルーム
      if (sig.mn > 0 || (isDm && sig.un > 0)) fetches.push({ roomId: room.id, reason: 'mention' })
      else if (room.id === opts.watched) fetches.push({ roomId: room.id, reason: 'view' })
      else if ((prev === null || opts.catchUp) && room.kind !== 'my' && sig.lu > firstRunFrom) {
        fetches.push({ roomId: room.id, reason: 'backfill' })
      }
      continue
    }

    // 追いつき時は、閉じている間に届いて未読のままの自分宛ても拾い直す
    if (opts.catchUp && sig.mn > 0) {
      fetches.push({ roomId: room.id, reason: 'mention' })
      continue
    }
    if (sameSignature(sig, before)) continue

    if (sig.mn > before.mn || (isDm && sig.un > before.un)) {
      fetches.push({ roomId: room.id, reason: 'mention' })
    } else if (room.id === opts.watched) {
      fetches.push({ roomId: room.id, reason: 'view' })
    } else if (opts.catchUp && sig.lu > before.lu && room.kind !== 'my') {
      fetches.push({ roomId: room.id, reason: 'backfill' })
    } else {
      stale.push(room.id)
      if (room.kind !== 'my') fetches.push({ roomId: room.id, reason: 'scan' })
    }
  }

  // 新しく動いたルームから取得する
  const lu = new Map(rooms.map((r) => [r.id, r.lastActivityAt ?? 0]))
  fetches.sort((a, b) => (lu.get(b.roomId) ?? 0) - (lu.get(a.roomId) ?? 0))
  return { fetches, stale, tasksChanged }
}

/** 自分宛てメッセージの統合（同じ ID は新しい内容で置き換え、期限切れと上限超過を落とす） */
export function mergeMentions(
  existing: readonly Message[],
  incoming: readonly Message[],
  opts: { now: number; maxAgeMs: number; maxItems: number }
): Message[] {
  const byId = new Map(existing.map((m) => [m.id, m]))
  for (const m of incoming) byId.set(m.id, m)
  const from = opts.now - opts.maxAgeMs
  return [...byId.values()]
    .filter((m) => m.createdAt >= from)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, opts.maxItems)
}

/** ルーム一覧から集計した件数（/my/status を呼ばずに済ませる） */
export function computeChatworkStatus(rooms: readonly Conversation[]): ChatworkStatus {
  const count = (pick: (r: Conversation) => number | undefined) => rooms.reduce((s, r) => s + (pick(r) ?? 0), 0)
  return {
    unreadRoomCount: rooms.filter((r) => (r.unreadCount ?? 0) > 0).length,
    mentionRoomCount: rooms.filter((r) => (r.mentionCount ?? 0) > 0).length,
    taskRoomCount: rooms.filter((r) => (r.myTaskCount ?? 0) > 0).length,
    unreadCount: count((r) => r.unreadCount),
    mentionCount: count((r) => r.mentionCount),
    taskCount: count((r) => r.myTaskCount)
  }
}

const sortRooms = (rooms: readonly Conversation[]): Conversation[] =>
  [...rooms].sort(
    (a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0)
  )

const REASON_PRIORITY: Record<FetchReason, Priority> = {
  view: PRIORITY.view,
  mention: PRIORITY.mention,
  backfill: PRIORITY.backfill,
  scan: PRIORITY.scan
}

/** 自分の投稿に含まれる返信タグから、返信済みのメッセージ（Message.id）を取り出す */
export function repliedMessageIds(messages: readonly Message[], myAccountId: string): string[] {
  const ids: string[] = []
  for (const m of messages) {
    if (m.author.id !== myAccountId) continue
    for (const match of m.text.matchAll(/\[(?:rp|返信) aid=\d+ to=(\d+)-(\d+)\]/g)) ids.push(`${match[1]}:${match[2]}`)
  }
  return ids
}

/**
 * ルームの未読数から、取得したメッセージのうち未読のものを決める（Chatwork はメッセージ単位の既読を返さないため）。
 * 新しい方から unreadCount 件（自分の投稿を除く）を未読とみなす。
 */
export function unreadMessageIds(messages: readonly Message[], unreadCount: number, myAccountId: string): Set<string> {
  const ids = new Set<string>()
  if (unreadCount <= 0) return ids
  for (let i = messages.length - 1; i >= 0 && ids.size < unreadCount; i--) {
    if (messages[i].author.id !== myAccountId) ids.add(messages[i].id)
  }
  return ids
}

export interface ChatworkSyncOptions {
  provider: ChatworkProvider
  sink: SyncSink
  governor: RateGovernor
  me: { accountId: string; name: string; avatarUrl?: string }
  storage?: SyncStorage<PersistedChatworkState>
  /** ルーム一覧での変更検知の間隔 */
  pollIntervalMs?: number
  /** タスク一覧の念のための再取得間隔（通常は mytask_num の変化で取得する） */
  tasksIntervalMs?: number
  now?: () => number
}

const MAX_HISTORY_ROOMS = 30
const POST_WINDOW_MS = 10_000
const POST_LIMIT = 10
const MAX_TEXT_LENGTH = 10_000

export class ChatworkSync implements SyncEngine {
  private readonly scheduler: Scheduler
  private readonly now: () => number
  private rooms: Conversation[] = []
  private signatures: Map<string, RoomSignature> | null = null
  private mentions: Message[] = []
  private readonly histories = new Map<string, Message[]>()
  private readonly stale = new Set<string>()
  private readonly postTimes = new Map<string, number[]>()
  private watched: string | null = null
  private catchUp = true
  private hasData = false
  private stopped = false
  private sendSeq = 0
  private timers: ReturnType<typeof setInterval>[] = []
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private rateTimer: ReturnType<typeof setTimeout> | null = null
  private lastRateAt = 0
  private readonly reportedHandled = new Set<string>()

  constructor(private readonly o: ChatworkSyncOptions) {
    this.now = o.now ?? Date.now
    this.scheduler = new Scheduler(o.governor, { concurrency: 2 })
  }

  // ---------------------------------------------------------------- lifecycle

  start(): void {
    this.o.sink.service({ phase: 'syncing', error: null, rate: this.rateStatus() })
    void this.restore().finally(() => {
      if (this.stopped) return
      this.enqueuePoll()
      this.enqueueTasks()
      this.timers.push(setInterval(() => this.enqueuePoll(), this.o.pollIntervalMs ?? 30_000))
      this.timers.push(setInterval(() => this.enqueueTasks(), this.o.tasksIntervalMs ?? 10 * MINUTE))
    })
  }

  stop(): void {
    this.stopped = true
    this.timers.forEach(clearInterval)
    this.timers = []
    if (this.rateTimer) clearTimeout(this.rateTimer)
    this.scheduler.dispose()
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
      void this.persist()
    }
  }

  refresh(): void {
    this.enqueuePoll()
    this.enqueueTasks()
  }

  resume(): void {
    this.catchUp = true
    this.refresh()
  }

  // ---------------------------------------------------------------- watch

  watch(roomId: string | null): void {
    const prev = this.watched
    this.watched = roomId
    if (prev && prev !== roomId) this.o.sink.history(prev, null)
    if (!roomId) return
    const cached = this.histories.get(roomId) ?? null
    const fresh = cached && !this.stale.has(roomId)
    this.emitHistory(roomId, cached, !fresh, null)
    if (!fresh) this.fetchRoom(roomId, PRIORITY.view)
  }

  // ---------------------------------------------------------------- send

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    const roomId = input.conversationId
    const text = input.text.trim()
    if (!text) throw new AppError('invalid_input', 'メッセージを入力してください')
    if (text.length > MAX_TEXT_LENGTH) throw new AppError('invalid_input', `メッセージは ${MAX_TEXT_LENGTH} 文字以内にしてください`)
    const body = input.replyTo ? formatChatworkReply(roomId, input.replyTo, text) : text

    await this.waitPostSlot(roomId)
    const res = await this.scheduler.enqueue(`send:${roomId}:${this.sendSeq++}`, PRIORITY.write, () =>
      this.o.provider.sendMessage(roomId, body)
    )
    this.emitRate()

    // 画面にはすぐ反映し、開いている会話なら正式な内容を取り直す
    const room = this.rooms.find((r) => r.id === roomId)
    const cached = this.histories.get(roomId)
    if (cached && room) {
      this.setHistory(roomId, [
        ...cached,
        {
          id: `${roomId}:${res.messageId}`,
          nativeId: res.messageId,
          source: 'chatwork',
          conversationId: roomId,
          conversationName: room.name,
          conversationKind: room.kind,
          author: { id: this.o.me.accountId, name: this.o.me.name, avatarUrl: this.o.me.avatarUrl },
          text: body,
          format: 'chatwork',
          createdAt: this.now()
        }
      ])
    }
    if (this.watched === roomId) this.fetchRoom(roomId, PRIORITY.view)
    return { nativeId: res.messageId }
  }

  async markRead(items: { conversationId: string; nativeId: string }[]): Promise<void> {
    // ルームごとに、指定された中で一番新しいメッセージまでを既読にする（API はルーム単位）
    const latest = new Map<string, { nativeId: string; at: number }>()
    for (const item of items) {
      const at = this.mentions.find((m) => m.id === `${item.conversationId}:${item.nativeId}`)?.createdAt ?? 0
      const cur = latest.get(item.conversationId)
      if (!cur || at >= cur.at) latest.set(item.conversationId, { nativeId: item.nativeId, at })
    }
    await Promise.all(
      [...latest].map(([roomId, { nativeId }]) =>
        this.scheduler.enqueue(`read:${roomId}`, PRIORITY.write, () => this.o.provider.markRead(roomId, nativeId))
      )
    )
    // 既読にしたルームは次の変更検知で未読数 0 として反映される
    this.enqueuePoll()
  }

  /** 投稿はルームごとに 10 秒 10 回まで（Chatwork の仕様） */
  private async waitPostSlot(roomId: string): Promise<void> {
    for (;;) {
      const now = this.now()
      const times = (this.postTimes.get(roomId) ?? []).filter((t) => now - t < POST_WINDOW_MS)
      if (times.length < POST_LIMIT) {
        times.push(now)
        this.postTimes.set(roomId, times)
        return
      }
      await sleep(times[0] + POST_WINDOW_MS - now + 50)
    }
  }

  // ---------------------------------------------------------------- jobs

  private enqueuePoll(): void {
    if (this.stopped) return
    this.scheduler.enqueue('rooms', PRIORITY.poll, () => this.poll()).catch((e) => this.fail(e))
  }

  private enqueueTasks(): void {
    if (this.stopped) return
    this.scheduler
      .enqueue('tasks', PRIORITY.tasks, async () => {
        const tasks = await this.o.provider.getTasks()
        this.o.sink.service({ tasks })
        this.emitRate()
      })
      .catch((e) => this.fail(e))
  }

  private async poll(): Promise<void> {
    const rooms = await this.o.provider.listRooms()
    const plan = planRoomFetches(this.signatures, rooms, {
      watched: this.watched,
      catchUp: this.catchUp,
      now: this.now()
    })
    this.catchUp = false
    this.rooms = rooms
    this.signatures = new Map(rooms.map((r) => [r.id, signatureOf(r)]))
    this.applyRoomReadState()
    plan.stale.forEach((id) => this.stale.add(id))
    for (const f of plan.fetches) this.fetchRoom(f.roomId, REASON_PRIORITY[f.reason])
    if (plan.tasksChanged) this.enqueueTasks()

    this.hasData = true
    this.o.sink.service({
      phase: 'ready',
      error: null,
      lastSyncedAt: this.now(),
      conversations: sortRooms(rooms),
      status: computeChatworkStatus(rooms),
      rate: this.rateStatus()
    })
    this.schedulePersist()
  }

  private fetchRoom(roomId: string, priority: Priority): void {
    if (this.stopped) return
    this.scheduler
      .enqueue(`room:${roomId}`, priority, async () => {
        const messages = await this.o.provider.getMessages(roomId)
        this.stale.delete(roomId)
        this.setHistory(roomId, messages)
        this.collectMentions(roomId, messages)
        this.emitRate()
      })
      .catch((e) => {
        if (this.watched === roomId) this.emitHistory(roomId, this.histories.get(roomId) ?? null, false, e)
        this.fail(e)
      })
  }

  private collectMentions(roomId: string, messages: readonly Message[]): void {
    const room = this.rooms.find((r) => r.id === roomId)
    const me = this.o.me.accountId

    // サービス側で自分が返信していたら、受信箱で対応済みにする
    const replied = repliedMessageIds(messages, me).filter((id) => !this.reportedHandled.has(id))
    if (replied.length) {
      replied.forEach((id) => this.reportedHandled.add(id))
      this.o.sink.handled(replied)
    }

    const unread = unreadMessageIds(messages, room?.unreadCount ?? 0, me)
    const toMe = messages
      .filter((m) => m.author.id !== me && (m.isMention || room?.kind === 'dm' || m.conversationKind === 'dm'))
      .map((m) => ({ ...m, isUnread: unread.has(m.id) }))
    if (!toMe.length) return
    this.mentions = mergeMentions(this.mentions, toMe, { now: this.now(), maxAgeMs: 14 * DAY, maxItems: 500 })
    this.o.sink.service({ inbox: this.mentions })
    this.schedulePersist()
  }

  /** ルームが既読になったら（未読数 0）、そのルームの自分宛ても既読にする */
  private applyRoomReadState(): void {
    const readRooms = new Set(this.rooms.filter((r) => (r.unreadCount ?? 0) === 0).map((r) => r.id))
    let changed = false
    const next = this.mentions.map((m) => {
      if (m.isUnread && readRooms.has(m.conversationId)) {
        changed = true
        return { ...m, isUnread: false }
      }
      return m
    })
    if (!changed) return
    this.mentions = next
    this.o.sink.service({ inbox: this.mentions })
    this.schedulePersist()
  }

  // ---------------------------------------------------------------- state

  private setHistory(roomId: string, messages: Message[]): void {
    this.histories.delete(roomId)
    this.histories.set(roomId, messages)
    while (this.histories.size > MAX_HISTORY_ROOMS) {
      const oldest = this.histories.keys().next().value as string
      if (oldest === this.watched) break
      this.histories.delete(oldest)
    }
    if (this.watched === roomId) this.emitHistory(roomId, messages, false, null)
  }

  private emitHistory(roomId: string, messages: Message[] | null, loading: boolean, error: unknown): void {
    const snapshot: HistorySnapshot = {
      source: 'chatwork',
      conversationId: roomId,
      messages,
      loading,
      error: error ? toErrorPayload(error) : null,
      fetchedAt: messages ? this.now() : null
    }
    this.o.sink.history(roomId, snapshot)
  }

  private rateStatus() {
    return this.o.governor.status(this.scheduler.size)
  }

  private emitRate(): void {
    if (this.rateTimer || this.stopped) return
    const wait = Math.max(0, 1_000 - (this.now() - this.lastRateAt))
    this.rateTimer = setTimeout(() => {
      this.rateTimer = null
      this.lastRateAt = this.now()
      this.o.sink.service({ rate: this.rateStatus() })
    }, wait)
  }

  private fail(error: unknown): void {
    if (this.stopped || (error instanceof Error && error.message === 'scheduler disposed')) return
    const payload = toErrorPayload(error)
    this.o.sink.service({ error: payload, phase: this.hasData ? 'ready' : 'error', rate: this.rateStatus() })
    // 認証エラーは再接続まで叩き続けない
    if (payload.code === 'auth_error') {
      this.timers.forEach(clearInterval)
      this.timers = []
    }
  }

  // ---------------------------------------------------------------- persistence

  private async restore(): Promise<void> {
    if (!this.o.storage) return
    try {
      const saved = await this.o.storage.load()
      if (!saved || saved.version !== 1 || saved.accountId !== this.o.me.accountId) return
      this.signatures = new Map(Object.entries(saved.signatures))
      this.mentions = mergeMentions([], saved.mentions, { now: this.now(), maxAgeMs: 14 * DAY, maxItems: 500 })
      this.o.sink.service({ inbox: this.mentions })
    } catch (error) {
      console.warn('[chatwork-sync] 保存済みの状態を読み込めませんでした', error)
    }
  }

  private schedulePersist(): void {
    if (!this.o.storage || this.persistTimer || this.stopped) return
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      void this.persist()
    }, 5_000)
  }

  private async persist(): Promise<void> {
    if (!this.o.storage || !this.signatures) return
    try {
      await this.o.storage.save({
        version: 1,
        accountId: this.o.me.accountId,
        savedAt: this.now(),
        signatures: Object.fromEntries(this.signatures),
        mentions: this.mentions
      })
    } catch (error) {
      console.warn('[chatwork-sync] 状態を保存できませんでした', error)
    }
  }
}
