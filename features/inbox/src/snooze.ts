/** 「あとで」の選択肢（今の時刻から計算する） */
export interface SnoozeOption {
  key: string
  label: string
  until: number
}

const HOUR = 60 * 60 * 1000
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

const at = (base: number, dayOffset: number, hour: number): number => {
  const d = new Date(base)
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}

export function formatUntil(until: number, now: number): string {
  const d = new Date(until)
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  const days = Math.round((at(until, 0, 0) - at(now, 0, 0)) / (24 * HOUR))
  if (days === 0) return `今日 ${time}`
  if (days === 1) return `明日 ${time}`
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）${time}`
}

export function snoozeOptions(now: number): SnoozeOption[] {
  const options: SnoozeOption[] = [{ key: '1h', label: '1 時間後', until: now + HOUR }]
  const evening = at(now, 0, 18)
  if (evening - now > HOUR) options.push({ key: 'evening', label: '今日の夕方', until: evening })
  options.push({ key: 'tomorrow', label: '明日の朝', until: at(now, 1, 9) })
  const day = new Date(now).getDay()
  const toMonday = ((8 - day) % 7) || 7
  options.push({ key: 'next-week', label: '来週の月曜', until: at(now, toMonday, 9) })
  return options
}
