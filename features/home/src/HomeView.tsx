import type { ReactNode } from 'react'
import { AtSign, CalendarClock, ChevronRight, CircleCheckBig, Inbox, ListChecks, Mail, MessagesSquare, Users } from 'lucide-react'
import { routes, type Message } from '@omni-desk/contracts'
import { ConversationKindIcon } from '@omni-desk/message-kit'
import type { FeatureContext } from '@omni-desk/contracts/feature'
import { TaskRow } from '@omni-desk/message-kit'
import { Avatar, EmptyState, ErrorNotice, PageHeader, SkeletonList, SourceMark } from '@omni-desk/ui'
import { cn } from '@omni-desk/ui'
import { previewText } from '@omni-desk/message-kit'
import {
  useChatworkStatus,
  useServiceState,
  useSettings,
  useConversations,
  useSlackEmoji,
  useInbox,
  useUnifiedTasks
} from '@omni-desk/client'
import { dueInfo, DUE_GROUP_ORDER, formatShortTime, formatToday, greeting } from '@omni-desk/message-kit'

function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
  onClick
}: {
  icon: ReactNode
  label: string
  value: number | string
  sub?: ReactNode
  tone: 'accent' | 'warning' | 'danger' | 'success'
  onClick?: () => void
}) {
  const toneCls = {
    accent: 'bg-accent-soft text-accent-text',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    success: 'bg-success-soft text-success'
  }[tone]
  return (
    <button onClick={onClick} className="card group flex flex-col gap-3 p-4 text-left transition-colors hover:border-line-strong">
      <div className="flex items-center justify-between">
        <span className={cn('flex size-8 items-center justify-center rounded-lg', toneCls)}>{icon}</span>
        <ChevronRight className="size-4 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div>
        <p className="text-[26px] leading-none font-semibold tracking-tight tabular-nums">{value}</p>
        <p className="mt-1.5 text-[12.5px] font-medium text-fg-muted">{label}</p>
        {sub && <p className="mt-0.5 text-[11.5px] text-fg-subtle">{sub}</p>}
      </div>
    </button>
  )
}

function MessagePreviewRow({ message, onOpen }: { message: Message; onOpen: () => void }) {
  const emoji = useSlackEmoji()
  return (
    <button onClick={onOpen} className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-hover/60">
      <div className="relative h-fit shrink-0">
        <Avatar name={message.author.name} url={message.author.avatarUrl} size={32} />
        <span className="absolute -right-1 -bottom-1 rounded-[5px] ring-2 ring-panel">
          <SourceMark source={message.source} size="xs" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[13px] font-semibold">{message.author.name}</span>
          <span className="flex min-w-0 items-center gap-1 text-[11.5px] text-fg-subtle">
            <ConversationKindIcon kind={message.conversationKind} className="size-3" />
            <span className="truncate">{message.conversationName}</span>
          </span>
          <span className="ml-auto shrink-0 text-[11.5px] text-fg-subtle tabular-nums">{formatShortTime(message.createdAt)}</span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-fg-muted">{previewText(message, emoji)}</p>
      </div>
    </button>
  )
}

function ServiceRow({
  icon,
  name,
  status,
  detail,
  onClick
}: {
  icon: ReactNode
  name: string
  status: 'connected' | 'demo' | 'off' | 'soon'
  detail?: string
  onClick?: () => void
}) {
  const label = { connected: '接続済み', demo: 'デモ表示', off: '未接続', soon: '準備中' }[status]
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors enabled:hover:bg-hover/60"
    >
      <span className="flex size-7 items-center justify-center">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">{name}</p>
        {detail && <p className="truncate text-[11.5px] text-fg-subtle">{detail}</p>}
      </div>
      <span
        className={cn(
          'rounded-full px-2 py-0.5 text-[11px] font-medium',
          status === 'connected' && 'bg-success-soft text-success',
          status === 'demo' && 'bg-warning-soft text-warning',
          (status === 'off' || status === 'soon') && 'bg-sunken text-fg-subtle'
        )}
      >
        {label}
      </span>
    </button>
  )
}

