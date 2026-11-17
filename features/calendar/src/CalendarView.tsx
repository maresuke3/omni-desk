import { useMemo, useState } from 'react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  Video
} from 'lucide-react'
import type { CalendarCreateInput, CalendarEvent } from '@omni-desk/contracts'
import { routes } from '@omni-desk/contracts'
import { actions, openExternal, useAsyncAction, useCalendar, useSettings } from '@omni-desk/client'
import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  EmptyState,
  FormControlLabel,
  IconButton,
  PageHeader,
  Segmented,
  Stack,
  TextField,
  Typography
} from '@omni-desk/ui'

type ViewRange = 'today' | 'week' | 'all'

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function toDateInput(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toTimeInput(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
}

function formatDayHeading(dayMs: number, todayMs: number): string {
  const label = new Date(dayMs).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
  if (dayMs === todayMs) return `${label} · 今日`
  if (dayMs === todayMs + 86_400_000) return `${label} · 明日`
  return label
}

interface EventFormState {
  title: string
  date: string
  startTime: string
  endTime: string
  isAllDay: boolean
  location: string
  description: string
}

function defaultForm(baseDayMs: number, editing?: CalendarEvent): EventFormState {
  if (editing) {
    return {
      title: editing.title,
      date: toDateInput(editing.startAt),
      startTime: toTimeInput(editing.startAt),
      endTime: toTimeInput(editing.endAt),
      isAllDay: editing.isAllDay,
      location: editing.location ?? '',
      description: editing.description ?? ''
    }
  }
  return {
    title: '',
    date: toDateInput(baseDayMs),
    startTime: '10:00',
    endTime: '11:00',
    isAllDay: false,
    location: '',
    description: ''
  }
}

function EventModal({
  editing,
  baseDayMs,
  onClose
}: {
  editing?: CalendarEvent
  baseDayMs: number
  onClose: () => void
}) {
  const [form, setForm] = useState<EventFormState>(() => defaultForm(baseDayMs, editing))
  const create = useAsyncAction(actions.createCalendarEvent)
  const update = useAsyncAction(actions.updateCalendarEvent)
  const pending = create.pending || update.pending
  const error = create.error || update.error

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) return

    const dayStart = Date.parse(`${form.date}T00:00:00`)
    const startAt = form.isAllDay ? dayStart : Date.parse(`${form.date}T${form.startTime}:00`)
    const endAt = form.isAllDay
      ? dayStart + 86_400_000
      : Math.max(startAt + 15 * 60_000, Date.parse(`${form.date}T${form.endTime}:00`))

    const payload: CalendarCreateInput = {
      title: form.title.trim(),
      startAt,
      endAt,
      isAllDay: form.isAllDay,
      location: form.location.trim() || undefined,
      description: form.description.trim() || undefined
    }

    const ok = editing ? await update.run(editing.calendarId, editing.id, payload) : await create.run(payload)
    if (ok) onClose()
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <form onSubmit={(e) => void submit(e)}>
        <DialogTitle>{editing ? '予定を編集' : '予定を作成'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField
              required
              label="タイトル"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="定例ミーティング"
              fullWidth
            />
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <TextField
                type="date"
                required
                label="日付"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ flex: 1 }}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.isAllDay}
                    onChange={(e) => setForm({ ...form, isAllDay: e.target.checked })}
                  />
                }
                label="終日"
              />
            </Stack>
            {!form.isAllDay && (
              <Stack direction="row" spacing={2}>
                <TextField
                  type="time"
                  required
                  label="開始"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }}
                  fullWidth
                />
                <TextField
                  type="time"
                  required
                  label="終了"
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }}
                  fullWidth
                />
              </Stack>
            )}
            <TextField
              label="場所（任意）"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="会議室 / オンライン"
              fullWidth
            />
            <TextField
              multiline
              rows={3}
              label="メモ（任意）"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="アジェンダや共有事項"
              fullWidth
            />
            {error && <Alert severity="error">{error.message}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit" variant="primary" loading={pending} disabled={!form.title.trim()}>
            {editing ? '更新する' : '作成する'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export function CalendarView() {
  const settings = useSettings()
  const calendar = useCalendar()
  const [range, setRange] = useState<ViewRange>('week')
  const [anchorDay, setAnchorDay] = useState(() => startOfDay(Date.now()))
  const [modal, setModal] = useState<{ open: boolean; editing?: CalendarEvent }>({ open: false })
  const remove = useAsyncAction(actions.deleteCalendarEvent)

  const todayMs = startOfDay(Date.now())
  const filtered = useMemo(() => {
    const min = range === 'today' ? anchorDay : range === 'week' ? anchorDay : 0
    const max =
      range === 'today' ? anchorDay + 86_400_000 : range === 'week' ? anchorDay + 7 * 86_400_000 : Number.MAX_SAFE_INTEGER

    return calendar.events.filter((ev) => ev.endAt > min && ev.startAt < max)
  }, [calendar.events, range, anchorDay])

  const grouped = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>()
    for (const ev of filtered) {
      const day = startOfDay(ev.startAt)
      const list = map.get(day) ?? []
      list.push(ev)
      map.set(day, list)
    }
    return [...map.entries()].sort(([a], [b]) => a - b)
  }, [filtered])

  const subtitle = settings.googleCalendar
    ? `${settings.googleCalendar.email} の予定`
    : settings.demoActive
      ? 'デモデータを表示中（設定から Google アカウントを連携できます）'
      : 'Google Calendar 未接続'

  return (
    <Stack sx={{ height: '100%' }}>
      <PageHeader
        title="カレンダー"
        subtitle={subtitle}
        actions={
          <>
            <Button size="sm" onClick={() => actions.refreshCalendar()} loading={calendar.loading}>
              <RefreshCw size={16} />
              更新
            </Button>
            <Button size="sm" variant="primary" onClick={() => setModal({ open: true })}>
              <Plus size={16} />
              予定を作成
            </Button>
          </>
        }
      />

      <Stack
        direction="row"
        spacing={2}
        sx={(theme) => ({
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${theme.palette.divider}`,
          px: 3,
          py: 2
        })}
      >
        <Segmented<ViewRange>
          size="sm"
          value={range}
          onChange={setRange}
          options={[
            { value: 'today', label: '今日' },
            { value: 'week', label: '7 日間' },
            { value: 'all', label: 'すべて' }
          ]}
        />
        {range !== 'all' && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <IconButton label="前へ" onClick={() => setAnchorDay((d) => d - (range === 'today' ? 1 : 7) * 86_400_000)}>
              <ChevronLeft size={16} />
            </IconButton>
            <Button size="sm" onClick={() => setAnchorDay(todayMs)}>
              今日
            </Button>
            <IconButton label="次へ" onClick={() => setAnchorDay((d) => d + (range === 'today' ? 1 : 7) * 86_400_000)}>
              <ChevronRight size={16} />
            </IconButton>
          </Stack>
        )}
      </Stack>

      <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 3 }}>
        <Stack spacing={3} sx={{ mx: 'auto', maxWidth: 824 }}>
          {calendar.error && <Alert severity="error">{calendar.error.message}</Alert>}

          {!settings.googleCalendar && !settings.demoActive ? (
            <EmptyState
              icon={<CalendarDays size={24} />}
              title="Google Calendar が未接続です"
              description="設定画面から Google OAuth 連携を行うと、予定の確認・作成・Google Meet への参加ができます。"
              action={
                <Button variant="primary" onClick={() => actions.navigate(routes.settings())}>
                  設定を開く
                </Button>
              }
            />
          ) : grouped.length === 0 ? (
            <EmptyState
              icon={<CalendarDays size={24} />}
              title="この期間の予定はありません"
              description="右上の「予定を作成」から新しい予定を追加できます。"
            />
          ) : (
            grouped.map(([day, events]) => (
              <Stack key={day} spacing={1}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {formatDayHeading(day, todayMs)}
                </Typography>
                <Card sx={{ overflow: 'hidden' }}>
                  <Stack divider={<Divider />}>
                    {events.map((ev) => {
                      const isPast = ev.endAt < Date.now()
                      return (
                        <Stack
                          key={ev.id}
                          direction="row"
                          spacing={2}
                          sx={{ alignItems: 'flex-start', px: 2, py: 2, opacity: isPast ? 0.65 : 1 }}
                        >
                          <Typography variant="caption" color="text.secondary" sx={{ width: 112, flexShrink: 0, pt: 0.5 }}>
                            {ev.isAllDay ? '終日' : `${formatTime(ev.startAt)} – ${formatTime(ev.endAt)}`}
                          </Typography>
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography variant="body1" sx={{ fontWeight: 500 }}>
                              {ev.title}
                            </Typography>
                            <Stack direction="row" spacing={2} sx={{ mt: 0.5, flexWrap: 'wrap', alignItems: 'center', color: 'text.secondary' }}>
                              {ev.location && (
                                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                                  <MapPin size={12} />
                                  <Typography variant="caption">{ev.location}</Typography>
                                </Stack>
                              )}
                              {ev.attendees && ev.attendees.length > 0 && (
                                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                                  <Users size={12} />
                                  <Typography variant="caption">{ev.attendees.length} 名</Typography>
                                </Stack>
                              )}
                            </Stack>
                            {ev.description && (
                              <Typography
                                variant="caption"
                                color="text.disabled"
                                sx={{
                                  mt: 1,
                                  overflow: 'hidden',
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical'
                                }}
                              >
                                {ev.description}
                              </Typography>
                            )}
                          </Box>
                          <Stack direction="row" spacing={1} sx={{ flexShrink: 0, alignItems: 'center' }}>
                            {ev.meetUrl && (
                              <Button size="sm" variant="primary" onClick={() => openExternal(ev.meetUrl!)}>
                                <Video size={16} />
                                参加
                              </Button>
                            )}
                            <IconButton label="編集" onClick={() => setModal({ open: true, editing: ev })}>
                              <Pencil size={16} />
                            </IconButton>
                            <IconButton
                              label="削除"
                              disabled={remove.pending}
                              onClick={() => void remove.run(ev.calendarId, ev.id)}
                            >
                              <Trash2 size={16} />
                            </IconButton>
                            <IconButton label="Google Calendar で開く" onClick={() => openExternal(ev.htmlLink)}>
                              <ExternalLink size={16} />
                            </IconButton>
                          </Stack>
                        </Stack>
                      )
                    })}
                  </Stack>
                </Card>
              </Stack>
            ))
          )}
        </Stack>
      </Box>

      {modal.open && (
        <EventModal editing={modal.editing} baseDayMs={anchorDay} onClose={() => setModal({ open: false })} />
      )}
    </Stack>
  )
}
