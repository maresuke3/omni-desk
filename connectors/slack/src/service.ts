import type {
  Conversation,
  Message,
  Person,
  SlackAuthType,
  SlackConnectionInfo,
  SlackEmojiMap,
  SlackTodoResult,
  Task
} from '@omni-desk/contracts'
import { AppError, mapWithConcurrency, sleep } from '@omni-desk/connector-core'
import type { SlackProvider } from './provider'
import {
  buildPermalink,
  collectUserIds,
  conversationKind,
  decorateMentions,
  extractText,
  isMentionOf,
  isVisibleMessage,
  prettifyMpimName,
  selectOpenTodos,
  slackTsToMs,
  toFiles,
  threadTsFromPermalink,
  toReactions,
  type RawSavedItem,
  type RawSlackConversation,
  type RawSlackMessage
} from './normalize'

type Params = Record<string, string | number | boolean | undefined>

const AUTH_ERRORS = new Set([
  'invalid_auth',
  'not_authed',
  'token_revoked',
  'token_expired',
  'account_inactive',
  'no_permission'
])

/**
 * Slack Web API の薄いクライアント。
 * - user トークン (xoxp): 公式 API
 * - session トークン (xoxc + d Cookie): Web クライアントと同じ認証。To-dos 取得に必要
 */
export class SlackApi {
  constructor(
    private readonly token: string,
    private readonly cookie?: string,
    private readonly origin = 'https://slack.com'
  ) {}

  async call<T = Record<string, unknown>>(method: string, params: Params = {}, attempt = 0): Promise<T> {
    const body = new URLSearchParams({ token: this.token })
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) body.set(key, String(value))
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8'
    }
    if (this.cookie) {
      // DevTools からコピーした値は URL エンコード済みのことが多いので二重エンコードしない
      const value = this.cookie.includes('%') ? this.cookie : encodeURIComponent(this.cookie)
      headers.Cookie = `d=${value}`
      headers.Origin = 'https://app.slack.com'
    }

    let res: Response
    try {
      res = await fetch(`${this.origin}/api/${method}`, {
        method: 'POST',
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000)
      })
    } catch {
      throw new AppError('network', `Slack に接続できませんでした（${method}）`)
    }

    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after') ?? '5')
      if (attempt < 2 && wait <= 30) {
        await sleep(wait * 1000)
        return this.call<T>(method, params, attempt + 1)
      }
      throw new AppError('rate_limited', 'Slack のレート制限に達しました。しばらく待ってから再試行してください。')
    }
    if (res.status >= 300 && res.status < 400) {
      throw new AppError('auth_error', 'Slack のセッションが無効です。設定から再接続してください。')
    }
    if (!res.ok) {
      throw new AppError('api_error', `Slack API エラー: HTTP ${res.status}（${method}）`)
    }

    const data = (await res.json()) as { ok: boolean; error?: string; needed?: string } & T
    if (!data.ok) throw slackError(method, data.error, data.needed)
    return data
  }
}

export class SlackMethodError extends AppError {
  constructor(
    readonly slackCode: string,
    message: string,
    code: ConstructorParameters<typeof AppError>[0]
  ) {
    super(code, message)
  }
}

function slackError(method: string, error = 'unknown_error', needed?: string): SlackMethodError {
  if (AUTH_ERRORS.has(error)) {
    return new SlackMethodError(error, 'Slack の認証が無効です。設定から再接続してください。', 'auth_error')
  }
  if (error === 'missing_scope') {
    return new SlackMethodError(
      error,
      `Slack トークンの権限が不足しています（${method}${needed ? ` / 必要: ${needed}` : ''}）`,
      'api_error'
    )
  }
  if (error === 'ratelimited') {
    return new SlackMethodError(error, 'Slack のレート制限に達しました。', 'rate_limited')
  }
  if (error === 'not_allowed_token_type' || error === 'unknown_method') {
    return new SlackMethodError(error, `このトークンでは ${method} を利用できません`, 'unsupported')
  }
  return new SlackMethodError(error, `Slack API エラー: ${error}（${method}）`, 'api_error')
}

