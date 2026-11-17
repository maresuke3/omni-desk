import { useState, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from 'react'
import {
  Alert,
  Avatar as MuiAvatar,
  Box,
  Button as MuiButton,
  Card,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton as MuiIconButton,
  InputAdornment,
  LinearProgress,
  ListItemButton,
  Menu,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Snackbar,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material'
import { CircleAlert, Plug, RefreshCw } from 'lucide-react'
import type { Source } from '@omni-desk/contracts'

// Re-export library-agnostic layout & feedback primitives wrapped from MUI
export {
  Alert,
  Box,
  Card,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  InputAdornment,
  LinearProgress,
  ListItemButton,
  Menu,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Snackbar,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography
}

export type TextFieldProps = ComponentProps<typeof TextField>
export type BoxProps = ComponentProps<typeof Box>
export type StackProps = ComponentProps<typeof Stack>

// ------------------------------------------------------------ source

export const SOURCE_LABEL: Record<Source, string> = { slack: 'Slack', chatwork: 'Chatwork' }

export function SourceMark({ source, size = 'sm' }: { source: Source; size?: 'xs' | 'sm' | 'md' }) {
  const px = size === 'xs' ? 16 : size === 'sm' ? 24 : 32
  const fontSize = size === 'md' ? 16 : 12
  return (
    <Tooltip title={SOURCE_LABEL[source]}>
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          flexShrink: 0,
          alignItems: 'center',
          justifyContent: 'center',
          width: px,
          height: px,
          borderRadius: 1,
          fontSize,
          fontWeight: 700,
          lineHeight: 1,
          bgcolor: source === 'slack' ? 'rgba(123, 47, 134, 0.12)' : 'rgba(223, 68, 55, 0.12)',
          color: source === 'slack' ? '#7b2f86' : '#df4437'
        }}
      >
        {source === 'slack' ? 'S' : 'C'}
      </Box>
    </Tooltip>
  )
}

export function SourcePill({ source }: { source: Source }) {
  const color = source === 'slack' ? '#7b2f86' : '#df4437'
  const bg = source === 'slack' ? 'rgba(123, 47, 134, 0.12)' : 'rgba(223, 68, 55, 0.12)'
  return (
    <Chip
      size="small"
      label={
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
          <span>{SOURCE_LABEL[source]}</span>
        </Stack>
      }
      sx={{
        bgcolor: bg,
        color,
        fontWeight: 500,
        border: 'none',
        height: 24
      }}
    />
  )
}

// ------------------------------------------------------------ avatar

const AVATAR_COLORS = [
  { bg: '#e8eefc', fg: '#3456b8', darkBg: '#24314f', darkFg: '#a9bdf5' },
  { bg: '#fbeae5', fg: '#b34a2b', darkBg: '#43281f', darkFg: '#f3b49f' },
  { bg: '#e6f4ec', fg: '#22744a', darkBg: '#1d3a2b', darkFg: '#9ad8b5' },
  { bg: '#f6eefa', fg: '#7d3a9a', darkBg: '#382545', darkFg: '#d6aee8' },
  { bg: '#fff3dc', fg: '#9a6200', darkBg: '#3d3019', darkFg: '#f0cd8c' },
  { bg: '#e5f4f6', fg: '#1f6f7c', darkBg: '#1b363b', darkFg: '#93d3dd' }
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
  const palette = AVATAR_COLORS[hash(name) % AVATAR_COLORS.length]
  const fontSize = size >= 32 ? 16 : 12

  if (url && !failed) {
    return (
      <MuiAvatar
        src={url}
        alt=""
        variant="rounded"
        className={className}
        slotProps={{
          img: {
            draggable: false,
            referrerPolicy: 'no-referrer',
            onError: () => setFailed(true)
          }
        }}
        sx={{ width: size, height: size, borderRadius: 1, flexShrink: 0 }}
      />
    )
  }

  return (
    <MuiAvatar
      variant="rounded"
      className={className}
      sx={(theme) => ({
        width: size,
        height: size,
        borderRadius: 1,
        flexShrink: 0,
        fontSize,
        fontWeight: 600,
        bgcolor: theme.palette.mode === 'dark' ? palette.darkBg : palette.bg,
        color: theme.palette.mode === 'dark' ? palette.darkFg : palette.fg
      })}
    >
      {initials(name)}
    </MuiAvatar>
  )
}

