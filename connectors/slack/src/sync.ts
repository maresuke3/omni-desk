import type { Conversation, HistorySnapshot, Message, SendMessageInput, SendMessageResult } from '@omni-desk/contracts'
import { AppError, toErrorPayload, type SyncEngine, type SyncSink } from '@omni-desk/connector-core'
import { escapeSlackText } from './normalize'
import type { SlackProvider } from './provider'

/**
 * Slack の同期エンジン。
 * Slack には Chatwork のような「全会話の変化を 1 回で取れる」公開 API が無いので、当面は間隔ごとの取得。
 * 同じ取得が重ならないようにし、認証エラーでは止める。
 * 将来は Socket Mode（Events API を WebSocket で受信）に置き換える（docs/chatwork-sync-design.md 参照）。
 */

const MAX_TEXT_LENGTH = 40_000
/** 受信箱（自分宛て）は会話一覧などより頻繁に取る（search.messages は 1 分 20 回まで使える） */
const INBOX_INTERVAL_MS = 30_000

/**
 * 返信先のスレッドを決める（純粋関数）。
 * チャンネルではスレッドに返信し、DM・グループ DM では元がスレッド内のときだけスレッドに返す。
 */
export function resolveThreadTs(
  replyTo: SendMessageInput['replyTo'],
  kind: Conversation['kind'] | undefined
): string | undefined {
  if (!replyTo) return undefined
  if (replyTo.threadId) return replyTo.threadId
  if (kind === 'dm' || kind === 'group') return undefined
  return replyTo.messageId
}

export interface SlackSyncOptions {
  provider: SlackProvider
  sink: SyncSink
  intervalMs: number
  now?: () => number
}

export class SlackSync implements SyncEngine {
  private readonly now: () => number
  private intervalMs: number
  private conversations: Conversation[] = []
  private readonly histories = new Map<string, Message[]>()
  private readonly running = new Set<string>()
  private watched: string | null = null
  private timers: ReturnType<typeof setInterval>[] = []
  private hasData = false
  private stopped = false

  constructor(private readonly o: SlackSyncOptions) {
    this.now = o.now ?? Date.now
    this.intervalMs = o.intervalMs
  }

  start(): void {
    this.o.sink.service({ phase: 'syncing', error: null })
    void this.syncAll()
    void this.run('emoji', async () => this.o.sink.service({ emoji: await this.o.provider.getEmoji() }), true)
    this.schedule()
  }

  stop(): void {
    this.stopped = true
    this.timers.forEach(clearInterval)
    this.timers = []
  }

  setIntervalMs(ms: number): void {
    if (ms === this.intervalMs) return
    this.intervalMs = ms
    this.schedule()
  }

  refresh(): void {
    void this.syncAll()
    if (this.watched) void this.loadHistory(this.watched)
  }

  async markRead(items: { conversationId: string; nativeId: string }[]): Promise<void> {
    // 会話ごとに一番新しいメッセージまでを既読にする
    const latest = new Map<string, string>()
    for (const { conversationId, nativeId } of items) {
      const cur = latest.get(conversationId)
      if (!cur || Number(nativeId) > Number(cur)) latest.set(conversationId, nativeId)
    }
    await Promise.all([...latest].map(([id, ts]) => this.o.provider.markRead(id, ts)))
    void this.run('inbox', () => this.loadInbox())
  }

  resume(): void {
    this.refresh()
  }

  watch(conversationId: string | null): void {
    const prev = this.watched
    this.watched = conversationId
    if (prev && prev !== conversationId) this.o.sink.history(prev, null)
    if (!conversationId) return
    this.emitHistory(conversationId, this.histories.get(conversationId) ?? null, true, null)
    void this.loadHistory(conversationId)
  }

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    const text = input.text.trim()
    if (!text) throw new AppError('invalid_input', 'メッセージを入力してください')
    if (text.length > MAX_TEXT_LENGTH) throw new AppError('invalid_input', `メッセージは ${MAX_TEXT_LENGTH} 文字以内にしてください`)
    const kind = this.conversations.find((c) => c.id === input.conversationId)?.kind
    const threadTs = resolveThreadTs(input.replyTo, kind)
    const res = await this.o.provider.sendMessage(input.conversationId, escapeSlackText(text), threadTs)
    if (this.watched === input.conversationId) void this.loadHistory(input.conversationId)
    return { nativeId: res.ts }
  }

  // ---------------------------------------------------------------- internals

  private schedule(): void {
    this.timers.forEach(clearInterval)
    this.timers = []
    if (this.stopped) return
    this.timers.push(setInterval(() => void this.run('inbox', () => this.loadInbox()), INBOX_INTERVAL_MS))
    this.timers.push(
      setInterval(() => {
        if (this.watched) void this.loadHistory(this.watched)
      }, this.intervalMs)
    )
    this.timers.push(
      setInterval(() => {
        void this.run('conversations', () => this.loadConversations())
        void this.run('todos', () => this.loadTodos())
      }, this.intervalMs * 2)
    )
  }

  /** 受信箱を最初に出すため並行で取る（会話一覧は大きなワークスペースだと時間がかかる） */
  private async syncAll(): Promise<void> {
    await Promise.all([
      this.run('inbox', () => this.loadInbox()),
      this.run('conversations', () => this.loadConversations()),
      this.run('todos', () => this.loadTodos())
    ])
  }

  /** 同じ種類の取得を重ねない。quiet のときは失敗を画面に出さない（絵文字など補助的なもの） */
  private async run(key: string, fn: () => Promise<void>, quiet = false): Promise<void> {
    if (this.stopped || this.running.has(key)) return
    this.running.add(key)
    try {
      await fn()
    } catch (error) {
      if (!quiet) this.fail(error)
    } finally {
      this.running.delete(key)
    }
  }

  private async loadConversations(): Promise<void> {
    this.conversations = await this.o.provider.listConversations()
    this.hasData = true
    this.o.sink.service({ conversations: this.conversations, phase: 'ready', error: null, lastSyncedAt: this.now() })
  }

  private async loadInbox(): Promise<void> {
    const inbox = await this.o.provider.getInbox()
    this.hasData = true
    this.o.sink.service({ inbox, phase: 'ready', error: null, lastSyncedAt: this.now() })
  }

  private async loadTodos(): Promise<void> {
    const todos = await this.o.provider.getTodos()
    this.o.sink.service({ tasks: todos.tasks, tasksUnavailableReason: todos.unavailableReason })
  }

  private async loadHistory(conversationId: string): Promise<void> {
    await this.run(`history:${conversationId}`, async () => {
      try {
        const messages = await this.o.provider.getHistory(conversationId)
        this.histories.set(conversationId, messages)
        if (this.watched === conversationId) this.emitHistory(conversationId, messages, false, null)
      } catch (error) {
        if (this.watched === conversationId) {
          this.emitHistory(conversationId, this.histories.get(conversationId) ?? null, false, error)
        }
        throw error
      }
    })
  }

  private emitHistory(conversationId: string, messages: Message[] | null, loading: boolean, error: unknown): void {
    const snapshot: HistorySnapshot = {
      source: 'slack',
      conversationId,
      messages,
      loading,
      error: error ? toErrorPayload(error) : null,
      fetchedAt: messages ? this.now() : null
    }
    this.o.sink.history(conversationId, snapshot)
  }

  private fail(error: unknown): void {
    if (this.stopped) return
    const payload = toErrorPayload(error)
    this.o.sink.service({ error: payload, phase: this.hasData ? 'ready' : 'error' })
    if (payload.code === 'auth_error') {
      this.timers.forEach(clearInterval)
      this.timers = []
    }
  }
}