export function detectSlackAuthType(token: string): SlackAuthType {
  if (token.startsWith('xoxp-')) return 'user'
  if (token.startsWith('xoxc-')) return 'session'
  if (token.startsWith('xoxb-')) {
    throw new AppError(
      'invalid_input',
      'Bot トークン (xoxb) では自分宛てメッセージを取得できません。ユーザートークン (xoxp) を使ってください。'
    )
  }
  throw new AppError('invalid_input', 'Slack トークンは xoxp- または xoxc- で始まる必要があります。')
}

/** トークンを検証して接続情報を返す */
export async function verifySlack(token: string, cookie?: string): Promise<SlackConnectionInfo> {
  const authType = detectSlackAuthType(token)
  if (authType === 'session' && !cookie) {
    throw new AppError('invalid_input', 'ブラウザセッション接続には d Cookie の値が必要です。')
  }
  const api = new SlackApi(token, authType === 'session' ? cookie : undefined)
  const res = await api.call<{ url: string; team: string; user: string; user_id: string }>('auth.test')
  return { authType, teamName: res.team, teamUrl: res.url, userId: res.user_id, userName: res.user }
}

interface CountEntry {
  id: string
  latest?: string
  last_read?: string
  has_unreads?: boolean
  mention_count?: number
}

interface CachedConversation {
  id: string
  name: string
  kind: Conversation['kind']
}

const USER_TTL_MS = 6 * 60 * 60 * 1000

export class SlackService implements SlackProvider {
  private readonly api: SlackApi
  private readonly users = new Map<string, { person: Person; at: number }>()
  private readonly conversations = new Map<string, CachedConversation>()
  private counts: { at: number; map: Map<string, CountEntry> } | null = null
  private emoji: { at: number; data: SlackEmojiMap } | null = null
  private allUsersLoadedAt = 0

  constructor(private readonly conn: SlackConnectionInfo & { token: string; cookie?: string }) {
    const isSession = conn.authType === 'session'
    // セッショントークンはワークスペースのドメインに対して呼ぶ（Web クライアントと同じ）
    const origin = isSession && conn.teamUrl ? conn.teamUrl.replace(/\/$/, '') : 'https://slack.com'
    this.api = new SlackApi(conn.token, isSession ? conn.cookie : undefined, origin)
  }

  private get isSession(): boolean {
    return this.conn.authType === 'session'
  }

  // ---------------------------------------------------------------- users

  private person(id: string): Person {
    return this.users.get(id)?.person ?? { id, name: id }
  }

  private userName(id: string): string | undefined {
    return this.users.get(id)?.person.name
  }

  private storeUser(u: {
    id: string
    name?: string
    real_name?: string
    deleted?: boolean
    profile?: { display_name?: string; real_name?: string; image_48?: string; image_72?: string }
  }): void {
    const name =
      u.profile?.display_name?.trim() || u.profile?.real_name?.trim() || u.real_name || u.name || u.id
    this.users.set(u.id, {
      person: { id: u.id, name, avatarUrl: u.profile?.image_72 ?? u.profile?.image_48 },
      at: Date.now()
    })
  }

  /** 未解決のユーザーを解決する。多い場合は users.list でまとめて取る */
  private async resolveUsers(ids: Iterable<string>): Promise<void> {
    const now = Date.now()
    const missing = [...new Set(ids)].filter((id) => {
      const hit = this.users.get(id)
      return id && (!hit || now - hit.at > USER_TTL_MS)
    })
    if (missing.length === 0) return

    if (missing.length > 40 && now - this.allUsersLoadedAt > USER_TTL_MS) {
      await this.loadAllUsers()
      return
    }
    await mapWithConcurrency(missing.slice(0, 80), 5, async (id) => {
      try {
        const res = await this.api.call<{ user: Parameters<SlackService['storeUser']>[0] }>(
          'users.info',
          { user: id }
        )
        this.storeUser(res.user)
      } catch (error) {
        if (error instanceof AppError && error.code === 'auth_error') throw error
        // 外部ワークスペースのユーザーなどは解決できないことがある
        this.users.set(id, { person: { id, name: id }, at: now })
      }
    })
  }

