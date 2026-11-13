import type { ConversationKind, FileRef, Reaction } from '@omni-desk/contracts'

/**
 * Slack API のレスポンスを正規化する純粋関数群（テスト可能なように分離）。
 */

export interface RawSlackMessage {
  type?: string
  subtype?: string
  user?: string
  bot_id?: string
  username?: string
  text?: string
  ts: string
  thread_ts?: string
  reply_count?: number
  edited?: { ts: string }
  bot_profile?: { name?: string; icons?: Record<string, string> }
  icons?: Record<string, string>
  reactions?: { name: string; count: number }[]
  files?: { name?: string; title?: string; permalink?: string }[]
  attachments?: { pretext?: string; title?: string; text?: string; fallback?: string }[]
  blocks?: unknown[]
}

export interface RawSlackConversation {
  id: string
  name?: string
  user?: string
  is_channel?: boolean
  is_group?: boolean
  is_im?: boolean
  is_mpim?: boolean
  is_private?: boolean
  is_archived?: boolean
  is_user_deleted?: boolean
}

/** 表示しないシステム系サブタイプ */
const HIDDEN_SUBTYPES = new Set([
  'channel_join',
  'channel_leave',
  'channel_topic',
  'channel_purpose',
  'channel_name',
  'channel_archive',
  'channel_unarchive',
  'group_join',
  'group_leave',
  'group_topic',
  'group_purpose',
  'group_name',
  'tombstone',
  'message_deleted',
  'message_changed'
])

export function isVisibleMessage(m: RawSlackMessage): boolean {
  return !m.subtype || !HIDDEN_SUBTYPES.has(m.subtype)
}

/** "1700000000.123456" → ms */
export function slackTsToMs(ts: string | number | undefined): number {
  if (ts === undefined) return 0
  return Math.round(Number(ts) * 1000)
}

export function conversationKind(c: {
  is_im?: boolean
  is_mpim?: boolean
  is_private?: boolean
  is_group?: boolean
}): ConversationKind {
  if (c.is_im) return 'dm'
  if (c.is_mpim) return 'group'
  if (c.is_private || c.is_group) return 'private'
  return 'channel'
}

/** "mpdm-taro--hanako--jiro-1" → "taro, hanako, jiro" */
export function prettifyMpimName(name: string | undefined): string {
  if (!name) return 'グループ DM'
  if (!name.startsWith('mpdm-')) return name
  return name
    .replace(/^mpdm-/, '')
    .replace(/-\d+$/, '')
    .split('--')
    .filter(Boolean)
    .join(', ')
}

export function buildPermalink(
  teamUrl: string | undefined,
  channelId: string,
  ts: string,
  threadTs?: string
): string | undefined {
  if (!teamUrl) return undefined
  const base = teamUrl.endsWith('/') ? teamUrl : `${teamUrl}/`
  const url = `${base}archives/${channelId}/p${ts.replace('.', '')}`
  return threadTs && threadTs !== ts ? `${url}?thread_ts=${threadTs}&cid=${channelId}` : url
}

/** 本文が空の bot メッセージなどは attachments / blocks からテキストを拾う */
export function extractText(m: RawSlackMessage): string {
  if (m.text && m.text.trim()) return m.text
  const fromAttachments = (m.attachments ?? [])
    .map((a) => [a.pretext, a.title, a.text || a.fallback].filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n')
  if (fromAttachments) return fromAttachments
  return blocksToText(m.blocks)
}

function blocksToText(blocks: unknown[] | undefined): string {
  if (!Array.isArray(blocks)) return ''
  const out: string[] = []
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const n = node as Record<string, unknown>
    if (n.type === 'section' || n.type === 'header') {
      const text = n.text as { text?: string } | undefined
      if (text?.text) out.push(text.text)
      return
    }
    if (n.type === 'context' && Array.isArray(n.elements)) {
      for (const el of n.elements as { text?: string }[]) if (el?.text) out.push(el.text)
      return
    }
    if (n.type === 'rich_text' && Array.isArray(n.elements)) {
      out.push((n.elements as unknown[]).map(richTextToString).join('\n'))
    }
  }
  blocks.forEach(visit)
  return out.join('\n')
}