// ------------------------------------------------------------ buttons

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  loading?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const muiVariant = variant === 'primary' ? 'contained' : variant === 'ghost' ? 'text' : 'outlined'
  const muiColor = variant === 'danger' ? 'error' : 'primary'

  return (
    <MuiButton
      {...rest}
      type={type}
      variant={muiVariant}
      color={muiColor}
      size={size === 'sm' ? 'small' : 'medium'}
      disabled={disabled || loading}
      className={className ? `no-drag ${className}` : 'no-drag'}
      startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
      sx={(theme) => ({
        ...(variant === 'secondary' && {
          borderColor: theme.palette.divider,
          color: theme.palette.text.primary,
          bgcolor: theme.palette.background.paper,
          '&:hover': {
            bgcolor: theme.palette.action.hover,
            borderColor: theme.palette.divider
          }
        }),
        ...(variant === 'ghost' && {
          color: theme.palette.text.secondary,
          '&:hover': {
            bgcolor: theme.palette.action.hover,
            color: theme.palette.text.primary
          }
        }),
        ...(variant === 'danger' && {
          borderColor: theme.palette.divider,
          bgcolor: theme.palette.background.paper
        })
      })}
    >
      {children}
    </MuiButton>
  )
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> & { label: string }) {
  return (
    <Tooltip title={label}>
      <span className="no-drag inline-flex">
        <MuiIconButton
          type="button"
          {...rest}
          aria-label={label}
          size="small"
          className={className}
          sx={{
            width: 32,
            height: 32,
            color: 'text.secondary',
            '&:hover': { color: 'text.primary', bgcolor: 'action.hover' }
          }}
        >
          {children}
        </MuiIconButton>
      </span>
    </Tooltip>
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
    <ToggleButtonGroup
      exclusive
      value={value}
      onChange={(_, next: T | null) => {
        if (next !== null) onChange(next)
      }}
      size="small"
      className="no-drag"
      sx={(theme) => ({
        bgcolor: theme.palette.mode === 'dark' ? '#12151a' : '#f6f7f9',
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 1,
        p: '4px',
        gap: '4px',
        '& .MuiToggleButtonGroup-grouped': {
          border: 0,
          borderRadius: '6px !important',
          textTransform: 'none',
          px: size === 'sm' ? 1 : 2,
          py: '4px',
          minHeight: size === 'sm' ? 24 : 32,
          fontSize: size === 'sm' ? '12px' : '16px',
          fontWeight: 500,
          color: theme.palette.text.secondary,
          gap: 1,
          '&.Mui-selected': {
            bgcolor: theme.palette.background.paper,
            color: theme.palette.text.primary,
            boxShadow: '0 1px 2px rgba(16, 24, 40, 0.08)',
            '&:hover': {
              bgcolor: theme.palette.background.paper
            }
          }
        }
      })}
    >
      {options.map((o) => (
        <ToggleButton key={o.value} value={o.value}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <span>{o.label}</span>
            {o.count !== undefined && (
              <Box
                component="span"
                sx={{
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: '12px',
                  color: value === o.value ? 'text.secondary' : 'text.disabled'
                }}
              >
                {o.count}
              </Box>
            )}
          </Stack>
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
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
    <Box
      component="header"
      className="drag"
      sx={(theme) => ({
        position: 'relative',
        zIndex: 20,
        flexShrink: 0,
        borderBottom: `1px solid ${theme.palette.divider}`,
        bgcolor: theme.palette.background.paper,
        px: 3,
        pt: 3,
        pb: 2
      })}
    >
      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h1" component="h1">
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {actions && (
          <Stack direction="row" spacing={1} className="no-drag" sx={{ alignItems: 'center', flexShrink: 0 }}>
            {actions}
          </Stack>
        )}
      </Stack>
      {children && (
        <Box className="no-drag" sx={{ mt: 2 }}>
          {children}
        </Box>
      )}
    </Box>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
      <Typography variant="h2" component="h2" sx={{ fontSize: '16px', fontWeight: 600 }}>
        {children}
      </Typography>
      {right}
    </Stack>
  )
}

export function CountBadge({ count, tone = 'accent' }: { count?: number; tone?: 'accent' | 'danger' | 'muted' }) {
  if (!count) return null
  return (
    <Chip
      size="small"
      label={count > 99 ? '99+' : count}
      color={tone === 'accent' ? 'primary' : tone === 'danger' ? 'error' : 'default'}
      sx={{
        height: 24,
        minWidth: 24,
        borderRadius: 999,
        fontSize: '12px',
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        '& .MuiChip-label': { px: 1 }
      }}
    />
  )
}

// ------------------------------------------------------------ states

export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <Stack sx={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', px: 3, py: 7 }}>
      <Box
        sx={(theme) => ({
          mb: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 48,
          height: 48,
          borderRadius: 2,
          bgcolor: theme.palette.mode === 'dark' ? '#12151a' : '#f6f7f9',
          color: 'text.disabled'
        })}
      >
        {icon}
      </Box>
      <Typography variant="body1" sx={{ fontWeight: 500 }}>
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 400 }}>
          {description}
        </Typography>
      )}
      {action && <Box sx={{ mt: 2 }}>{action}</Box>}
    </Stack>
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
  const code = error.code
  const needsSettings = code === 'auth_error' || code === 'not_configured'
  return (
    <Alert
      severity="error"
      icon={<CircleAlert size={16} />}
      sx={{ py: compact ? 1 : 2, px: 2 }}
      action={
        <Stack direction="row" spacing={1}>
          {needsSettings && onOpenSettings ? (
            <Button size="sm" onClick={onOpenSettings}>
              設定を開く
            </Button>
          ) : (
            onRetry && (
              <Button size="sm" variant="ghost" onClick={onRetry}>
                <RefreshCw size={16} />
                再試行
              </Button>
            )
          )}
        </Stack>
      }
    >
      {source && <strong>{SOURCE_LABEL[source]}：</strong>}
      {error.message}
    </Alert>
  )
}

export function NotConnected({ source, onOpenSettings }: { source: Source; onOpenSettings: () => void }) {
  return (
    <EmptyState
      icon={<Plug size={24} />}
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
    <Stack spacing={2} sx={{ p: 1 }}>
      {Array.from({ length: rows }, (_, i) => (
        <Stack key={i} direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
          {avatar && <Skeleton variant="rounded" width={32} height={32} sx={{ flexShrink: 0 }} />}
          <Stack spacing={1} sx={{ flex: 1 }}>
            <Skeleton variant="text" width={160} height={16} />
            <Skeleton variant="text" width={`${55 + ((i * 17) % 40)}%`} height={16} />
          </Stack>
        </Stack>
      ))}
    </Stack>
  )
}