export function HomeView({ navigate }: FeatureContext) {
  const settings = useSettings()
  const slack = useServiceState('slack')
  const chatwork = useServiceState('chatwork')
  const inbox = useInbox()
  const tasks = useUnifiedTasks()
  const cwStatus = useChatworkStatus()
  const slackConvs = useConversations('slack')

  const now = Date.now()
  // ホームに出すのは未対応の自分宛て（受信箱・サイドバーの件数と同じ規則）
  const openItems = inbox.entries.filter((e) => e.status === 'open').map((e) => e.message)
  const openTasks = tasks.items.filter((t) => t.status === 'open')
  const overdue = openTasks.filter((t) => dueInfo(t, now).group === 'overdue').length
  const dueToday = openTasks.filter((t) => dueInfo(t, now).group === 'today').length
  const upcoming = [...openTasks]
    .sort((a, b) => {
      const ga = DUE_GROUP_ORDER.indexOf(dueInfo(a, now).group)
      const gb = DUE_GROUP_ORDER.indexOf(dueInfo(b, now).group)
      return ga - gb || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity)
    })
    .slice(0, 6)

  const slackUnreadConvs = slackConvs.conversations?.filter((c) => c.hasUnread).length ?? 0
  const cwUnread = cwStatus?.unreadCount ?? 0
  const errors = [...inbox.sources, ...tasks.sources].filter((s) => s.error)
  const firstError = errors[0]

  const serviceState = (s: { connected: boolean; demo: boolean }): 'connected' | 'demo' | 'off' =>
    s.demo ? 'demo' : s.connected ? 'connected' : 'off'

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={greeting()} subtitle={formatToday()} />
      <div className="thin-scroll flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1180px] space-y-6 px-7 py-6">
          {firstError?.error && (
            <ErrorNotice
              error={firstError.error}
              source={firstError.source}
              onRetry={firstError.refetch}
              onOpenSettings={() => navigate(routes.settings())}
            />
          )}

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard
              icon={<AtSign className="size-4" />}
              tone="accent"
              label="未対応の自分宛て"
              value={inbox.counts.open}
              sub={`Slack ${inbox.openBySource.slack} · Chatwork ${inbox.openBySource.chatwork}`}
              onClick={() => navigate(routes.inbox())}
            />
            <StatCard
              icon={<MessagesSquare className="size-4" />}
              tone="success"
              label="未読"
              value={cwUnread + slackUnreadConvs}
              sub={`Chatwork ${cwUnread}件 · Slack ${slackUnreadConvs}会話`}
              onClick={() => navigate(routes.conversations(cwUnread > 0 || !slack.enabled ? 'chatwork' : 'slack'))}
            />
            <StatCard
              icon={<ListChecks className="size-4" />}
              tone="warning"
              label="未完了タスク"
              value={openTasks.length}
              sub={`今日が期限 ${dueToday}件`}
              onClick={() => navigate(routes.tasks())}
            />
            <StatCard
              icon={<CalendarClock className="size-4" />}
              tone="danger"
              label="期限切れ"
              value={overdue}
              sub={overdue > 0 ? '早めに対応しましょう' : '期限切れはありません'}
              onClick={() => navigate(routes.tasks())}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <section className="lg:col-span-3">
              <div className="mb-2.5 flex items-center justify-between">
                <h2 className="text-[13px] font-semibold">未対応の自分宛て</h2>
                <button onClick={() => navigate(routes.inbox())} className="text-[12px] text-accent-text hover:underline">
                  受信箱を開く
                </button>
              </div>
              <div className="card divide-y divide-line overflow-hidden">
                {inbox.isLoading && inbox.items.length === 0 ? (
                  <div className="p-4">
                    <SkeletonList rows={5} />
                  </div>
                ) : openItems.length === 0 ? (
                  <EmptyState icon={<Inbox className="size-5" />} title="未対応の自分宛てはありません" />
                ) : (
                  openItems
                    .slice(0, 7)
                    .map((m) => (
                      <MessagePreviewRow key={m.id} message={m} onOpen={() => navigate(routes.conversations(m.source, m.conversationId))} />
                    ))
                )}
              </div>
            </section>

            <div className="space-y-6 lg:col-span-2">
              <section>
                <div className="mb-2.5 flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold">期限が近いタスク</h2>
                  <button onClick={() => navigate(routes.tasks())} className="text-[12px] text-accent-text hover:underline">
                    すべて見る
                  </button>
                </div>
                <div className="card divide-y divide-line overflow-hidden">
                  {tasks.isLoading && tasks.items.length === 0 ? (
                    <div className="p-4">
                      <SkeletonList rows={4} avatar={false} />
                    </div>
                  ) : upcoming.length === 0 ? (
                    <EmptyState icon={<CircleCheckBig className="size-5" />} title="未完了のタスクはありません" />
                  ) : (
                    upcoming.map((t) => <TaskRow key={t.id} task={t} dense />)
                  )}
                </div>
              </section>

              <section>
                <h2 className="mb-2.5 text-[13px] font-semibold">接続サービス</h2>
                <div className="card divide-y divide-line overflow-hidden">
                  <ServiceRow
                    icon={<SourceMark source="slack" size="md" />}
                    name="Slack"
                    status={serviceState(slack)}
                    detail={
                      settings.slack
                        ? `${settings.slack.teamName} · ${settings.slack.authType === 'session' ? 'ブラウザセッション' : 'ユーザートークン'}`
                        : undefined
                    }
                    onClick={() => navigate(slack.enabled ? routes.conversations('slack') : routes.settings())}
                  />
                  <ServiceRow
                    icon={<SourceMark source="chatwork" size="md" />}
                    name="Chatwork"
                    status={serviceState(chatwork)}
                    detail={settings.chatwork ? settings.chatwork.name : undefined}
                    onClick={() => navigate(chatwork.enabled ? routes.conversations('chatwork') : routes.settings())}
                  />
                  <ServiceRow
                    icon={<Users className="size-4 text-teams" />}
                    name="Microsoft Teams"
                    status="soon"
                  />
                  <ServiceRow icon={<Mail className="size-4 text-mail" />} name="メール" status="soon" />
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
