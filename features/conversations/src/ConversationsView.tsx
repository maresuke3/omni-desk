import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, MessagesSquare, Pin, Search } from 'lucide-react'
import { routes, type Conversation, type Message, type Route, type Source } from '@omni-desk/contracts'
import { ChatMessage, ConversationKindIcon, formatDayHeading, formatShortTime, ReplyComposer, startOfDay } from '@omni-desk/message-kit'
import type { FeatureContext } from '@omni-desk/contracts/feature'
import {
  Avatar,
  Box,
  Button,
  CountBadge,
  Divider,
  EmptyState,
  ErrorNotice,
  InputAdornment,
  ListItemButton,
  NotConnected,
  SkeletonList,
  SOURCE_LABEL,
  SourceMark,
  Stack,
  TextField,
  Typography
} from '@omni-desk/ui'
import { actions, openExternal, useConversations, useHistory, useServiceState, useSettings } from '@omni-desk/client'

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
    <ListItemButton
      selected={active}
      onClick={onClick}
      sx={(theme) => ({
        borderRadius: 1,
        px: 1,
        py: 1,
        minHeight: 32,
        gap: 1,
        color: active ? theme.palette.primary.main : theme.palette.text.secondary
      })}
    >
      {c.kind === 'dm' || c.iconUrl ? (
        <Avatar name={c.name} url={c.iconUrl} size={24} />
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
          <ConversationKindIcon kind={c.kind} />
        </Box>
      )}
      <Typography
        variant="body2"
        sx={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontWeight: unread && !active ? 600 : 400,
          color: unread && !active ? 'text.primary' : 'inherit'
        }}
      >
        {c.name}
      </Typography>
      {c.pinned && <Pin size={12} />}
      {c.mentionCount ? (
        <CountBadge count={c.mentionCount} tone="danger" />
      ) : c.unreadCount ? (
        <CountBadge count={c.unreadCount} tone="muted" />
      ) : c.hasUnread ? (
        <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main' }} />
      ) : c.lastActivityAt ? (
        <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {formatShortTime(c.lastActivityAt)}
        </Typography>
      ) : null}
    </ListItemButton>
  )
}

function groupConversations(source: Source, list: Conversation[]): { title: string; items: Conversation[] }[] {
  if (source === 'chatwork') {
    return [
      { title: 'ピン留め', items: list.filter((c) => c.pinned) },
      { title: 'チャット', items: list.filter((c) => !c.pinned) }
    ].filter((g) => g.items.length)
  }
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

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [conversation.id, lastId])

  const url = conversationUrl(source, conversation, teamUrl)

  return (
    <Stack sx={{ minWidth: 0, flex: 1, bgcolor: 'background.paper' }}>
      <Stack
        component="header"
        direction="row"
        spacing={2}
        className="drag"
        sx={(theme) => ({
          height: 64,
          flexShrink: 0,
          alignItems: 'center',
          borderBottom: `1px solid ${theme.palette.divider}`,
          px: 3
        })}
      >
        <Box
          sx={(theme) => ({
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: 1,
            bgcolor: theme.palette.mode === 'dark' ? '#12151a' : '#f6f7f9',
            color: 'text.secondary'
          })}
        >
          <ConversationKindIcon kind={conversation.kind} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body1" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conversation.name}
          </Typography>
          <Typography variant="caption" color="text.disabled">
            {SOURCE_LABEL[source]} · {messages ? `直近 ${messages.length} 件` : '読み込み中'}
          </Typography>
        </Box>
        {url && (
          <Button size="sm" onClick={() => openExternal(url)}>
            {SOURCE_LABEL[source]} で開く
            <ArrowUpRight size={16} />
          </Button>
        )}
      </Stack>

      <Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', py: 2 }}>
        {error ? (
          <Box sx={{ px: 3 }}>
            <ErrorNotice error={error} source={source} onRetry={onRetry} />
          </Box>
        ) : isLoading && !messages ? (
          <Box sx={{ px: 3, py: 1 }}>
            <SkeletonList rows={6} />
          </Box>
        ) : !messages?.length ? (
          <EmptyState icon={<MessagesSquare size={24} />} title="メッセージはありません" />
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1]
            const newDay = !prev || startOfDay(prev.createdAt) !== startOfDay(m.createdAt)
            const compact =
              !newDay && prev.author.id === m.author.id && m.createdAt - prev.createdAt < 5 * 60_000
            return (
              <Box key={m.id}>
                {newDay && (
                  <Stack direction="row" spacing={2} sx={{ my: 2, alignItems: 'center', px: 3 }}>
                    <Divider sx={{ flex: 1 }} />
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                      {formatDayHeading(m.createdAt)}
                    </Typography>
                    <Divider sx={{ flex: 1 }} />
                  </Stack>
                )}
                <ChatMessage message={m} compact={compact} />
              </Box>
            )
          })
        )}
      </Box>

      <Box
        component="footer"
        sx={(theme) => ({
          flexShrink: 0,
          borderTop: `1px solid ${theme.palette.divider}`,
          px: 3,
          py: 2
        })}
      >
        <ReplyComposer
          variant="footer"
          composerKey={`post:${source}:${conversation.id}`}
          target={{ source, conversationId: conversation.id }}
          placeholder={composerPlaceholder(conversation)}
        />
      </Box>
    </Stack>
  )
}

