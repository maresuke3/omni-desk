import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, MessagesSquare, Pin, Search } from 'lucide-react'
import { routes, type Conversation, type Message, type Route, type Source } from '@omni-desk/contracts'
import { ChatMessage, ConversationKindIcon, ReplyComposer } from '@omni-desk/message-kit'
import type { FeatureContext } from '@omni-desk/contracts/feature'
import {
  Avatar,
  Button,
  CountBadge,
  EmptyState,
  ErrorNotice,
  NotConnected,
  SkeletonList,
  SOURCE_LABEL,
  SourceMark
} from '@omni-desk/ui'
import { cn } from '@omni-desk/ui'
import { actions, openExternal, useConversations, useHistory, useServiceState, useSettings } from '@omni-desk/client'
import { formatDayHeading, formatShortTime, startOfDay } from '@omni-desk/message-kit'

function conversationUrl(source: Source, c: Conversation, teamUrl?: string): string | undefined {
  if (source === 'chatwork') return `https://www.chatwork.com/#!rid${c.id}`
  return teamUrl ? `${teamUrl.replace(/\/?$/, '/')}archives/${c.id}` : undefined
}

function composerPlaceholder(c: Conversation): string {
  if (c.kind === 'dm') return `${c.name} さんへ送信`
  if (c.kind === 'channel' || c.kind === 'private') return c.source === 'slack' ? `#${c.name} へ投稿` : `${c.name} へ投稿`
  return `${c.name} へ投稿`
}

function ConversationRow({ c, active, onClick }: { c: Conversation; active: boolean; onClick: () => void }) {
  const unread = c.hasUnread || (c.unreadCount ?? 0) > 0
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors',
        active ? 'bg-accent-soft text-accent-text' : 'text-fg-muted hover:bg-hover hover:text-fg'
      )}
    >
      {c.kind === 'dm' ? (
        <Avatar name={c.name} url={c.iconUrl} size={20} />
      ) : c.iconUrl ? (
        <Avatar name={c.name} url={c.iconUrl} size={20} />
      ) : (
        <span className="flex size-5 items-center justify-center">
          <ConversationKindIcon kind={c.kind} className="size-4" />
        </span>
      )}
      <span className={cn('flex-1 truncate text-[13px]', unread && !active && 'font-semibold text-fg')}>{c.name}</span>
      {c.pinned && <Pin className="size-3 shrink-0 text-fg-subtle" />}
      {c.mentionCount ? (
        <CountBadge count={c.mentionCount} tone="danger" />
      ) : c.unreadCount ? (
        <CountBadge count={c.unreadCount} tone="muted" />
      ) : c.hasUnread ? (
        <span className="size-2 rounded-full bg-accent" />
      ) : c.lastActivityAt ? (
        <span className="shrink-0 text-[11px] text-fg-subtle tabular-nums">{formatShortTime(c.lastActivityAt)}</span>
      ) : null}
    </button>
  )
}

function groupConversations(source: Source, list: Conversation[]): { title: string; items: Conversation[] }[] {
  if (source === 'chatwork') {
    return [
      { title: 'ピン留め', items: list.filter((c) => c.pinned) },
      { title: 'チャット', items: list.filter((c) => !c.pinned) }
    ].filter((g) => g.items.length)
  }
  // 未読情報がある（セッション接続）なら最近順の 1 リスト、なければ種類ごと
  if (list.some((c) => c.lastActivityAt)) return [{ title: '最近のアクティビティ', items: list }]
  return [
    { title: 'チャンネル', items: list.filter((c) => c.kind === 'channel' || c.kind === 'private') },
    { title: 'ダイレクトメッセージ', items: list.filter((c) => c.kind === 'dm' || c.kind === 'group') }
  ].filter((g) => g.items.length)
}

function MessagesPane({
  source,
  conversation,
  messages,
  isLoading,
  error,
  onRetry,
  teamUrl
}: {
  source: Source
  conversation: Conversation
  messages: Message[] | null | undefined
  isLoading: boolean
  error: { message: string; code?: string } | null
  onRetry: () => void
  teamUrl?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastId = messages?.[messages.length - 1]?.id

  // 会話を開いたとき・新着が来たときは最下部へ
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [conversation.id, lastId])

  const url = conversationUrl(source, conversation, teamUrl)

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-panel">
      <header className="drag flex h-[60px] shrink-0 items-center gap-3 border-b border-line px-6">
        <span className="flex size-7 items-center justify-center rounded-lg bg-sunken text-fg-muted">
          <ConversationKindIcon kind={conversation.kind} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold">{conversation.name}</p>
          <p className="text-[11.5px] text-fg-subtle">
            {SOURCE_LABEL[source]} · {messages ? `直近 ${messages.length} 件` : '読み込み中'}
          </p>
        </div>
        {url && (
          <Button size="sm" onClick={() => openExternal(url)}>
            {SOURCE_LABEL[source]} で開く
            <ArrowUpRight className="size-3.5" />
          </Button>
        )}
      </header>

      <div ref={scrollRef} className="thin-scroll flex-1 overflow-y-auto py-3">
        {error ? (
          <div className="px-6">
            <ErrorNotice error={error} source={source} onRetry={onRetry} />
          </div>
        ) : isLoading && !messages ? (
          <div className="px-6 py-2">
            <SkeletonList rows={6} />
          </div>
        ) : !messages?.length ? (
          <EmptyState icon={<MessagesSquare className="size-5" />} title="メッセージはありません" />
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1]
            const newDay = !prev || startOfDay(prev.createdAt) !== startOfDay(m.createdAt)
            const compact =
              !newDay && prev.author.id === m.author.id && m.createdAt - prev.createdAt < 5 * 60_000
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="my-3 flex items-center gap-3 px-6">
                    <div className="h-px flex-1 bg-line" />
                    <span className="rounded-full border border-line px-2.5 py-0.5 text-[11px] font-medium text-fg-muted">
                      {formatDayHeading(m.createdAt)}
                    </span>
                    <div className="h-px flex-1 bg-line" />
                  </div>
                )}
                <ChatMessage message={m} compact={compact} />
              </div>
            )
          })
        )}
      </div>

      <footer className="shrink-0 border-t border-line px-6 py-3">
        {/*
         * 会話への投稿。返信先（replyTo）を渡せばメッセージへの返信にもなる。
         * TODO(reply-per-message): メッセージごとの返信を実装するときは、ChatMessage の返信ボタンで選んだ返信先を
         * ここに渡し、header に「〇〇さんへ返信」を表示する（packages/message-kit/src/MessageItems.tsx の同名 TODO 参照）
         */}
        <ReplyComposer
          variant="footer"
          composerKey={`post:${source}:${conversation.id}`}
          target={{ source, conversationId: conversation.id }}
          placeholder={composerPlaceholder(conversation)}
        />
      </footer>
    </div>
  )
}

