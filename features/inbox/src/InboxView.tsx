import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlarmClock, CheckCheck, CircleCheck, Inbox, Info, Keyboard, Search, X } from 'lucide-react'
import { routes, type InboxStatus, type Message } from '@omni-desk/contracts'
import type { FeatureContext } from '@omni-desk/contracts/feature'
import {
  actions,
  useAppStore,
  useInbox,
  useNow,
  useSlackEmoji,
  type InboxPeriod,
  type SourceFilter
} from '@omni-desk/client'
import { formatDayHeading, previewText, startOfDay } from '@omni-desk/message-kit'
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorNotice,
  IconButton,
  InputAdornment,
  MenuItem,
  PageHeader,
  Paper,
  Segmented,
  SkeletonList,
  Stack,
  TextField,
  Typography
} from '@omni-desk/ui'
import { filterInbox, isFiltering, type InboxFilter } from './filter'
import { InboxRow } from './InboxRow'
import { Toast } from './Toast'
import { useInboxKeyboard } from './useInboxKeyboard'

const TABS: InboxStatus[] = ['open', 'snoozed', 'done']
const PAGE = 150

const SHORTCUTS: [string, string][] = [
  ['J / K', '次・前のメッセージ'],
  ['E', '対応済みにする'],
  ['U', '未対応に戻す'],
  ['S', 'あとで（1〜4 で時刻を選ぶ）'],
  ['R', '返信する（⌘ Enter で送信）'],
  ['O / Enter', '会話を開く'],
  ['Z', '直前の操作を元に戻す'],
  ['/', '検索'],
  ['1 / 2 / 3', '未対応・あとで・対応済み'],
  ['Esc', '閉じる']
]

function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        position: 'absolute',
        top: '100%',
        right: 0,
        zIndex: 50,
        mt: 1,
        width: 288,
        p: 2,
        boxShadow: 3
      }}
    >
      <Stack direction="row" sx={{ mb: 1, alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          キーボード操作
        </Typography>
        <IconButton label="閉じる" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </Stack>
      <Stack spacing={1}>
        {SHORTCUTS.map(([key, label]) => (
          <Stack key={key} direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
            <Chip size="small" variant="outlined" label={key} />
          </Stack>
        ))}
      </Stack>
    </Paper>
  )
}

/**
 * 受信箱。自分宛てメッセージを「未対応 / あとで / 対応済み」で仕分ける。
 * 状態の正はメインプロセス（PC に保存）。操作は先に画面へ反映し、元に戻すこともできる。
 */
