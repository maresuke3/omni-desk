import { describe, expect, it } from 'vitest'
import { dueInfo, formatMessageTime } from './time'

const now = new Date(2026, 10, 12, 10, 0).getTime() // 2026/11/12（木）10:00

describe('dueInfo', () => {
  it('期限なし', () => {
    expect(dueInfo({ dueHasTime: false }, now).group).toBe('none')
  })

  it('日付のみの期限は当日中なら期限切れにしない', () => {
    const due = new Date(2026, 10, 12, 0, 0).getTime()
    expect(dueInfo({ dueAt: due, dueHasTime: false }, now)).toMatchObject({ group: 'today', tone: 'warning' })
  })

  it('時刻付きの期限は過ぎたら期限切れ', () => {
    const due = new Date(2026, 10, 12, 9, 0).getTime()
    expect(dueInfo({ dueAt: due, dueHasTime: true }, now)).toMatchObject({ group: 'overdue', tone: 'danger' })
  })

  it('明日・今週・それ以降', () => {
    const d = (day: number): number => new Date(2026, 10, day, 18).getTime()
    expect(dueInfo({ dueAt: d(13), dueHasTime: false }, now).group).toBe('tomorrow')
    expect(dueInfo({ dueAt: d(16), dueHasTime: false }, now).group).toBe('week')
    expect(dueInfo({ dueAt: d(30), dueHasTime: false }, now).group).toBe('later')
    expect(dueInfo({ dueAt: d(10), dueHasTime: false }, now).group).toBe('overdue')
  })
})

describe('formatMessageTime', () => {
  it('相対表記', () => {
    expect(formatMessageTime(now - 30_000, now)).toBe('たった今')
    expect(formatMessageTime(now - 5 * 60_000, now)).toBe('5分前')
    expect(formatMessageTime(new Date(2026, 10, 11, 14, 5).getTime(), now)).toBe('昨日 14:05')
    expect(formatMessageTime(new Date(2026, 9, 3, 9, 7).getTime(), now)).toBe('10/3 9:07')
  })
})
