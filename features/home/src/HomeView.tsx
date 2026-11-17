import type { ReactNode } from 'react'
import { AtSign, CalendarClock, CalendarDays, ChevronRight, CircleCheckBig, Inbox, ListChecks, Mail, MessagesSquare, Users, Video } from 'lucide-react'
import { routes, type Message } from '@omni-desk/contracts'
import { ConversationKindIcon, dueInfo, DUE_GROUP_ORDER, formatShortTime, formatToday, greeting, previewText, TaskRow } from '@omni-desk/message-kit'
import type { FeatureContext } from '@omni-desk/contracts/feature'
import {
  Avatar,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  ErrorNotice,
  ListItemButton,
  PageHeader,
  SkeletonList,
  SourceMark,
  Stack,
  Typography
} from '@omni-desk/ui'
import {
  openExternal,
  useCalendar,
  useChatworkStatus,
  useConversations,
  useInbox,
  useServiceState,
  useSettings,
  useSlackEmoji,
  useUnifiedTasks
} from '@omni-desk/client'

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
  return (
    <Card
      onClick={onClick}
      sx={(theme) => ({
        p: 2,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        transition: 'border-color 120ms',
        '&:hover': {
          borderColor: theme.palette.text.disabled
        },
        '&:hover .stat-arrow': {
          opacity: 1
        }
      })}
    >
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Box
          sx={(theme) => {
            const colorMap = {
              accent: { bg: theme.palette.action.selected, fg: theme.palette.primary.main },
              warning: { bg: 'rgba(240, 169, 59, 0.14)', fg: theme.palette.warning.main },
              danger: { bg: 'rgba(210, 59, 59, 0.12)', fg: theme.palette.error.main },
              success: { bg: 'rgba(19, 132, 94, 0.12)', fg: theme.palette.success.main }
            }[tone]
            return {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 1,
              bgcolor: colorMap.bg,
              color: colorMap.fg
            }
          }}
        >
          {icon}
        </Box>
        <Box className="stat-arrow" sx={{ opacity: 0, transition: 'opacity 120ms', color: 'text.disabled' }}>
          <ChevronRight size={16} />
        </Box>
      </Stack>
      <Box>
        <Typography variant="h1" sx={{ fontSize: '24px', fontWeight: 600, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontWeight: 500 }}>
          {label}
        </Typography>
        {sub && (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
            {sub}
          </Typography>
        )}
      </Box>
    </Card>
  )
}

