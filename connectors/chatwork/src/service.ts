import type { ChatworkConnectionInfo, Conversation, ConversationKind, Message, Task } from '@omni-desk/contracts'
import { AppError, type RateObserver } from '@omni-desk/connector-core'
import type { ChatworkProvider } from './provider'

const BASE_URL = 'https://api.chatwork.com/v2'

interface RawRoom {
  room_id: number
  name: string
  type: 'my' | 'direct' | 'group'
  role: string
  sticky: boolean
  unread_num: number
  mention_num: number
  mytask_num: number
  message_num: number
  file_num: number
  task_num: number
  icon_path: string
  last_update_time: number
}

interface RawAccount {
  account_id: number
  name: string
  avatar_image_url?: string
}

interface RawMessage {
  message_id: string
  account: RawAccount
  body: string
  send_time: number
  update_time: number
}

interface RawTask {
  task_id: number
  room: { room_id: number; name: string; icon_path?: string }
  assigned_by_account: RawAccount
  message_id: string
  body: string
  limit_time: number
  status: 'open' | 'done'
  limit_type: 'none' | 'date' | 'time'
}

/**
 * Chatwork API v2 の薄いクライアント。
 * レスポンスのたびにレート情報（x-ratelimit-*）を RateObserver へ報告し、429 では解除時刻まで止めさせる。
 */
export class ChatworkApi {
  constructor(
    private readonly token: string,
    private readonly rate?: RateObserver
  ) {}

  get<T>(path: string, query: Record<string, string | number> = {}): Promise<T | null> {
    return this.request<T>('GET', path, { query })
  }

  /** 2025/7 以降、POST/PUT のパラメーターはフォーム（ボディ）で送る */
  post<T>(path: string, form: Record<string, string | number>): Promise<T | null> {
    return this.request<T>('POST', path, { form })
  }

  put<T>(path: string, form: Record<string, string | number>): Promise<T | null> {
    return this.request<T>('PUT', path, { form })
  }

  /** 204 No Content のときは null を返す */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    { query = {}, form }: { query?: Record<string, string | number>; form?: Record<string, string | number> }
  ): Promise<T | null> {
    const url = new URL(`${BASE_URL}${path}`)
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v))
    const headers: Record<string, string> = { 'X-ChatWorkToken': this.token, Accept: 'application/json' }
    let body: URLSearchParams | undefined
    if (form) {
      body = new URLSearchParams(Object.entries(form).map(([k, v]): [string, string] => [k, String(v)]))
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
    }

    this.rate?.record()
    let res: Response
    try {
      res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(20_000) })
    } catch {
      throw new AppError('network', 'Chatwork に接続できませんでした')
    }
    this.reportRate(res)

    if (res.status === 204) return null
    if (res.status === 401) {
      throw new AppError('auth_error', 'Chatwork の API トークンが無効です。設定から再接続してください。')
    }
    if (res.status === 429) {
      const reset = Number(res.headers.get('x-ratelimit-reset'))
      const until = reset > 0 ? reset * 1000 : Date.now() + 60_000
      this.rate?.block(until)
      throw new AppError(
        'rate_limited',
        'Chatwork API の利用上限（5分あたり300回）に達しました。枠が回復するまで自動で待機します。'
      )
    }
    if (!res.ok) {
      const detail = await res
        .json()
        .then((b) => (b as { errors?: string[] }).errors?.join(', '))
        .catch(() => undefined)
      throw new AppError('api_error', `Chatwork API エラー: HTTP ${res.status}${detail ? `（${detail}）` : ''}`)
    }
    return (await res.json()) as T
  }

  private reportRate(res: Response): void {
    const limit = Number(res.headers.get('x-ratelimit-limit'))
    const remaining = Number(res.headers.get('x-ratelimit-remaining'))
    const reset = Number(res.headers.get('x-ratelimit-reset'))
    if (res.headers.has('x-ratelimit-remaining') && Number.isFinite(remaining) && reset > 0) {
      this.rate?.updateFromHeaders({
        limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
        remaining,
        resetAt: reset * 1000
      })
    }
  }
}

export async function verifyChatwork(token: string): Promise<ChatworkConnectionInfo> {
  const me = await new ChatworkApi(token).get<{
    account_id: number
    name: string
    avatar_image_url?: string
    organization_name?: string
  }>('/me')
  if (!me) throw new AppError('api_error', 'Chatwork のアカウント情報を取得できませんでした')
  return {
    accountId: String(me.account_id),
    name: me.name,
    avatarUrl: me.avatar_image_url,
    organizationName: me.organization_name || undefined
  }
}

// ------------------------------------------------------------ normalize (pure)

export function roomKind(type: RawRoom['type']): ConversationKind {
  if (type === 'my') return 'my'
  if (type === 'direct') return 'dm'
  return 'group'
}

export function roomPermalink(roomId: string | number, messageId?: string): string {
  return `https://www.chatwork.com/#!rid${roomId}${messageId ? `-${messageId}` : ''}`
}

/** 自分宛て（To / 返信 / 全員宛て）かどうか */
export function isChatworkMention(body: string, accountId: string): boolean {
  const id = accountId.replace(/[^0-9]/g, '')
  if (!id) return false
  return (
    new RegExp(`\\[To:${id}\\]`, 'i').test(body) ||
    new RegExp(`\\[(?:rp|返信) aid=${id}(?:\\s|\\])`, 'i').test(body) ||
    /\[toall\]/i.test(body)
  )
}