/** route.params: { source: 'slack' | 'chatwork', conversationId?: string } */
export function ConversationsView({ route, navigate }: FeatureContext) {
  const source: Source = route.params?.source === 'chatwork' ? 'chatwork' : 'slack'
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
  const [query, setQuery] = useState('')

  const selected = list.conversations?.find((c) => c.id === selectedId) ?? list.conversations?.[0]
  const effectiveId = selected?.id ?? null
  const history = useHistory(source, effectiveId)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (list.conversations ?? []).filter((c) => !q || c.name.toLowerCase().includes(q))
  }, [list.conversations, query])
  const groups = groupConversations(source, filtered)

  if (!service.enabled) {
    return (
      <Stack sx={{ height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <NotConnected source={source} onOpenSettings={() => navigate(routes.settings())} />
      </Stack>
    )
  }

  const subtitle =
    source === 'slack'
      ? settings.slack?.teamName ?? (service.demo ? 'デモワークスペース' : '')
      : settings.chatwork?.organizationName ?? settings.chatwork?.name ?? (service.demo ? 'デモアカウント' : '')

  return (
    <Stack direction="row" sx={{ height: '100%' }}>
      <Stack
        sx={(theme) => ({
          width: 288,
          flexShrink: 0,
          borderRight: `1px solid ${theme.palette.divider}`,
          bgcolor: 'background.default'
        })}
      >
        <Box className="drag" sx={{ flexShrink: 0, px: 2, pt: 3, pb: 2 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <SourceMark source={source} size="md" />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body1" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                {SOURCE_LABEL[source]}
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {subtitle}
              </Typography>
            </Box>
          </Stack>
          <Box className="no-drag" sx={{ mt: 2 }}>
            <TextField
              fullWidth
              size="small"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={source === 'slack' ? 'チャンネル・DM を検索' : 'チャットを検索'}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={16} />
                    </InputAdornment>
                  )
                }
              }}
            />
          </Box>
        </Box>
        <Box sx={{ flex: 1, overflowY: 'auto', px: 1, pb: 2 }}>
          {list.error && !list.conversations ? (
            <ErrorNotice
              compact
              error={list.error}
              onRetry={actions.refresh}
              onOpenSettings={() => navigate(routes.settings())}
            />
          ) : list.loading ? (
            <Box sx={{ px: 1, pt: 1 }}>
              <SkeletonList rows={8} avatar={false} />
            </Box>
          ) : groups.length === 0 ? (
            <Typography variant="body2" color="text.disabled" sx={{ px: 1, py: 3, textAlign: 'center' }}>
              見つかりませんでした
            </Typography>
          ) : (
            groups.map((g) => (
              <Box key={g.title} sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', px: 1, pt: 1, pb: 0.5, fontWeight: 600 }}>
                  {g.title} <Box component="span" sx={{ fontWeight: 400 }}>{g.items.length}</Box>
                </Typography>
                <Stack spacing={0.5}>
                  {g.items.map((c) => (
                    <ConversationRow key={c.id} c={c} active={c.id === effectiveId} onClick={() => onSelect(c.id)} />
                  ))}
                </Stack>
              </Box>
            ))
          )}
        </Box>
      </Stack>

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
        <Stack sx={{ flex: 1, alignItems: 'center', justifyContent: 'center', bgcolor: 'background.paper' }}>
          <EmptyState icon={<MessagesSquare size={24} />} title="会話を選択してください" />
        </Stack>
      )}
    </Stack>
  )
}