/** route.params: { source: 'slack' | 'chatwork', conversationId?: string } */
export function ConversationsView({ route, navigate }: FeatureContext) {
  const source: Source = route.params?.source === 'chatwork' ? 'chatwork' : 'slack'
  // サービスを切り替えたら検索欄などの状態をリセットする
  return (
    <ConversationsScreen
      key={source}
      source={source}
      selectedId={route.params?.conversationId ?? null}
      onSelect={(id) => navigate(routes.conversations(source, id), { replace: true })}
      navigate={navigate}
    />
  )
}

function ConversationsScreen({
  source,
  selectedId,
  onSelect,
  navigate
}: {
  source: Source
  selectedId: string | null
  onSelect: (id: string) => void
  navigate: (to: Route) => void
}) {
  const settings = useSettings()
  const service = useServiceState(source)
  const list = useConversations(source)
  // 検索欄の入力はこの画面だけの一時的な状態なのでローカルに持つ
  const [query, setQuery] = useState('')

  // 接続先の切り替えなどで保存済みの ID が存在しない場合は先頭の会話にフォールバック
  const selected = list.conversations?.find((c) => c.id === selectedId) ?? list.conversations?.[0]
  const effectiveId = selected?.id ?? null
  // 開いている間はメインの同期エンジンがこの会話を優先して取得・更新する
  const history = useHistory(source, effectiveId)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (list.conversations ?? []).filter((c) => !q || c.name.toLowerCase().includes(q))
  }, [list.conversations, query])
  const groups = groupConversations(source, filtered)

  if (!service.enabled) {
    return (
      <div className="flex h-full items-center justify-center">
        <NotConnected source={source} onOpenSettings={() => navigate(routes.settings())} />
      </div>
    )
  }

  const subtitle =
    source === 'slack'
      ? settings.slack?.teamName ?? (service.demo ? 'デモワークスペース' : '')
      : settings.chatwork?.organizationName ?? settings.chatwork?.name ?? (service.demo ? 'デモアカウント' : '')

  return (
    <div className="flex h-full">
      <div className="flex w-[290px] shrink-0 flex-col border-r border-line bg-canvas">
        <div className="drag shrink-0 px-4 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <SourceMark source={source} size="md" />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-tight">{SOURCE_LABEL[source]}</p>
              <p className="truncate text-[11.5px] text-fg-subtle">{subtitle}</p>
            </div>
          </div>
          <label className="no-drag mt-3.5 flex h-8 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 text-fg-subtle focus-within:border-accent">
            <Search className="size-3.5" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={source === 'slack' ? 'チャンネル・DM を検索' : 'チャットを検索'}
              className="w-full bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-subtle"
            />
          </label>
        </div>
        <div className="thin-scroll flex-1 overflow-y-auto px-2.5 pb-4">
          {list.error && !list.conversations ? (
            <ErrorNotice
              compact
              error={list.error}
              onRetry={actions.refresh}
              onOpenSettings={() => navigate(routes.settings())}
            />
          ) : list.loading ? (
            <div className="px-1.5 pt-2">
              <SkeletonList rows={8} avatar={false} />
            </div>
          ) : groups.length === 0 ? (
            <p className="px-2.5 py-6 text-center text-[12.5px] text-fg-subtle">見つかりませんでした</p>
          ) : (
            groups.map((g) => (
              <div key={g.title} className="mb-3">
                <p className="px-2.5 pt-2 pb-1 text-[11px] font-semibold text-fg-subtle">
                  {g.title} <span className="font-normal">{g.items.length}</span>
                </p>
                <div className="space-y-px">
                  {g.items.map((c) => (
                    <ConversationRow key={c.id} c={c} active={c.id === effectiveId} onClick={() => onSelect(c.id)} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selected ? (
        <MessagesPane
          key={`${source}:${selected.id}`}
          source={source}
          conversation={selected}
          messages={history?.messages}
          isLoading={!history || history.loading}
          error={history?.error ?? null}
          onRetry={() => actions.watch({ source, conversationId: selected.id })}
          teamUrl={settings.slack?.teamUrl}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center bg-panel">
          <EmptyState icon={<MessagesSquare className="size-5" />} title="会話を選択してください" />
        </div>
      )}
    </div>
  )
}
