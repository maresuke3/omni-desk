import { Inbox, RefreshCw } from 'lucide-react'
import { actions, isMac, useAppStore, useRateStatus, useSyncActivity } from '@omni-desk/client'
import { routeMatches, type Route } from '@omni-desk/contracts'
import type { FeatureModule, NavEntry, NavSection } from '@omni-desk/contracts/feature'
import { cn, CountBadge } from '@omni-desk/ui'
import { hhmm } from '@omni-desk/message-kit'

/** バッジ・状態のフックを、定義されている項目でだけ呼ぶための小さなコンポーネント */
function Badge({ useBadge }: { useBadge: NonNullable<NavEntry['useBadge']> }) {
  const badge = useBadge()
  return badge ? <CountBadge count={badge.count} tone={badge.tone} /> : null
}

function StatusDot({ useStatus }: { useStatus: NonNullable<NavEntry['useStatus']> }) {
  const status = useStatus()
  if (!status) return null
  return (
    <span
      title={status === 'connected' ? '接続済み' : status === 'demo' ? 'デモデータ' : '未接続'}
      className={cn(
        'size-1.5 rounded-full',
        status === 'connected' && 'bg-success',
        status === 'demo' && 'bg-warning',
        status === 'off' && 'bg-line-strong'
      )}
    />
  )
}

function NavItem({ entry, active, onClick }: { entry: NavEntry; active: boolean; onClick: () => void }) {
  const Icon = entry.icon
  return (
    <button
      onClick={onClick}
      disabled={entry.disabled}
      className={cn(
        'no-drag flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors',
        active ? 'bg-panel font-semibold text-fg shadow-card' : 'text-fg-muted hover:bg-hover hover:text-fg',
        entry.disabled && 'pointer-events-none opacity-55'
      )}
    >
      <span className={cn('flex size-5 items-center justify-center', active ? 'text-accent' : 'text-fg-subtle')}>
        <Icon className="size-4" />
      </span>
      <span className="flex-1 truncate text-left">{entry.label}</span>
      {entry.useBadge && <Badge useBadge={entry.useBadge} />}
      {entry.useStatus && <StatusDot useStatus={entry.useStatus} />}
      {entry.tag && <span className="rounded bg-hover px-1.5 py-px text-[10px] text-fg-subtle">{entry.tag}</span>}
    </button>
  )
}

function SyncStatus() {
  const { syncing, lastSyncedAt } = useSyncActivity()
  const rate = useRateStatus('chatwork')
  const title = rate
    ? `Chatwork API 残り ${rate.remaining} / ${rate.limit} 回（5 分）${rate.queued ? ` · 待機中 ${rate.queued} 件` : ''}`
    : undefined

  return (
    <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[11.5px] text-fg-subtle" title={title}>
      <span>{syncing ? '同期中…' : lastSyncedAt ? `${hhmm(lastSyncedAt)} に更新` : ''}</span>
      <button onClick={actions.refresh} className="no-drag rounded-md p-1 hover:bg-hover hover:text-fg" title="すべて更新">
        <RefreshCw className={cn('size-3.5', syncing && 'animate-spin')} />
      </button>
    </div>
  )
}

const SECTION_TITLE: Partial<Record<NavSection, string>> = { services: 'サービス' }

export function Sidebar({
  features,
  route,
  navigate
}: {
  features: FeatureModule[]
  route: Route
  navigate: (to: Route) => void
}) {
  const demoActive = useAppStore((s) => !!s.settings?.demoActive)
  const entries = features.flatMap((f) => f.nav)
  const section = (s: NavSection): NavEntry[] =>
    entries.filter((e) => e.section === s).sort((a, b) => a.order - b.order)
  const renderEntries = (list: NavEntry[]) =>
    list.map((entry) => (
      <NavItem
        key={entry.id}
        entry={entry}
        active={!entry.disabled && routeMatches(route, entry.route)}
        onClick={() => navigate(entry.route)}
      />
    ))

  return (
    <aside className="drag flex w-[232px] shrink-0 flex-col border-r border-line bg-sidebar">
      <div className={cn('shrink-0', isMac() ? 'h-12' : 'h-3')} />
      <div className="flex items-center gap-2.5 px-4 pb-4">
        <div className="flex size-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#6f6cf0] to-[#3c8ce7] text-white shadow-card">
          <Inbox className="size-[17px]" strokeWidth={2.2} />
        </div>
        <div className="leading-tight">
          <p className="text-[14px] font-semibold tracking-tight">Omni Desk</p>
          <p className="text-[11px] text-fg-subtle">{demoActive ? 'デモモード' : 'ワークスペース'}</p>
        </div>
      </div>

      <nav className="thin-scroll flex-1 space-y-0.5 overflow-y-auto px-2.5">
        {renderEntries(section('primary'))}
        {(['services'] as const).map((s) => {
          const list = section(s)
          if (!list.length) return null
          return (
            <div key={s} className="space-y-0.5">
              <p className="px-2.5 pt-5 pb-1.5 text-[11px] font-semibold tracking-wide text-fg-subtle">{SECTION_TITLE[s]}</p>
              {renderEntries(list)}
            </div>
          )
        })}
      </nav>

      <div className="shrink-0 space-y-0.5 border-t border-line px-2.5 py-2.5">
        <SyncStatus />
        {renderEntries(section('footer'))}
      </div>
    </aside>
  )
}
