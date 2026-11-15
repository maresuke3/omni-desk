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
  Video,
  X
} from 'lucide-react'
import type { CalendarCreateInput, CalendarEvent } from '@omni-desk/contracts'
import { routes } from '@omni-desk/contracts'
import { actions, openExternal, useAsyncAction, useCalendar, useSettings } from '@omni-desk/client'
import { Button, EmptyState, PageHeader, Segmented, cn } from '@omni-desk/ui'

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

    const ok = editing
      ? await update.run(editing.calendarId, editing.id, payload)
      : await create.run(payload)
    if (ok) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="card w-full max-w-md overflow-hidden shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[14px] font-semibold">{editing ? '予定を編集' : '予定を作成'}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-fg-subtle hover:bg-sunken hover:text-fg">
            <X className="size-4" />
          </button>
        </div>
        <form onSubmit={(e) => void submit(e)} className="space-y-3.5 p-5">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium">タイトル</span>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="定例ミーティング"
              className="h-9 w-full rounded-lg border border-line bg-sunken px-3 text-[13px] outline-none focus:border-accent focus:bg-panel"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium">日付</span>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="h-9 w-full rounded-lg border border-line bg-sunken px-3 text-[13px] outline-none focus:border-accent focus:bg-panel"
              />
            </label>
            <label className="flex items-end gap-2 pb-2 text-[12.5px]">
              <input
                type="checkbox"
                checked={form.isAllDay}
                onChange={(e) => setForm({ ...form, isAllDay: e.target.checked })}
                className="size-4 accent-accent"
              />
              終日
            </label>
          </div>
          {!form.isAllDay && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium">開始</span>
                <input
                  type="time"
                  required
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  className="h-9 w-full rounded-lg border border-line bg-sunken px-3 text-[13px] outline-none focus:border-accent focus:bg-panel"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium">終了</span>
                <input
                  type="time"
                  required
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                  className="h-9 w-full rounded-lg border border-line bg-sunken px-3 text-[13px] outline-none focus:border-accent focus:bg-panel"
                />
              </label>
            </div>
          )}
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium">場所（任意）</span>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="会議室 / オンライン"
              className="h-9 w-full rounded-lg border border-line bg-sunken px-3 text-[13px] outline-none focus:border-accent focus:bg-panel"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium">メモ（任意）</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="アジェンダや共有事項"
              className="w-full rounded-lg border border-line bg-sunken p-3 text-[13px] outline-none focus:border-accent focus:bg-panel"
            />
          </label>
          {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">{error.message}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" onClick={onClose}>
              キャンセル
            </Button>
            <Button type="submit" variant="primary" loading={pending} disabled={!form.title.trim()}>
              {editing ? '更新する' : '作成する'}
            </Button>
          </div>
        </form>
      </div>
    </div>
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
    <div className="flex h-full flex-col">
      <PageHeader
        title="カレンダー"
        subtitle={subtitle}
        actions={
          <>
            <Button size="sm" onClick={() => actions.refreshCalendar()} loading={calendar.loading}>
              <RefreshCw className="size-3.5" />
              更新
            </Button>
            <Button size="sm" variant="primary" onClick={() => setModal({ open: true })}>
              <Plus className="size-3.5" />
              予定を作成
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-7 py-3">
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
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              onClick={() => setAnchorDay((d) => d - (range === 'today' ? 1 : 7) * 86_400_000)}
              title="前へ"
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button size="sm" onClick={() => setAnchorDay(todayMs)}>
              今日
            </Button>
            <Button
              size="sm"
              onClick={() => setAnchorDay((d) => d + (range === 'today' ? 1 : 7) * 86_400_000)}
              title="次へ"
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto px-7 py-5">
        <div className="mx-auto max-w-[820px] space-y-6">
          {calendar.error && (
            <p className="rounded-lg bg-danger-soft px-4 py-3 text-[12.5px] text-danger">{calendar.error.message}</p>
          )}

          {!settings.googleCalendar && !settings.demoActive ? (
            <EmptyState
              icon={<CalendarDays className="size-6" />}
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
              icon={<CalendarDays className="size-6" />}
              title="この期間の予定はありません"
              description="右上の「予定を作成」から新しい予定を追加できます。"
            />
          ) : (
            grouped.map(([day, events]) => (
              <section key={day} className="space-y-2.5">
                <h2 className="text-[12.5px] font-semibold text-fg-muted">{formatDayHeading(day, todayMs)}</h2>
                <div className="card divide-y divide-line overflow-hidden">
                  {events.map((ev) => {
                    const isPast = ev.endAt < Date.now()
                    return (
                      <div key={ev.id} className={cn('flex items-start gap-4 px-4 py-3.5', isPast && 'opacity-65')}>
                        <div className="w-28 shrink-0 pt-0.5 font-mono text-[12px] text-fg-muted">
                          {ev.isAllDay ? '終日' : `${formatTime(ev.startAt)} – ${formatTime(ev.endAt)}`}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-fg">{ev.title}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-muted">
                            {ev.location && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="size-3" />
                                {ev.location}
                              </span>
                            )}
                            {ev.attendees && ev.attendees.length > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <Users className="size-3" />
                                {ev.attendees.length} 名
                              </span>
                            )}
                          </div>
                          {ev.description && (
                            <p className="mt-1.5 line-clamp-2 text-[12px] text-fg-subtle">{ev.description}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {ev.meetUrl && (
                            <Button size="sm" variant="primary" onClick={() => openExternal(ev.meetUrl!)}>
                              <Video className="size-3.5" />
                              参加
                            </Button>
                          )}
                          <button
                            type="button"
                            onClick={() => setModal({ open: true, editing: ev })}
                            className="rounded-md p-1.5 text-fg-subtle hover:bg-sunken hover:text-fg"
                            title="編集"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={remove.pending}
                            onClick={() => void remove.run(ev.calendarId, ev.id)}
                            className="rounded-md p-1.5 text-fg-subtle hover:bg-danger-soft hover:text-danger"
                            title="削除"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openExternal(ev.htmlLink)}
                            className="rounded-md p-1.5 text-fg-subtle hover:bg-sunken hover:text-fg"
                            title="Google Calendar で開く"
                          >
                            <ExternalLink className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      {modal.open && (
        <EventModal
          editing={modal.editing}
          baseDayMs={anchorDay}
          onClose={() => setModal({ open: false })}
        />
      )}
    </div>
  )
}
