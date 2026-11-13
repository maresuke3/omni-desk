import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { CircleAlert, LoaderCircle, Plug, RefreshCw } from 'lucide-react'
import type { Source } from '@omni-desk/contracts'
import { cn } from './cn'

// ------------------------------------------------------------ source

export const SOURCE_LABEL: Record<Source, string> = { slack: 'Slack', chatwork: 'Chatwork' }

export function SourceMark({ source, size = 'sm' }: { source: Source; size?: 'xs' | 'sm' | 'md' }) {
  const dims = { xs: 'size-4 text-[9px] rounded', sm: 'size-5 text-[10px] rounded-md', md: 'size-7 text-xs rounded-lg' }[size]
  return (
    <span
      title={SOURCE_LABEL[source]}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-bold leading-none',
        dims,
        source === 'slack' ? 'bg-slack-soft text-slack' : 'bg-chatwork-soft text-chatwork'
      )}
    >
      {source === 'slack' ? 'S' : 'C'}
    </span>
  )
}

export function SourcePill({ source }: { source: Source }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        source === 'slack' ? 'bg-slack-soft text-slack' : 'bg-chatwork-soft text-chatwork'
      )}
    >
      <span className={cn('size-1.5 rounded-full', source === 'slack' ? 'bg-slack' : 'bg-chatwork')} />
      {SOURCE_LABEL[source]}
    </span>
  )
}

// ------------------------------------------------------------ avatar

const AVATAR_COLORS = [
  'bg-[#e8eefc] text-[#3456b8] dark:bg-[#24314f] dark:text-[#a9bdf5]',
  'bg-[#fbeae5] text-[#b34a2b] dark:bg-[#43281f] dark:text-[#f3b49f]',
  'bg-[#e6f4ec] text-[#22744a] dark:bg-[#1d3a2b] dark:text-[#9ad8b5]',
  'bg-[#f6eefa] text-[#7d3a9a] dark:bg-[#382545] dark:text-[#d6aee8]',
  'bg-[#fff3dc] text-[#9a6200] dark:bg-[#3d3019] dark:text-[#f0cd8c]',
  'bg-[#e5f4f6] text-[#1f6f7c] dark:bg-[#1b363b] dark:text-[#93d3dd]'
]

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function initials(name: string): string {
  const cleaned = name.replace(/[（(].*?[)）]/g, '').trim()
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length >= 2 && /^[A-Za-z]/.test(parts[0])) return (parts[0][0] + parts[1][0]).toUpperCase()
  return [...(parts[0] ?? '?')].slice(0, 1).join('').toUpperCase()
}

export function Avatar({
  name,
  url,
  size = 32,
  className
}: {
  name: string
  url?: string
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.4)) }
  const radius = size >= 28 ? 'rounded-lg' : 'rounded-md'
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        draggable={false}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={style}
        className={cn('shrink-0 object-cover', radius, className)}
      />
    )
  }
  return (
    <span
      style={style}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-semibold',
        radius,
        AVATAR_COLORS[hash(name) % AVATAR_COLORS.length],
        className
      )}
    >
      {initials(name)}
    </span>
  )
}

// ------------------------------------------------------------ buttons

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  loading?: boolean
}

export function Button({ variant = 'secondary', size = 'md', loading, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'no-drag inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
        variant === 'primary' && 'bg-accent text-accent-fg hover:brightness-110',
        variant === 'secondary' && 'border border-line bg-panel text-fg hover:bg-hover',
        variant === 'ghost' && 'text-fg-muted hover:bg-hover hover:text-fg',
        variant === 'danger' && 'border border-line bg-panel text-danger hover:bg-danger-soft',
        className
      )}
    >
      {loading && <LoaderCircle className="size-3.5 animate-spin" />}
      {children}
    </button>
  )
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      {...rest}
      title={label}
      aria-label={label}
      className={cn(
        'no-drag inline-flex size-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-hover hover:text-fg disabled:opacity-40',
        className
      )}
    >
      {children}
    </button>
  )
}

// ------------------------------------------------------------ segmented

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md'
}: {
  value: T
  options: { value: T; label: ReactNode; count?: number }[]
  onChange: (value: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div className="no-drag inline-flex rounded-lg border border-line bg-sunken p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md font-medium transition-colors',
            size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 px-3 text-[12.5px]',
            value === o.value ? 'bg-panel text-fg shadow-card dark:bg-line-strong' : 'text-fg-muted hover:text-fg'
          )}
        >
          {o.label}
          {o.count !== undefined && (
            <span className={cn('tabular-nums text-[11px]', value === o.value ? 'text-fg-muted' : 'text-fg-subtle')}>
              {o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ------------------------------------------------------------ layout

export function PageHeader({
  title,
  subtitle,
  actions,
  children
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="drag shrink-0 border-b border-line bg-panel/70 px-7 pt-5 pb-4 backdrop-blur">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-[12.5px] text-fg-muted">{subtitle}</p>}
        </div>
        {actions && <div className="no-drag flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="no-drag mt-4">{children}</div>}
    </header>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <h2 className="text-[13px] font-semibold text-fg">{children}</h2>
      {right}
    </div>
  )
}

export function CountBadge({ count, tone = 'accent' }: { count?: number; tone?: 'accent' | 'danger' | 'muted' }) {
  if (!count) return null
  return (
    <span
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums',
        tone === 'accent' && 'bg-accent text-accent-fg',
        tone === 'danger' && 'bg-danger text-white dark:text-canvas',
        tone === 'muted' && 'bg-line text-fg-muted'
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

// ------------------------------------------------------------ states

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-sunken text-fg-subtle">{icon}</div>
      <p className="font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[12.5px] text-fg-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorNotice({
  error,
  source,
  onRetry,
  onOpenSettings,
  compact
}: {
  error: { message: string; code?: string }
  source?: Source
  onRetry?: () => void
  onOpenSettings?: () => void
  compact?: boolean
}) {
  // ApiError（@omni-desk/client）に依存しないよう code の有無で判定する
  const code = error.code
  const needsSettings = code === 'auth_error' || code === 'not_configured'
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft text-[12.5px]',
        compact ? 'px-3 py-2' : 'px-3.5 py-3'
      )}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <p className="text-fg">
          {source && <span className="font-semibold">{SOURCE_LABEL[source]}：</span>}
          {error.message}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        {needsSettings && onOpenSettings ? (
          <Button size="sm" onClick={onOpenSettings}>
            設定を開く
          </Button>
        ) : (
          onRetry && (
            <Button size="sm" variant="ghost" onClick={onRetry}>
              <RefreshCw className="size-3.5" />
              再試行
            </Button>
          )
        )}
      </div>
    </div>
  )
}

export function NotConnected({ source, onOpenSettings }: { source: Source; onOpenSettings: () => void }) {
  return (
    <EmptyState
      icon={<Plug className="size-5" />}
      title={`${SOURCE_LABEL[source]} が未接続です`}
      description={`設定画面でトークンを登録すると、${SOURCE_LABEL[source]} のメッセージとタスクがここに表示されます。`}
      action={
        <Button variant="primary" onClick={onOpenSettings}>
          {SOURCE_LABEL[source]} を接続
        </Button>
      }
    />
  )
}

export function SkeletonList({ rows = 5, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <div className="space-y-4 p-1">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3">
          {avatar && <div className="skeleton size-8 shrink-0 rounded-lg" />}
          <div className="flex-1 space-y-2 pt-0.5">
            <div className="skeleton h-3 w-40" />
            <div className="skeleton h-3" style={{ width: `${55 + ((i * 17) % 40)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