  private async loadAllUsers(): Promise<void> {
    const members = await this.paginate<Parameters<SlackService['storeUser']>[0]>(
      'users.list',
      { limit: 200 },
      'members',
      25
    )
    members.forEach((m) => this.storeUser(m))
    this.allUsersLoadedAt = Date.now()
  }

  // ---------------------------------------------------------------- helpers

  private async paginate<T>(method: string, params: Params, key: string, maxPages: number): Promise<T[]> {
    const out: T[] = []
    let cursor: string | undefined
    for (let page = 0; page < maxPages; page++) {
      const res = await this.api.call<Record<string, unknown>>(method, { ...params, cursor })
      out.push(...((res[key] as T[] | undefined) ?? []))
      cursor = (res.response_metadata as { next_cursor?: string } | undefined)?.next_cursor || undefined
      if (!cursor) break
    }
    return out
  }

  /**
   * 未読情報（client.counts は Web クライアント用の非公開 API）。
   * セッション接続時のみ試し、失敗しても致命的にしない。
   */
  private async getCounts(maxAgeMs = 20_000): Promise<Map<string, CountEntry> | null> {
    if (!this.isSession) return null
    if (this.counts && Date.now() - this.counts.at < maxAgeMs) return this.counts.map
    try {
      const res = await this.api.call<{
        channels?: CountEntry[]
        mpims?: CountEntry[]
        ims?: CountEntry[]
      }>('client.counts', { thread_counts_by_channel: false, org_wide_aware: true })
      const map = new Map<string, CountEntry>()
      for (const entry of [...(res.channels ?? []), ...(res.mpims ?? []), ...(res.ims ?? [])]) {
        if (entry?.id) map.set(entry.id, entry)
      }
      this.counts = { at: Date.now(), map }
      return map
    } catch (error) {
      if (error instanceof AppError && error.code === 'auth_error') throw error
      console.warn('[slack] client.counts を取得できませんでした', error)
      return null
    }
  }

  private conversationName(c: RawSlackConversation): string {
    if (c.is_im) return c.user ? (this.userName(c.user) ?? c.user) : 'DM'
    if (c.is_mpim) return prettifyMpimName(c.name)
    return c.name ?? c.id
  }

  private async getConversationMeta(id: string): Promise<CachedConversation> {
    const hit = this.conversations.get(id)
    if (hit) return hit
    try {
      const res = await this.api.call<{ channel: RawSlackConversation }>('conversations.info', {
        channel: id
      })
      if (res.channel.is_im && res.channel.user) await this.resolveUsers([res.channel.user])
      const meta = {
        id,
        name: this.conversationName(res.channel),
        kind: conversationKind(res.channel)
      }
      this.conversations.set(id, meta)
      return meta
    } catch (error) {
      if (error instanceof AppError && error.code === 'auth_error') throw error
      return { id, name: id, kind: 'channel' }
    }
  }

  private decorate(text: string): string {
    return decorateMentions(
      text,
      (id) => this.userName(id),
      (id) => this.conversations.get(id)?.name
    )
  }