function richTextToString(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as Record<string, unknown>
  switch (n.type) {
    case 'text':
      return String(n.text ?? '')
    case 'link':
      return n.text ? `<${n.url}|${n.text}>` : `<${n.url}>`
    case 'user':
      return `<@${n.user_id}>`
    case 'channel':
      return `<#${n.channel_id}>`
    case 'emoji':
      return `:${n.name}:`
    case 'broadcast':
      return `<!${n.range}>`
    default:
      if (Array.isArray(n.elements)) {
        const joiner = n.type === 'rich_text_list' ? '\n' : ''
        const inner = (n.elements as unknown[]).map(richTextToString).join(joiner)
        if (n.type === 'rich_text_preformatted') return '```' + inner + '```'
        if (n.type === 'rich_text_quote') return inner.replace(/^/gm, '> ')
        return inner
      }
      return ''
  }
}

/** 本文中のユーザー ID を集める（名前解決用） */
export function collectUserIds(text: string): string[] {
  const ids = new Set<string>()
  for (const match of text.matchAll(/<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g)) ids.add(match[1])
  return [...ids]
}

/**
 * `<@U123>` → `<@U123|名前>`、`<#C123>` → `<#C123|名前>` に置き換える。
 * レンダラー側が名前解決の API を呼ばなくて済むようにする。
 */
export function decorateMentions(
  text: string,
  userName: (id: string) => string | undefined,
  channelName: (id: string) => string | undefined
): string {
  return text
    .replace(/<@([UW][A-Z0-9]+)>/g, (raw, id: string) => {
      const name = userName(id)
      return name ? `<@${id}|${name}>` : raw
    })
    .replace(/<#([CGD][A-Z0-9]+)>/g, (raw, id: string) => {
      const name = channelName(id)
      return name ? `<#${id}|${name}>` : raw
    })
}

export function isMentionOf(text: string, userId: string): boolean {
  return (
    text.includes(`<@${userId}>`) ||
    text.includes(`<@${userId}|`) ||
    /<!(here|channel|everyone)(\|[^>]*)?>/.test(text)
  )
}

export function toReactions(m: RawSlackMessage): Reaction[] | undefined {
  if (!m.reactions?.length) return undefined
  return m.reactions.map((r) => ({ name: r.name, count: r.count }))
}

export function toFiles(m: RawSlackMessage): FileRef[] | undefined {
  if (!m.files?.length) return undefined
  return m.files.map((f) => ({ name: f.name ?? f.title ?? 'ファイル', url: f.permalink }))
}

/** saved.list のアイテム（非公開 API。フィールドは観測ベース） */
export interface RawSavedItem {
  item_id: string
  item_type: string
  ts?: string
  date_created?: number | string
  date_due?: number | string
  date_completed?: number | string
  todo_state?: string
  state?: string
  text?: string
  description?: string
}

export type SavedItemKind = 'todo-open' | 'todo-done' | 'saved'

/**
 * saved.list のアイテムが To-do かどうかを判定する。
 * todo_state が最も信頼できる。無い場合は state / 期限から推定する。
 */
export function classifySavedItem(item: RawSavedItem): SavedItemKind {
  const completed =
    item.todo_state === 'completed' ||
    item.state === 'completed' ||
    Number(item.date_completed ?? 0) > 0
  if (item.todo_state === 'saved') return 'saved'
  if (item.todo_state === 'to_do') return completed ? 'todo-done' : 'todo-open'
  if (completed) return 'todo-done'
  if (item.item_type === 'reminder' || Number(item.date_due ?? 0) > 0) return 'todo-open'
  return 'saved'
}

/** saved.list の結果から未完了の To-do のみを抽出する */
export function selectOpenTodos(items: RawSavedItem[]): RawSavedItem[] {
  return items.filter((item) => classifySavedItem(item) === 'todo-open')
}

/** 送信するテキストの &, <, > をエスケープする（Slack の制御文字として解釈されないように） */
export function escapeSlackText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** パーマリンクの thread_ts（スレッド内の投稿なら親の ts） */
export function threadTsFromPermalink(permalink: string | undefined): string | undefined {
  return permalink ? /[?&]thread_ts=([\d.]+)/.exec(permalink)?.[1] : undefined
}