function MessagePreviewRow({ message, onOpen }: { message: Message; onOpen: () => void }) {
  const emoji = useSlackEmoji()
  return (
    <ListItemButton onClick={onOpen} sx={{ alignItems: 'flex-start', gap: 2, px: 2, py: 2 }}>
      <Box sx={{ position: 'relative', flexShrink: 0 }}>
        <Avatar name={message.author.name} url={message.author.avatarUrl} size={32} />
        <Box
          sx={(theme) => ({
            position: 'absolute',
            right: -4,
            bottom: -4,
            borderRadius: '4px',
            boxShadow: `0 0 0 2px ${theme.palette.background.paper}`
          })}
        >
          <SourceMark source={message.source} size="xs" />
        </Box>
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
          <Typography variant="body1" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {message.author.name}
          </Typography>
          <Stack direction="row" spacing={0.5} sx={{ minWidth: 0, alignItems: 'center', color: 'text.disabled' }}>
            <ConversationKindIcon kind={message.conversationKind} />
            <Typography variant="caption" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {message.conversationName}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto !important', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
            {formatShortTime(message.createdAt)}
          </Typography>
        </Stack>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mt: 0.5,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical'
          }}
        >
          {previewText(message, emoji)}
        </Typography>
      </Box>
    </ListItemButton>
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
  const color = status === 'connected' ? 'success' : status === 'demo' ? 'warning' : 'default'
  return (
    <ListItemButton onClick={onClick} disabled={!onClick} sx={{ gap: 2, px: 2, py: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32 }}>{icon}</Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body1" sx={{ fontWeight: 500 }}>
          {name}
        </Typography>
        {detail && (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {detail}
          </Typography>
        )}
      </Box>
      <Chip size="small" color={color} variant={color === 'default' ? 'outlined' : 'filled'} label={label} />
    </ListItemButton>
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
  const calendar = useCalendar()

  const now = Date.now()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayEndMs = todayStart.getTime() + 86_400_000
  const todayEvents = calendar.events.filter((e) => e.endAt > now && e.startAt < todayEndMs).slice(0, 4)
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
    <Stack sx={{ height: '100%' }}>
      <PageHeader title={greeting()} subtitle={formatToday()} />
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        <Stack spacing={3} sx={{ mx: 'auto', maxWidth: 1184, px: 3, py: 3 }}>
          {firstError?.error && (
            <ErrorNotice
              error={firstError.error}
              source={firstError.source}
              onRetry={firstError.refetch}
              onOpenSettings={() => navigate(routes.settings())}
            />
          )}

          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }
            }}
          >
            <StatCard
              icon={<AtSign size={16} />}
              tone="accent"
              label="未対応の自分宛て"
              value={inbox.counts.open}
              sub={`Slack ${inbox.openBySource.slack} · Chatwork ${inbox.openBySource.chatwork}`}
              onClick={() => navigate(routes.inbox())}
            />
            <StatCard
              icon={<MessagesSquare size={16} />}
              tone="success"
              label="未読"
              value={cwUnread + slackUnreadConvs}
              sub={`Chatwork ${cwUnread}件 · Slack ${slackUnreadConvs}会話`}
              onClick={() => navigate(routes.conversations(cwUnread > 0 || !slack.enabled ? 'chatwork' : 'slack'))}
            />
            <StatCard
              icon={<ListChecks size={16} />}
              tone="warning"
              label="未完了タスク"
              value={openTasks.length}
              sub={`今日が期限 ${dueToday}件`}
              onClick={() => navigate(routes.tasks())}
            />
            <StatCard
              icon={<CalendarClock size={16} />}
              tone="danger"
              label="期限切れ"
              value={overdue}
              sub={overdue > 0 ? '早めに対応しましょう' : '期限切れはありません'}
              onClick={() => navigate(routes.tasks())}
            />
          </Box>

          {(todayEvents.length > 0 || settings.googleCalendar) && (
            <Card sx={{ overflow: 'hidden' }}>
              <Stack
                direction="row"
                sx={(theme) => ({
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: `1px solid ${theme.palette.divider}`,
                  px: 2,
                  py: 1.5
                })}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <CalendarDays size={16} />
                  <Typography variant="h2">今日の予定</Typography>
                </Stack>
                <Button size="sm" variant="ghost" onClick={() => navigate(routes.calendar())}>
                  カレンダーを開く
                  <ChevronRight size={16} />
                </Button>
              </Stack>
              {todayEvents.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                  今日の残りの予定はありません
                </Typography>
              ) : (
                <Stack divider={<Divider />}>
                  {todayEvents.map((ev) => (
                    <Stack key={ev.id} direction="row" spacing={2} sx={{ alignItems: 'center', px: 2, py: 1.5 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ width: 96, flexShrink: 0 }}>
                        {ev.isAllDay
                          ? '終日'
                          : `${new Date(ev.startAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} – ${new Date(ev.endAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`}
                      </Typography>
                      <Typography variant="body1" sx={{ minWidth: 0, flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.title}
                      </Typography>
                      {ev.meetUrl && (
                        <Button size="sm" variant="primary" onClick={() => openExternal(ev.meetUrl!)}>
                          <Video size={16} />
                          参加
                        </Button>
                      )}
                    </Stack>
                  ))}
                </Stack>
              )}
            </Card>
          )}

          <Box
            sx={{
              display: 'grid',
              gap: 3,
              gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' }
            }}
          >
            <Box>
              <Stack direction="row" sx={{ mb: 1, alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h2">未対応の自分宛て</Typography>
                <Button size="sm" variant="ghost" onClick={() => navigate(routes.inbox())}>
                  受信箱を開く
                </Button>
              </Stack>
              <Card sx={{ overflow: 'hidden' }}>
                {inbox.isLoading && inbox.items.length === 0 ? (
                  <Box sx={{ p: 2 }}>
                    <SkeletonList rows={5} />
                  </Box>
                ) : openItems.length === 0 ? (
                  <EmptyState icon={<Inbox size={24} />} title="未対応の自分宛てはありません" />
                ) : (
                  <Stack divider={<Divider />}>
                    {openItems.slice(0, 7).map((m) => (
                      <MessagePreviewRow key={m.id} message={m} onOpen={() => navigate(routes.conversations(m.source, m.conversationId))} />
                    ))}
                  </Stack>
                )}
              </Card>
            </Box>

            <Stack spacing={3}>
              <Box>
                <Stack direction="row" sx={{ mb: 1, alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="h2">期限が近いタスク</Typography>
                  <Button size="sm" variant="ghost" onClick={() => navigate(routes.tasks())}>
                    すべて見る
                  </Button>
                </Stack>
                <Card sx={{ overflow: 'hidden' }}>
                  {tasks.isLoading && tasks.items.length === 0 ? (
                    <Box sx={{ p: 2 }}>
                      <SkeletonList rows={4} avatar={false} />
                    </Box>
                  ) : upcoming.length === 0 ? (
                    <EmptyState icon={<CircleCheckBig size={24} />} title="未完了のタスクはありません" />
                  ) : (
                    <Stack divider={<Divider />}>
                      {upcoming.map((t) => (
                        <TaskRow key={t.id} task={t} dense />
                      ))}
                    </Stack>
                  )}
                </Card>
              </Box>

              <Box>
                <Typography variant="h2" sx={{ mb: 1 }}>
                  接続サービス
                </Typography>
                <Card sx={{ overflow: 'hidden' }}>
                  <Stack divider={<Divider />}>
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
                    <ServiceRow icon={<Users size={16} color="#5059c9" />} name="Microsoft Teams" status="soon" />
                    <ServiceRow icon={<Mail size={16} color="#0b8bd1" />} name="メール" status="soon" />
                  </Stack>
                </Card>
              </Box>
            </Stack>
          </Box>
        </Stack>
      </Box>
    </Stack>
  )
}