  private toMessage(
    m: RawSlackMessage,
    conv: CachedConversation,
    extra: Partial<Message> = {}
  ): Message {
    const isBot = Boolean(m.bot_id) || m.subtype === 'bot_message'
    const author: Person =
      m.user && !(isBot && !this.users.has(m.user))
        ? this.person(m.user)
        : {
            id: m.bot_id ?? m.user ?? 'bot',
            name: m.bot_profile?.name ?? m.username ?? 'Bot',
            avatarUrl: m.bot_profile?.icons?.image_72 ?? m.bot_profile?.icons?.image_48 ?? m.icons?.image_48
          }
    const raw = extractText(m)
    return {
      id: `${conv.id}:${m.ts}`,
      nativeId: m.ts,
      threadId: m.thread_ts && m.thread_ts !== m.ts ? m.thread_ts : undefined,
      source: 'slack',
      conversationId: conv.id,
      conversationName: conv.name,
      conversationKind: conv.kind,
      author,
      text: this.decorate(raw),
      format: 'slack',
      createdAt: slackTsToMs(m.ts),
      editedAt: m.edited ? slackTsToMs(m.edited.ts) : undefined,
      permalink: buildPermalink(this.conn.teamUrl, conv.id, m.ts, m.thread_ts),
      isMention: isMentionOf(raw, this.conn.userId),
      isBot,
      replyCount: m.reply_count,
      reactions: toReactions(m),
      files: toFiles(m),
      ...extra
    }
  }

  private usersIn(messages: RawSlackMessage[]): string[] {
    const ids: string[] = []
    for (const m of messages) {
      if (m.user) ids.push(m.user)
      ids.push(...collectUserIds(extractText(m)))
    }
    return ids
  }

  // ---------------------------------------------------------------- public

  async listConversations(): Promise<Conversation[]> {
    const raw = await this.paginate<RawSlackConversation>(
      'users.conversations',
      { types: 'public_channel,private_channel,mpim,im', exclude_archived: true, limit: 200 },
      'channels',
      15
    )
    const active = raw.filter((c) => !c.is_archived && !c.is_user_deleted)
    await this.resolveUsers(active.filter((c) => c.is_im && c.user).map((c) => c.user as string))
    const counts = await this.getCounts()

    const list: Conversation[] = active.map((c) => {
      const kind = conversationKind(c)
      const name = this.conversationName(c)
      this.conversations.set(c.id, { id: c.id, name, kind })
      const count = counts?.get(c.id)
      return {
        id: c.id,
        source: 'slack',
        name,
        kind,
        iconUrl: c.is_im && c.user ? this.users.get(c.user)?.person.avatarUrl : undefined,
        hasUnread: count?.has_unreads,
        mentionCount: count?.mention_count || undefined,
        lastActivityAt: count?.latest ? slackTsToMs(count.latest) : undefined
      }
    })

    return list.sort((a, b) => {
      if (counts) return (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0)
      const order = { channel: 0, private: 0, group: 1, dm: 1, my: 2 }
      return order[a.kind] - order[b.kind] || a.name.localeCompare(b.name, 'ja')
    })
  }

  async getHistory(conversationId: string): Promise<Message[]> {
    const [res, conv, counts] = await Promise.all([
      this.api.call<{ messages: RawSlackMessage[] }>('conversations.history', {
        channel: conversationId,
        limit: 60
      }),
      this.getConversationMeta(conversationId),
      this.getCounts()
    ])
    const messages = res.messages.filter(isVisibleMessage)
    await this.resolveUsers(this.usersIn(messages))
    const lastRead = counts?.get(conversationId)?.last_read
    return messages
      .map((m) =>
        this.toMessage(m, conv, {
          isUnread: lastRead ? Number(m.ts) > Number(lastRead) : undefined
        })
      )
      .reverse()
  }

