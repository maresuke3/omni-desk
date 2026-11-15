import type { CalendarAttendee, CalendarEvent } from '@omni-desk/contracts'

export interface RawGoogleEventDate {
  dateTime?: string
  date?: string
}

export interface RawGoogleEvent {
  id: string
  summary?: string
  description?: string
  start?: RawGoogleEventDate
  end?: RawGoogleEventDate
  location?: string
  hangoutLink?: string
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>
  }
  htmlLink?: string
  status?: 'confirmed' | 'tentative' | 'cancelled'
  attendees?: Array<{
    email?: string
    displayName?: string
    responseStatus?: CalendarAttendee['responseStatus']
    self?: boolean
  }>
}

function parseEventTime(raw?: RawGoogleEventDate): { ts: number; isAllDay: boolean } {
  if (raw?.dateTime) {
    const ms = Date.parse(raw.dateTime)
    return { ts: Number.isNaN(ms) ? 0 : ms, isAllDay: false }
  }
  if (raw?.date) {
    // YYYY-MM-DD をローカル日の 00:00 として扱う
    const ms = Date.parse(`${raw.date}T00:00:00`)
    return { ts: Number.isNaN(ms) ? 0 : ms, isAllDay: true }
  }
  return { ts: 0, isAllDay: false }
}

/** Google Calendar API のイベントをアプリ共通の CalendarEvent へ正規化する */
export function normalizeGoogleEvent(raw: RawGoogleEvent, calendarId = 'primary'): CalendarEvent {
  const start = parseEventTime(raw.start)
  const end = parseEventTime(raw.end)
  const videoEntry = raw.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video' && e.uri)?.uri
  const meetUrl = raw.hangoutLink || videoEntry

  const attendees: CalendarAttendee[] | undefined = raw.attendees
    ?.filter((a): a is typeof a & { email: string } => Boolean(a.email))
    .map((a) => ({
      email: a.email,
      displayName: a.displayName,
      responseStatus: a.responseStatus,
      self: a.self
    }))

  return {
    id: raw.id,
    calendarId,
    title: raw.summary?.trim() || '（タイトルなし）',
    description: raw.description,
    startAt: start.ts,
    endAt: end.ts || start.ts,
    isAllDay: start.isAllDay,
    location: raw.location,
    meetUrl,
    htmlLink: raw.htmlLink ?? 'https://calendar.google.com',
    status: raw.status ?? 'confirmed',
    attendees
  }
}
