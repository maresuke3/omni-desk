import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  historyKey,
  type ApiErrorPayload,
  type InboxStatus,
  type ChatworkStatus,
  type Conversation,
  type HistorySnapshot,
  type Message,
  type PublicSettings,
  type RateStatus,
  type ServiceSnapshot,
  type SlackEmojiMap,
  type Source,
  type Task
} from '@omni-desk/contracts'
import { excludeBlockedSenders } from './blocked-senders'
import { buildInboxEntries, countByStatus, countOpenBySource, type InboxEntry } from './inbox'
import { actions, useAppStore, type OutboxEntry } from './store'

/**
 * 画面向けのフック。ストアから必要な部分だけを選び、加工は useMemo で行う
 * （セレクターで毎回新しい配列を返すと再描画が止まらなくなるため）。
 */

/** 設定。シェルはストアの初期化が終わってから画面を描画するので、Feature からは必ず値がある */
export function useSettings(): PublicSettings {
  const settings = useAppStore((s) => s.settings)
  if (!settings) throw new Error('ストアが初期化されていません（initStore の完了前に描画しています）')
  return settings
}

export function useServiceState(source: Source): { enabled: boolean; connected: boolean; demo: boolean } {
  const demo = useAppStore((s) => !!s.settings?.demoActive)
  const connected = useAppStore((s) => !!s.settings?.[source])
  return { enabled: demo || connected, connected, demo }
}

export function useService(source: Source): ServiceSnapshot {
  return useAppStore((s) => s.services[source])
}

/** まだ一度も取得できていない（＝読み込み中の表示を出すべき）か */
const isLoading = (svc: ServiceSnapshot, field: keyof ServiceSnapshot): boolean =>
  svc[field] === null && svc.phase !== 'error'

export function useConversations(source: Source): {
  conversations: Conversation[] | null
  loading: boolean
  error: ApiErrorPayload | null
} {
  const conversations = useAppStore((s) => s.services[source].conversations)
  const loading = useAppStore((s) => isLoading(s.services[source], 'conversations'))
  const error = useAppStore((s) => s.services[source].error)
  return { conversations, loading, error }
}

/** 会話画面で開いている会話の履歴。開いている間はメインがその会話を優先して取得・更新する */
export function useHistory(source: Source, conversationId: string | null): HistorySnapshot | undefined {
  useEffect(() => {
    if (!conversationId) return
    actions.watch({ source, conversationId })
    return () => actions.watch(null)
  }, [source, conversationId])
  return useAppStore((s) => (conversationId ? s.histories[historyKey(source, conversationId)] : undefined))
}

export function useChatworkStatus(): ChatworkStatus | null {
  return useAppStore((s) => s.services.chatwork.status ?? null)
}

export function useSlackEmoji(): SlackEmojiMap | undefined {
  return useAppStore((s) => s.services.slack.emoji ?? undefined)
}

export function useRateStatus(source: Source): RateStatus | null {
  return useAppStore((s) => s.services[source].rate ?? null)
}

/** 同期中か・最後に同期できた時刻（サイドバーの表示用） */
export function useSyncActivity(): { syncing: boolean; lastSyncedAt: number | null } {
  const syncing = useAppStore((s) => s.services.slack.phase === 'syncing' || s.services.chatwork.phase === 'syncing')
  const lastSyncedAt = useAppStore((s) =>
    Math.max(s.services.slack.lastSyncedAt ?? 0, s.services.chatwork.lastSyncedAt ?? 0)
  )
  return { syncing, lastSyncedAt: lastSyncedAt || null }
}

// ------------------------------------------------------------------ サービス横断

export interface SourceState {
  source: Source
  enabled: boolean
  isLoading: boolean
  error: ApiErrorPayload | null
  refetch: () => void
}

export interface Merged<T> {
  items: T[]
  isLoading: boolean
  sources: SourceState[]
}

export interface UnifiedInbox extends Merged<Message> {
  /** 非表示にした送信者からのため items から除いた件数 */
  hiddenCount: number
}

/**
 * サービスごとの読み込み中・エラーの状態。
 * サービスの状態オブジェクト全体ではなく必要な値だけを選ぶ（API 残り回数の更新などで再描画しないため）。
 */