export function InboxView({ navigate }: FeatureContext) {
  const inbox = useInbox()
  const now = useNow(30_000)
  const emoji = useSlackEmoji()
  const ui = useAppStore((s) => s.ui)
  const slackAuth = useAppStore((s) => s.settings?.slack?.authType)
  const [helpOpen, setHelpOpen] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const searchRef = useRef<HTMLInputElement>(null)

  const filter: InboxFilter = { status: ui.inboxStatus, source: ui.inboxFilter, period: ui.inboxPeriod, query: ui.inboxQuery }
  const toText = useCallback((m: Message) => previewText(m, emoji), [emoji])
  const list = useMemo(
    () => filterInbox(inbox.entries, filter, now, toText),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inbox.entries, filter.status, filter.source, filter.period, filter.query, now, toText]
  )
  const visible = useMemo(() => list.slice(0, limit), [list, limit])
  const selectedId = ui.inboxSelected
  const selectedIndex = visible.findIndex((e) => e.message.id === selectedId)

  const lastIndex = useRef(0)
  useEffect(() => {
    if (selectedIndex >= 0) {
      lastIndex.current = selectedIndex
      return
    }
    const fallback = visible[Math.min(lastIndex.current, visible.length - 1)]?.message.id ?? null
    if (fallback !== selectedId) actions.setUi({ inboxSelected: fallback })
  }, [selectedIndex, selectedId, visible])

  useEffect(() => setLimit(PAGE), [filter.status, filter.source, filter.period, filter.query])

  const selected = selectedIndex >= 0 ? visible[selectedIndex] : undefined
  const select = useCallback((id: string) => {
    actions.setUi({ inboxSelected: id, inboxSnoozeFor: null })
    actions.closeReply()
  }, [])
  const move = (delta: number): void => {
    const target = visible[Math.max(0, Math.min(visible.length - 1, (selectedIndex < 0 ? -1 : selectedIndex) + delta))]
    if (target) select(target.message.id)
  }
  const openConversation = useCallback(
    (m: Message) => navigate(routes.conversations(m.source, m.conversationId)),
    [navigate]
  )

  useInboxKeyboard({
    next: () => move(1),
    prev: () => move(-1),
    done: () => {
      if (!selected) return
      if (selected.status === 'done') void actions.setInboxStatus([selected.message], 'open', undefined, '未対応に戻しました')
      else void actions.setInboxStatus([selected.message], 'done', undefined, '対応済みにしました')
    },
    reopen: () => selected && selected.status !== 'open' && void actions.setInboxStatus([selected.message], 'open', undefined, '未対応に戻しました'),
    snooze: () => selected && actions.setUi({ inboxSnoozeFor: selected.message.id }),
    reply: () => selected && actions.openReply(selected.message.id),
    open: () => selected && openConversation(selected.message),
    undo: () => void actions.undoInbox(),
    focusSearch: () => searchRef.current?.focus(),
    switchTab: (i) => actions.setUi({ inboxStatus: TABS[i] }),
    toggleHelp: () => setHelpOpen((v) => !v),
    escape: () => {
      setHelpOpen(false)
      actions.setUi({ inboxSnoozeFor: null })
      actions.closeReply()
    }
  })

  const groups = useMemo(() => {
    if (filter.status === 'snoozed') return [{ key: 'all', label: null as string | null, items: visible }]
    const out: { key: string; label: string | null; items: typeof visible }[] = []
    for (const e of visible) {
      const day = startOfDay(filter.status === 'done' ? (e.state?.updatedAt ?? e.message.createdAt) : e.message.createdAt)
      const last = out[out.length - 1]
      if (last?.key === String(day)) last.items.push(e)
      else out.push({ key: String(day), label: formatDayHeading(day, now), items: [e] })
    }
    return out
  }, [visible, filter.status, now])

  const filtering = isFiltering(filter)
  const errors = inbox.sources.filter((s) => s.error && (filter.source === 'all' || filter.source === s.source))

  return (
    <Stack sx={{ position: 'relative', height: '100%' }}>
      <PageHeader
        title="受信箱"
        subtitle="あなた宛てのメッセージを、未対応・あとで・対応済みで仕分けます"
        actions={
          <Box sx={{ position: 'relative' }}>
            <Button size="sm" variant="ghost" onClick={() => setHelpOpen((v) => !v)}>
              <Keyboard size={16} />
              ショートカット
            </Button>
            {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
          </Box>
        }
      >
        <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', alignItems: 'center', rowGap: 1 }}>
          <Segmented<InboxStatus>
            value={ui.inboxStatus}
            onChange={(inboxStatus) => actions.setUi({ inboxStatus })}
            options={[
              { value: 'open', label: <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><Inbox size={16} /><span>未対応</span></Stack>, count: inbox.counts.open },
              { value: 'snoozed', label: <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><AlarmClock size={16} /><span>あとで</span></Stack>, count: inbox.counts.snoozed },
              { value: 'done', label: <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><CircleCheck size={16} /><span>対応済み</span></Stack>, count: inbox.counts.done }
            ]}
          />
          <TextField
            inputRef={searchRef}
            size="small"
            value={ui.inboxQuery}
            onChange={(e) => actions.setUi({ inboxQuery: e.target.value })}
            placeholder="送信者・ルーム・本文で検索"
            sx={{ minWidth: 224, flex: 1 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} />
                  </InputAdornment>
                ),
                endAdornment: ui.inboxQuery ? (
                  <InputAdornment position="end">
                    <IconButton label="検索をクリア" onClick={() => actions.setUi({ inboxQuery: '' })}>
                      <X size={16} />
                    </IconButton>
                  </InputAdornment>
                ) : (
                  <InputAdornment position="end">
                    <Chip size="small" variant="outlined" label="/" />
                  </InputAdornment>
                )
              }
            }}
          />
          <Segmented<SourceFilter>
            size="sm"
            value={ui.inboxFilter}
            onChange={(inboxFilter) => actions.setUi({ inboxFilter })}
            options={[
              { value: 'all', label: 'すべて' },
              { value: 'slack', label: 'Slack' },
              { value: 'chatwork', label: 'Chatwork' }
            ]}
          />
          <TextField
            select
            size="small"
            value={ui.inboxPeriod}
            onChange={(e) => actions.setUi({ inboxPeriod: e.target.value as InboxPeriod })}
            sx={{ minWidth: 120 }}
          >
            <MenuItem value="all">全期間</MenuItem>
            <MenuItem value="today">今日</MenuItem>
            <MenuItem value="7d">7 日以内</MenuItem>
            <MenuItem value="30d">30 日以内</MenuItem>
          </TextField>
        </Stack>
      </PageHeader>

      <Box sx={{ position: 'relative', flex: 1, overflowY: 'auto' }}>
        <Box sx={{ mx: 'auto', maxWidth: 920, px: 3, py: 2 }}>
          {errors.length > 0 && (
            <Stack spacing={1} sx={{ mb: 2 }}>
              {errors.map((s) => (
                <ErrorNotice key={s.source} error={s.error!} source={s.source} onRetry={s.refetch} onOpenSettings={() => navigate(routes.settings())} />
              ))}
            </Stack>
          )}
          {slackAuth === 'user' && filter.source !== 'chatwork' && (
            <Alert severity="info" icon={<Info size={16} />} sx={{ mb: 2 }}>
              Slack はユーザートークン方式のため、メンションのみ表示しています（DM と既読状態はブラウザセッション方式で取得できます）
            </Alert>
          )}

          {list.length > 0 && (
            <Stack direction="row" sx={{ mb: 1, alignItems: 'center', justifyContent: 'space-between', px: 0.5 }}>
              <Typography variant="caption" color="text.disabled">
                {filtering ? `${list.length} 件が一致` : `${list.length} 件`}
                {inbox.hiddenCount > 0 && ` · 非表示の送信者 ${inbox.hiddenCount} 件を除く`}
              </Typography>
              {filter.status === 'open' && list.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void actions.setInboxStatus(
                      list.map((e) => e.message),
                      'done',
                      undefined,
                      `${list.length} 件を対応済みにしました`
                    )
                  }
                >
                  <CheckCheck size={16} />
                  {filtering ? '一致した' : '表示中の'} {list.length} 件を対応済みに
                </Button>
              )}
            </Stack>
          )}

          {inbox.isLoading && inbox.entries.length === 0 ? (
            <Card sx={{ p: 2 }}>
              <SkeletonList rows={6} />
            </Card>
          ) : list.length === 0 ? (
            <EmptyState
              icon={filter.status === 'done' ? <CircleCheck size={24} /> : filter.status === 'snoozed' ? <AlarmClock size={24} /> : <Inbox size={24} />}
              title={
                filtering
                  ? '条件に一致するメッセージはありません'
                  : filter.status === 'open'
                    ? '未対応のメッセージはありません'
                    : filter.status === 'snoozed'
                      ? 'あとでにしたメッセージはありません'
                      : '対応済みのメッセージはありません'
              }
              description={!filtering && filter.status === 'open' ? 'お疲れさまでした！新しい自分宛てが届くとここに表示されます。' : undefined}
              action={
                filtering ? (
                  <Button onClick={() => actions.setUi({ inboxQuery: '', inboxFilter: 'all', inboxPeriod: 'all' })}>条件をクリア</Button>
                ) : undefined
              }
            />
          ) : (
            <Card sx={{ overflow: 'hidden' }}>
              {groups.map((g) => (
                <Box key={g.key}>
                  {g.label && (
                    <Box
                      sx={(theme) => ({
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        borderBottom: `1px solid ${theme.palette.divider}`,
                        bgcolor: theme.palette.mode === 'dark' ? '#12151a' : '#f6f7f9',
                        px: 3,
                        py: 0.5
                      })}
                    >
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                        {filter.status === 'done' ? `${g.label}に対応` : g.label}
                      </Typography>
                    </Box>
                  )}
                  {g.items.map((e) => (
                    <InboxRow
                      key={e.message.id}
                      entry={e}
                      now={now}
                      selected={e.message.id === selectedId}
                      onSelect={select}
                      onOpenConversation={openConversation}
                    />
                  ))}
                </Box>
              ))}
              {list.length > visible.length && (
                <Box sx={{ p: 1, textAlign: 'center' }}>
                  <Button variant="ghost" onClick={() => setLimit((n) => n + PAGE)}>
                    さらに表示（残り {list.length - visible.length} 件）
                  </Button>
                </Box>
              )}
            </Card>
          )}
          {list.length > 0 && (
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', py: 2, textAlign: 'center' }}>
              J / K で移動、E で対応済み、S であとで、R で返信。{' '}
              <Button size="sm" variant="ghost" onClick={() => setHelpOpen(true)}>
                すべての操作
              </Button>
            </Typography>
          )}
        </Box>
      </Box>
      <Toast />
    </Stack>
  )
}
