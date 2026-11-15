import { describe, expect, it } from 'vitest'
import { normalizeGoogleEvent } from './normalize'

describe('normalizeGoogleEvent', () => {
  it('日時指定イベントと Meet URL・参加者を正規化する', () => {
    const ev = normalizeGoogleEvent(
      {
        id: 'evt-1',
        summary: '週次定例',
        start: { dateTime: '2026-11-13T10:00:00+09:00' },
        end: { dateTime: '2026-11-13T11:00:00+09:00' },
        conferenceData: {
          entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' }]
        },
        htmlLink: 'https://calendar.google.com/event?eid=1',
        status: 'confirmed',
        attendees: [{ email: 'alice@example.com', displayName: 'Alice', responseStatus: 'accepted', self: true }]
      },
      'primary'
    )

    expect(ev.title).toBe('週次定例')
    expect(ev.isAllDay).toBe(false)
    expect(ev.meetUrl).toBe('https://meet.google.com/abc-defg-hij')
    expect(ev.endAt - ev.startAt).toBe(3600_000)
    expect(ev.attendees).toHaveLength(1)
    expect(ev.attendees?.[0].self).toBe(true)
  })

  it('終日イベントとタイトル欠落を扱う', () => {
    const ev = normalizeGoogleEvent({
      id: 'evt-2',
      start: { date: '2026-11-14' },
      end: { date: '2026-11-15' }
    })

    expect(ev.title).toBe('（タイトルなし）')
    expect(ev.isAllDay).toBe(true)
    expect(ev.status).toBe('confirmed')
  })
})
