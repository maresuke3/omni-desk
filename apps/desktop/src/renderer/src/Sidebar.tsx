import { Inbox, Moon, RefreshCw, Sun } from 'lucide-react'
import { actions, isMac, useAppStore, useRateStatus, useSyncActivity } from '@omni-desk/client'
import { routeMatches, type Route } from '@omni-desk/contracts'
import type { FeatureModule, NavEntry, NavSection } from '@omni-desk/contracts/feature'
import { Box, Chip, CountBadge, IconButton, ListItemButton, Stack, Switch, Tooltip, Typography, type ColorMode } from '@omni-desk/ui'
import { hhmm } from '@omni-desk/message-kit'

/** バッジ・状態のフックを、定義されている項目でだけ呼ぶための小さなコンポーネント */
function Badge({ useBadge }: { useBadge: NonNullable<NavEntry['useBadge']> }) {
  const badge = useBadge()
  return badge ? <CountBadge count={badge.count} tone={badge.tone} /> : null
}

function StatusDot({ useStatus }: { useStatus: NonNullable<NavEntry['useStatus']> }) {
  const status = useStatus()
  if (!status) return null
  const label = status === 'connected' ? '接続済み' : status === 'demo' ? 'デモデータ' : '未接続'
  return (
    <Tooltip title={label}>
      <Box
        component="span"
        sx={(theme) => ({
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor:
            status === 'connected'
              ? theme.palette.success.main
              : status === 'demo'
                ? theme.palette.warning.main
                : theme.palette.divider
        })}
      />
    </Tooltip>
  )
}

function NavItem({ entry, active, compact, onClick }: { entry: NavEntry; active: boolean; compact?: boolean; onClick: () => void }) {
  const Icon = entry.icon
  const rowHeight = compact ? 32 : 40
  return (
    <ListItemButton
      onClick={onClick}
      disabled={entry.disabled}
      selected={active}
      className="no-drag"
      sx={(theme) => ({
        borderRadius: 0,
        px: 2,
        py: 0,
        minHeight: rowHeight,
        height: rowHeight,
        gap: 1,
        color: active ? theme.palette.text.primary : theme.palette.text.secondary,
        bgcolor: active ? `${theme.palette.background.paper} !important` : 'transparent',
        boxShadow: active ? `inset 3px 0 0 ${theme.palette.primary.main}` : 'none',
        '&:hover': {
          bgcolor: active ? theme.palette.background.paper : theme.palette.action.hover,
          color: theme.palette.text.primary
        }
      })}
    >
      <Box
        component="span"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          color: active ? 'primary.main' : 'text.disabled',
          '& svg': { width: 16, height: 16 }
        }}
      >
        <Icon />
      </Box>
      <Typography
        variant="body1"
        sx={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: compact ? '12px' : '16px',
          fontWeight: active ? 600 : 400
        }}
      >
        {entry.label}
      </Typography>
      {entry.useBadge && <Badge useBadge={entry.useBadge} />}
      {entry.useStatus && <StatusDot useStatus={entry.useStatus} />}
      {entry.tag && <Chip size="small" label={entry.tag} sx={{ height: 24, fontSize: '12px' }} />}
    </ListItemButton>
  )
}

function SyncStatus() {
  const { syncing, lastSyncedAt } = useSyncActivity()
  const rate = useRateStatus('chatwork')
  const title = rate
    ? `Chatwork API 残り ${rate.remaining} / ${rate.limit} 回（5 分）${rate.queued ? ` · 待機中 ${rate.queued} 件` : ''}`
    : ''

  return (
    <Tooltip title={title}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', px: 1, py: 1 }}>
        <Typography variant="caption" color="text.disabled">
          {syncing ? '同期中…' : lastSyncedAt ? `${hhmm(lastSyncedAt)} に更新` : ''}
        </Typography>
        <IconButton label="すべて更新" onClick={actions.refresh}>
          <RefreshCw size={16} style={syncing ? { animation: 'spin 1s linear infinite' } : undefined} />
        </IconButton>
      </Stack>
    </Tooltip>
  )
}

function ThemeSwitchRow({ mode }: { mode: ColorMode }) {
  const isDark = mode === 'dark'
  return (
    <Stack
      direction="row"
      spacing={1}
      className="no-drag"
      sx={{ alignItems: 'center', justifyContent: 'space-between', px: 1, py: 0.5 }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: 'text.secondary' }}>
        {isDark ? <Moon size={16} /> : <Sun size={16} />}
        <Typography variant="caption" color="text.secondary">
          {isDark ? 'ダークモード' : 'ライトモード'}
        </Typography>
      </Stack>
      <Switch
        size="small"
        checked={isDark}
        onChange={(_, checked) => void actions.updateSettings({ theme: checked ? 'dark' : 'light' })}
        slotProps={{ input: { 'aria-label': 'ダークモード切替' } }}
      />
    </Stack>
  )
}

const SECTION_TITLE: Partial<Record<NavSection, string>> = { services: 'サービス' }

export function Sidebar({
  features,
  route,
  mode,
  navigate
}: {
  features: FeatureModule[]
  route: Route
  mode: ColorMode
  navigate: (to: Route) => void
}) {
  const demoActive = useAppStore((s) => !!s.settings?.demoActive)
  const entries = features.flatMap((f) => f.nav)
  const section = (s: NavSection): NavEntry[] =>
    entries.filter((e) => e.section === s).sort((a, b) => a.order - b.order)
  const renderEntries = (list: NavEntry[], compact = false) =>
    list.map((entry) => (
      <NavItem
        key={entry.id}
        entry={entry}
        compact={compact}
        active={!entry.disabled && routeMatches(route, entry.route)}
        onClick={() => navigate(entry.route)}
      />
    ))

  return (
    <Stack
      component="aside"
      className="drag"
      sx={(theme) => ({
        width: 232,
        flexShrink: 0,
        borderRight: `1px solid ${theme.palette.divider}`,
        bgcolor: theme.palette.mode === 'dark' ? '#13161b' : '#eceef2'
      })}
    >
      {isMac() && <Box sx={{ flexShrink: 0, height: 32 }} />}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 2, py: 2 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: 1,
            background: 'linear-gradient(135deg, #6f6cf0, #3c8ce7)',
            color: '#fff'
          }}
        >
          <Inbox size={16} strokeWidth={2.2} />
        </Box>
        <Box>
          <Typography variant="body1" sx={{ fontSize: '16px', fontWeight: 600, lineHeight: 1.2 }}>
            Omni Desk
          </Typography>
          <Typography variant="caption" color="text.disabled">
            {demoActive ? 'デモモード' : 'ワークスペース'}
          </Typography>
        </Box>
      </Stack>

      <Stack component="nav" spacing={0} sx={{ flex: 1, overflowY: 'auto' }}>
        {renderEntries(section('primary'))}
        {(['services'] as const).map((s) => {
          const list = section(s)
          if (!list.length) return null
          return (
            <Stack key={s} spacing={0}>
              <Typography variant="caption" color="text.disabled" sx={{ px: 2, pt: 2, pb: 1, fontWeight: 600 }}>
                {SECTION_TITLE[s]}
              </Typography>
              {renderEntries(list, true)}
            </Stack>
          )
        })}
      </Stack>

      <Stack
        spacing={0}
        sx={(theme) => ({
          flexShrink: 0,
          borderTop: `1px solid ${theme.palette.divider}`
        })}
      >
        <Box sx={{ px: 1 }}>
          <ThemeSwitchRow mode={mode} />
          <SyncStatus />
        </Box>
        {renderEntries(section('footer'))}
      </Stack>
    </Stack>
  )
}
