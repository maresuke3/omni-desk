import type { Task } from '@omni-desk/contracts'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
const DAY = 24 * 60 * 60 * 1000

export function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** 日付の差（カレンダー日数）。夏時間でもずれないよう丸める */
export function dayDiff(target: number, now: number): number {
  return Math.round((startOfDay(target) - startOfDay(now)) / DAY)
}

const pad = (n: number): string => String(n).padStart(2, '0')
export const hhmm = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getHours()}:${pad(d.getMinutes())}`
}
const md = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
const weekday = (ms: number): string => WEEKDAYS[new Date(ms).getDay()]

/** メッセージ時刻の表示（たった今 / 5分前 / 14:20 / 昨日 14:20 / 11/3 9:10 / 2025/11/3） */
export function formatMessageTime(ms: number, now = Date.now()): string {
  const diff = now - ms
  if (diff >= 0 && diff < 60_000) return 'たった今'
  if (diff >= 0 && diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}分前`
  const days = dayDiff(ms, now)
  if (days === 0) return hhmm(ms)
  if (days === -1) return `昨日 ${hhmm(ms)}`
  if (new Date(ms).getFullYear() === new Date(now).getFullYear()) return `${md(ms)} ${hhmm(ms)}`
  const d = new Date(ms)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

/** 一覧の短い時刻表示（14:20 / 昨日 / 11/3） */
export function formatShortTime(ms: number, now = Date.now()): string {
  const days = dayDiff(ms, now)
  if (days === 0) return hhmm(ms)
  if (days === -1) return '昨日'
  if (days > -7) return `${weekday(ms)}曜`
  return md(ms)
}

/** 日付見出し（今日 / 昨日 / 11月3日（月）） */
export function formatDayHeading(ms: number, now = Date.now()): string {
  const days = dayDiff(ms, now)
  if (days === 0) return '今日'
  if (days === -1) return '昨日'
  const d = new Date(ms)
  const year = d.getFullYear() !== new Date(now).getFullYear() ? `${d.getFullYear()}年` : ''
  return `${year}${d.getMonth() + 1}月${d.getDate()}日（${weekday(ms)}）`
}

export type DueGroup = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none'
export type DueTone = 'danger' | 'warning' | 'accent' | 'muted'

export interface DueInfo {
  group: DueGroup
  label: string
  tone: DueTone
}

export const DUE_GROUP_LABELS: Record<DueGroup, string> = {
  overdue: '期限切れ',
  today: '今日',
  tomorrow: '明日',
  week: '今週中',
  later: 'それ以降',
  none: '期限なし'
}

export const DUE_GROUP_ORDER: DueGroup[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'none']

export function dueInfo(task: Pick<Task, 'dueAt' | 'dueHasTime'>, now = Date.now()): DueInfo {
  if (!task.dueAt) return { group: 'none', label: '期限なし', tone: 'muted' }
  const due = task.dueAt
  const days = dayDiff(due, now)
  const time = task.dueHasTime ? ` ${hhmm(due)}` : ''
  const overdue = task.dueHasTime ? due < now : days < 0

  if (overdue) {
    const label = days === 0 ? `今日${time}` : days === -1 ? `昨日${time}` : `${md(due)}${time}`
    return { group: 'overdue', label: `${label} 期限切れ`, tone: 'danger' }
  }
  if (days === 0) return { group: 'today', label: `今日${time}`, tone: 'warning' }
  if (days === 1) return { group: 'tomorrow', label: `明日${time}`, tone: 'accent' }
  if (days < 7) return { group: 'week', label: `${md(due)}（${weekday(due)}）${time}`, tone: 'muted' }
  return { group: 'later', label: `${md(due)}（${weekday(due)}）${time}`, tone: 'muted' }
}

export function greeting(now = Date.now()): string {
  const h = new Date(now).getHours()
  if (h < 4) return 'おつかれさまです'
  if (h < 11) return 'おはようございます'
  if (h < 18) return 'こんにちは'
  return 'おつかれさまです'
}

export function formatToday(now = Date.now()): string {
  const d = new Date(now)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${weekday(now)}）`
}