/** 返信タグ付きの本文を作る（Chatwork の画面で「返信」したときと同じ形式） */
export function formatChatworkReply(
  roomId: string,
  replyTo: { messageId: string; authorId: string; authorName: string },
  text: string
): string {
  const aid = replyTo.authorId.replace(/[^0-9]/g, '')
  const mid = replyTo.messageId.replace(/[^0-9]/g, '')
  if (!aid || !mid) throw new AppError('invalid_input', '返信先のメッセージが不正です')
  return `[rp aid=${aid} to=${roomId}-${mid}]${replyTo.authorName}さん\n${text}`
}

export function normalizeRoom(r: RawRoom): Conversation {
  return {
    id: String(r.room_id),
    source: 'chatwork',
    name: r.type === 'my' ? 'マイチャット' : r.name,
    kind: roomKind(r.type),
    iconUrl: r.icon_path || undefined,
    unreadCount: r.unread_num,
    hasUnread: r.unread_num > 0,
    mentionCount: r.mention_num || undefined,
    lastActivityAt: r.last_update_time ? r.last_update_time * 1000 : undefined,
    pinned: r.sticky,
    messageCount: r.message_num,
    myTaskCount: r.mytask_num
  }
}

export function normalizeMessage(m: RawMessage, room: Conversation, myAccountId: string): Message {
  return {
    id: `${room.id}:${m.message_id}`,
    nativeId: String(m.message_id),
    source: 'chatwork',
    conversationId: room.id,
    conversationName: room.name,
    conversationKind: room.kind,
    author: {
      id: String(m.account.account_id),
      name: m.account.name,
      avatarUrl: m.account.avatar_image_url
    },
    text: m.body,
    format: 'chatwork',
    createdAt: m.send_time * 1000,
    editedAt: m.update_time > 0 && m.update_time !== m.send_time ? m.update_time * 1000 : undefined,
    permalink: roomPermalink(room.id, m.message_id),
    isMention: String(m.account.account_id) !== myAccountId && isChatworkMention(m.body, myAccountId)
  }
}

export function normalizeTask(t: RawTask): Task {
  const hasLimit = t.limit_type !== 'none' && t.limit_time > 0
  return {
    id: `chatwork:${t.task_id}`,
    source: 'chatwork',
    text: t.body,
    format: 'chatwork',
    status: t.status === 'done' ? 'done' : 'open',
    dueAt: hasLimit ? t.limit_time * 1000 : undefined,
    dueHasTime: t.limit_type === 'time',
    conversationId: String(t.room.room_id),
    conversationName: t.room.name,
    assignedBy: {
      id: String(t.assigned_by_account.account_id),
      name: t.assigned_by_account.name,
      avatarUrl: t.assigned_by_account.avatar_image_url
    },
    permalink: roomPermalink(t.room.room_id, t.message_id)
  }
}

// ------------------------------------------------------------ provider

/**
 * Chatwork API の呼び出しと正規化だけを担う。キャッシュ・取得の判断・回数の管理は同期エンジン（sync.ts）が行う。
 */
export class ChatworkService implements ChatworkProvider {
  private readonly api: ChatworkApi
  private rooms = new Map<string, Conversation>()

  constructor(
    private readonly conn: ChatworkConnectionInfo & { token: string },
    rate?: RateObserver
  ) {
    this.api = new ChatworkApi(conn.token, rate)
  }

  async listRooms(): Promise<Conversation[]> {
    const raw = (await this.api.get<RawRoom[]>('/rooms')) ?? []
    const rooms = raw.map(normalizeRoom)
    this.rooms = new Map(rooms.map((r) => [r.id, r]))
    return rooms
  }

  private room(roomId: string): Conversation {
    return this.rooms.get(roomId) ?? { id: roomId, source: 'chatwork', name: `ルーム ${roomId}`, kind: 'group' }
  }

  /** 最新 100 件（force=1）。force=0 の差分取得は「前回」の基準が非公開で他の連携と競合し得るので使わない */
  async getMessages(roomId: string): Promise<Message[]> {
    assertRoomId(roomId)
    const raw = await this.api.get<RawMessage[]>(`/rooms/${roomId}/messages`, { force: 1 })
    const room = this.room(roomId)
    return (raw ?? []).map((m) => normalizeMessage(m, room, this.conn.accountId))
  }

  async getTasks(): Promise<Task[]> {
    const open = await this.api.get<RawTask[]>('/my/tasks', { status: 'open' })
    const done = await this.api.get<RawTask[]>('/my/tasks', { status: 'done' })
    return [...(open ?? []), ...(done ?? [])].map(normalizeTask)
  }

  /** 指定したメッセージまでを既読にする（ルーム単位。それより前の未読もまとめて既読になる） */
  async markRead(roomId: string, messageId: string): Promise<void> {
    assertRoomId(roomId)
    if (!/^\d+$/.test(messageId)) throw new AppError('invalid_input', 'メッセージ ID が不正です')
    await this.api.put(`/rooms/${roomId}/messages/read`, { message_id: messageId })
  }

  async sendMessage(roomId: string, body: string): Promise<{ messageId: string }> {
    assertRoomId(roomId)
    const res = await this.api.post<{ message_id: string }>(`/rooms/${roomId}/messages`, { body, self_unread: 0 })
    if (!res?.message_id) throw new AppError('api_error', 'Chatwork への送信結果を確認できませんでした')
    return { messageId: String(res.message_id) }
  }
}

function assertRoomId(roomId: string): void {
  if (!/^\d+$/.test(roomId)) throw new AppError('invalid_input', 'ルーム ID が不正です')
}