function useSourceStates(field: 'inbox' | 'tasks'): SourceState[] {
  const slack = useServiceState('slack')
  const chatwork = useServiceState('chatwork')
  const slackLoading = useAppStore((s) => isLoading(s.services.slack, field))
  const cwLoading = useAppStore((s) => isLoading(s.services.chatwork, field))
  const slackError = useAppStore((s) => s.services.slack.error)
  const cwError = useAppStore((s) => s.services.chatwork.error)
  return useMemo(
    () => [
      {
        source: 'slack' as const,
        enabled: slack.enabled,
        isLoading: slack.enabled && slackLoading,
        error: slack.enabled ? slackError : null,
        refetch: actions.refresh
      },
      {
        source: 'chatwork' as const,
        enabled: chatwork.enabled,
        isLoading: chatwork.enabled && cwLoading,
        error: chatwork.enabled ? cwError : null,
        refetch: actions.refresh
      }
    ],
    [slack.enabled, chatwork.enabled, slackLoading, cwLoading, slackError, cwError]
  )
}

/**
 * Slack と Chatwork の自分宛てメッセージを時系列でまとめる。
 * 設定の「非表示にする送信者」はここで除外する（受信箱・ホーム・サイドバーのバッジで結果を揃えるため、
 * Feature 側では個別に絞り込まない）。
 */
export function useUnifiedInbox(): UnifiedInbox {
  const slackInbox = useAppStore((s) => s.services.slack.inbox)
  const cwInbox = useAppStore((s) => s.services.chatwork.inbox)
  const blocked = useAppStore((s) => s.settings?.blockedSenders)
  const slack = useServiceState('slack')
  const chatwork = useServiceState('chatwork')
  const sources = useSourceStates('inbox')
  return useMemo(() => {
    const all = [...(slack.enabled ? (slackInbox ?? []) : []), ...(chatwork.enabled ? (cwInbox ?? []) : [])]
    const items = excludeBlockedSenders(all, blocked).sort((a, b) => b.createdAt - a.createdAt)
    return { items, isLoading: sources.some((x) => x.isLoading), sources, hiddenCount: all.length - items.length }
  }, [slackInbox, cwInbox, blocked, slack.enabled, chatwork.enabled, sources])
}

export function useUnifiedTasks(): Merged<Task> & { slackUnavailableReason?: string } {
  const slackTasks = useAppStore((s) => s.services.slack.tasks)
  const cwTasks = useAppStore((s) => s.services.chatwork.tasks)
  const reason = useAppStore((s) => s.services.slack.tasksUnavailableReason)
  const slack = useServiceState('slack')
  const chatwork = useServiceState('chatwork')
  const sources = useSourceStates('tasks')
  return useMemo(
    () => ({
      items: [...(slack.enabled ? (slackTasks ?? []) : []), ...(chatwork.enabled ? (cwTasks ?? []) : [])],
      isLoading: sources.some((x) => x.isLoading),
      sources,
      slackUnavailableReason: slack.enabled ? reason : undefined
    }),
    [slackTasks, cwTasks, reason, slack.enabled, chatwork.enabled, sources]
  )
}

/** 一定間隔で再描画するための現在時刻（「あとで」の期限切れなどの反映用） */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

export interface InboxView extends UnifiedInbox {
  /** 対応状況つきの全件（新しい順） */
  entries: InboxEntry[]
  counts: Record<InboxStatus, number>
  /** 未対応のサービス別件数 */
  openBySource: Record<Source, number>
}

/**
 * 受信箱の中身（自分宛て ＋ 対応状況）。受信箱・ホーム・サイドバーの件数はすべてここから数える。
 */
export function useInbox(): InboxView {
  const inbox = useUnifiedInbox()
  const states = useAppStore((s) => s.inboxStates)
  const now = useNow()
  return useMemo(() => {
    const entries = buildInboxEntries(inbox.items, states, now)
    return { ...inbox, entries, counts: countByStatus(entries), openBySource: countOpenBySource(entries) }
  }, [inbox, states, now])
}

// ------------------------------------------------------------------ 入力・送信

/** 入力欄の下書きと送信状態 */
export function useComposer(key: string): {
  text: string
  setText: (text: string) => void
  outbox: OutboxEntry | undefined
  sentAt: number | undefined
} {
  const text = useAppStore((s) => s.drafts[key] ?? '')
  const outbox = useAppStore((s) => s.outbox[key])
  const sentAt = useAppStore((s) => s.sentAt[key])
  const setText = useCallback((value: string) => actions.setDraft(key, value), [key])
  return { text, setText, outbox, sentAt }
}

/**
 * 設定フォームなど、1 回限りの操作の実行中・失敗の表示に使う（画面ローカルの一時的な状態）。
 */
export function useAsyncAction<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>
): { run: (...args: A) => Promise<R | undefined>; pending: boolean; error: Error | null } {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const run = useCallback(
    async (...args: A) => {
      setPending(true)
      setError(null)
      try {
        return await fn(...args)
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)))
        return undefined
      } finally {
        setPending(false)
      }
    },
    [fn]
  )
  return { run, pending, error }
}