  /** 自分宛てメンション＋（セッション接続時）未読 DM */
  async getInbox(): Promise<Message[]> {
    const [mentions, unreadDms] = await Promise.all([this.searchMentions(), this.unreadDirectMessages()])
    const byId = new Map<string, Message>()
    for (const m of [...unreadDms, ...mentions]) byId.set(m.id, { ...byId.get(m.id), ...m })
    return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt)
  }

  private async searchMentions(): Promise<Message[]> {
    type Match = RawSlackMessage & {
      channel: RawSlackConversation & { name?: string }
      permalink?: string
    }
    const [res, counts] = await Promise.all([
      this.api.call<{ messages: { matches: Match[] } }>('search.messages', {
        query: `<@${this.conn.userId}>`,
        sort: 'timestamp',
        sort_dir: 'desc',
        count: 100
      }),
      this.getCounts()
    ])
    const matches = (res.messages?.matches ?? []).filter((m) => m.user !== this.conn.userId)
    await this.resolveUsers([
      ...this.usersIn(matches),
      ...matches.filter((m) => m.channel?.is_im && m.channel.user).map((m) => m.channel.user as string)
    ])
    return matches.map((m) => {
      const c = m.channel ?? { id: 'unknown' }
      const known = this.conversations.get(c.id)
      const conv: CachedConversation = known ?? {
        id: c.id,
        name: this.conversationName(c),
        kind: conversationKind(c)
      }
      // 既読位置が分かる（ブラウザセッション接続の）場合は未読かどうかも付ける
      const lastRead = counts?.get(c.id)?.last_read
      return this.toMessage(m, conv, {
        permalink: m.permalink,
        isMention: true,
        isUnread: lastRead ? Number(m.ts) > Number(lastRead) : undefined,
        threadId: threadTsFromPermalink(m.permalink)
      })
    })
  }

  private async unreadDirectMessages(): Promise<Message[]> {
    const counts = await this.getCounts()
    if (!counts) return []
    const unread = [...counts.values()]
      .filter((c) => c.has_unreads && /^[DG]/.test(c.id))
      .sort((a, b) => Number(b.latest ?? 0) - Number(a.latest ?? 0))
      .slice(0, 6)

    const perConversation = await mapWithConcurrency(unread, 3, async (entry) => {
      const conv = await this.getConversationMeta(entry.id)
      if (conv.kind !== 'dm' && conv.kind !== 'group') return []
      const res = await this.api.call<{ messages: RawSlackMessage[] }>('conversations.history', {
        channel: entry.id,
        oldest: entry.last_read,
        limit: 10
      })
      const messages = res.messages.filter(
        (m) => isVisibleMessage(m) && m.user !== this.conn.userId
      )
      await this.resolveUsers(this.usersIn(messages))
      return messages.map((m) => this.toMessage(m, conv, { isUnread: true, isMention: true }))
    })
    return perConversation.flat()
  }

  async getTodos(): Promise<SlackTodoResult> {
    let items: RawSavedItem[]
    try {
      items = await this.listSavedItems()
    } catch (error) {
      if (error instanceof SlackMethodError && error.code !== 'network' && error.code !== 'rate_limited') {
        if (error.code === 'auth_error' && this.isSession) throw error
        return {
          tasks: [],
          unavailableReason: this.isSession
            ? `To-dos を取得できませんでした（${error.slackCode}）。Slack 側の仕様変更の可能性があります。`
            : 'Slack の To-dos は公開 API が無いため、ブラウザセッション（xoxc + d Cookie）で接続した場合のみ表示できます。'
        }
      }
      throw error
    }

    const todos = selectOpenTodos(items)

    // メッセージ本文をまとめて取得
    const messageItems = todos.filter((item) => item.item_type === 'message' && item.ts)
    const lookup = await this.fetchMessagesByTs(
      messageItems.map((item) => ({ channel: item.item_id, ts: item.ts as string }))
    )
    const channelIds = [...new Set(messageItems.map((item) => item.item_id))]
    await mapWithConcurrency(channelIds, 4, (id) => this.getConversationMeta(id))
    await this.resolveUsers(this.usersIn([...lookup.values()]))

    const tasks: Task[] = todos.map((item) => {
      const due = Number(item.date_due ?? 0)
      const created = Number(item.date_created ?? 0)
      const base: Task = {
        id: `slack:${item.item_type}:${item.item_id}:${item.ts ?? ''}`,
        source: 'slack',
        text: item.text ?? item.description ?? '',
        format: 'slack',
        status: 'open',
        dueAt: due > 0 ? due * 1000 : undefined,
        dueHasTime: true,
        createdAt: created > 0 ? created * 1000 : undefined
      }
      if (item.item_type !== 'message' || !item.ts) {
        return { ...base, text: base.text || 'To-do' }
      }
      const conv = this.conversations.get(item.item_id)
      const msg = lookup.get(`${item.item_id}:${item.ts}`)
      const message = msg && conv ? this.toMessage(msg, conv) : undefined
      return {
        ...base,
        text: message?.text || '（メッセージを取得できませんでした）',
        conversationId: item.item_id,
        conversationName: conv?.name,
        assignedBy: message?.author,
        permalink: buildPermalink(this.conn.teamUrl, item.item_id, item.ts, msg?.thread_ts)
      }
    })
    return { tasks }
  }

  /** saved.list（非公開 API）。未完了 To-do のみ取得し、filter が通らない場合は無指定で再試行する */
  private async listSavedItems(): Promise<RawSavedItem[]> {
    try {
      return await this.paginate<RawSavedItem>(
        'saved.list',
        { count: 100, filter: 'todo' },
        'saved_items',
        5
      )
    } catch (error) {
      if (error instanceof SlackMethodError && /invalid_arg|invalid_filter/.test(error.slackCode)) {
        return this.paginate<RawSavedItem>('saved.list', { count: 100 }, 'saved_items', 5)
      }
      throw error
    }
  }

  /** messages.list（非公開 API）でスレッド返信も含めてまとめて取得する */
  private async fetchMessagesByTs(
    refs: { channel: string; ts: string }[]
  ): Promise<Map<string, RawSlackMessage>> {
    const lookup = new Map<string, RawSlackMessage>()
    if (refs.length === 0) return lookup
    const grouped = new Map<string, string[]>()
    for (const { channel, ts } of refs) grouped.set(channel, [...(grouped.get(channel) ?? []), ts])
    const groups = [...grouped.entries()].map(([channel, timestamps]) => ({ channel, timestamps }))
    const batches: (typeof groups)[] = []
    for (let i = 0; i < groups.length; i += 10) batches.push(groups.slice(i, i + 10))

    await mapWithConcurrency(batches, 3, async (batch) => {
      try {
        const res = await this.api.call<{ messages?: Record<string, RawSlackMessage[]> }>(
          'messages.list',
          { message_ids: JSON.stringify(batch) }
        )
        for (const [channel, msgs] of Object.entries(res.messages ?? {})) {
          for (const m of msgs) lookup.set(`${channel}:${m.ts}`, m)
        }
      } catch (error) {
        if (error instanceof AppError && error.code === 'auth_error') throw error
        console.warn('[slack] messages.list に失敗しました', error)
      }
    })
    return lookup
  }

  /** 会話を指定したメッセージまで既読にする（ユーザートークンでは channels:write などの権限が必要） */
  async markRead(conversationId: string, ts: string): Promise<void> {
    await this.api.call('conversations.mark', { channel: conversationId, ts })
    this.counts = null
  }

  async sendMessage(conversationId: string, text: string, threadTs?: string): Promise<{ ts: string }> {
    const res = await this.api.call<{ ts: string }>('chat.postMessage', {
      channel: conversationId,
      text,
      thread_ts: threadTs
    })
    return { ts: res.ts }
  }

  async getEmoji(): Promise<SlackEmojiMap> {
    if (this.emoji && Date.now() - this.emoji.at < USER_TTL_MS) return this.emoji.data
    const res = await this.api.call<{ emoji: Record<string, string> }>('emoji.list')
    const custom: Record<string, string> = {}
    const aliases: Record<string, string> = {}
    for (const [name, value] of Object.entries(res.emoji ?? {})) {
      if (value.startsWith('alias:')) aliases[name] = value.slice('alias:'.length)
      else custom[name] = value
    }
    const data = { custom, aliases }
    this.emoji = { at: Date.now(), data }
    return data
  }
}
