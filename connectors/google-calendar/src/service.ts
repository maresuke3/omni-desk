import { AppError } from '@omni-desk/connector-core'
import type {
  CalendarCreateInput,
  CalendarEvent,
  CalendarUpdateInput,
  GoogleCalendarConnectionInfo
} from '@omni-desk/contracts'
import { normalizeGoogleEvent, type RawGoogleEvent } from './normalize'
import { refreshGoogleAccessToken } from './oauth'

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const USERINFO_API = 'https://www.googleapis.com/oauth2/v2/userinfo'

function toDateParam(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toEventTimeFields(startAt: number, endAt: number, isAllDay?: boolean) {
  if (isAllDay) {
    // Google Calendar の終日イベントは end.date が排他的（翌日）
    const endDateMs = endAt <= startAt ? startAt + 86_400_000 : endAt
    return {
      start: { date: toDateParam(startAt) },
      end: { date: toDateParam(endDateMs) }
    }
  }
  return {
    start: { dateTime: new Date(startAt).toISOString() },
    end: { dateTime: new Date(endAt).toISOString() }
  }
}

/** 接続検証: アクセストークンからユーザー情報を取得する */
export async function verifyGoogleCalendar(accessToken: string): Promise<GoogleCalendarConnectionInfo> {
  let res: Response
  try {
    res = await fetch(USERINFO_API, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
  } catch (err) {
    throw new AppError('network', `Google ユーザー情報の取得に失敗しました: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!res.ok) {
    throw new AppError('auth_error', `Google アカウントの認証に失敗しました（HTTP ${res.status}）`)
  }
  const user = (await res.json()) as { email?: string; name?: string; picture?: string }
  if (!user.email) {
    throw new AppError('auth_error', 'Google アカウントのメールアドレスを取得できませんでした')
  }
  return {
    email: user.email,
    name: user.name,
    avatarUrl: user.picture
  }
}

export interface GoogleCalendarCredentials {
  accessToken: string
  refreshToken?: string
  clientId?: string
  clientSecret?: string
  expiresAt?: number
  onTokenRefreshed?: (next: { accessToken: string; expiresAt: number }) => Promise<void> | void
}

export class GoogleCalendarService {
  private creds: GoogleCalendarCredentials

  constructor(creds: GoogleCalendarCredentials) {
    this.creds = creds
  }

  private async getValidToken(): Promise<string> {
    if (
      this.creds.expiresAt &&
      Date.now() > this.creds.expiresAt - 60_000 &&
      this.creds.refreshToken &&
      this.creds.clientId
    ) {
      const next = await refreshGoogleAccessToken({
        clientId: this.creds.clientId,
        clientSecret: this.creds.clientSecret,
        refreshToken: this.creds.refreshToken
      })
      this.creds.accessToken = next.accessToken
      this.creds.expiresAt = next.expiresAt
      await this.creds.onTokenRefreshed?.(next)
    }
    return this.creds.accessToken
  }

  private async request<T>(path: string, init?: RequestInit, retryAuth = true): Promise<T> {
    const token = await this.getValidToken()
    let res: Response
    try {
      res = await fetch(`${CALENDAR_API}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(init?.headers ?? {})
        }
      })
    } catch (err) {
      throw new AppError('network', `Google Calendar API への接続に失敗しました: ${err instanceof Error ? err.message : String(err)}`)
    }

    if (res.status === 401 && retryAuth && this.creds.refreshToken && this.creds.clientId) {
      const next = await refreshGoogleAccessToken({
        clientId: this.creds.clientId,
        clientSecret: this.creds.clientSecret,
        refreshToken: this.creds.refreshToken
      })
      this.creds.accessToken = next.accessToken
      this.creds.expiresAt = next.expiresAt
      await this.creds.onTokenRefreshed?.(next)
      return this.request<T>(path, init, false)
    }

    if (res.status === 401 || res.status === 403) {
      throw new AppError('auth_error', `Google Calendar の権限エラーです（HTTP ${res.status}）。再接続してください`)
    }
    if (res.status === 429) {
      throw new AppError('rate_limited', 'Google Calendar API のリクエスト上限に達しました')
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new AppError('api_error', `Google Calendar API エラー（HTTP ${res.status}）${text ? `: ${text.slice(0, 120)}` : ''}`)
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  async listEvents(timeMinIso: string, timeMaxIso: string, calendarId = 'primary'): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      maxResults: '250'
    })
    const data = await this.request<{ items?: RawGoogleEvent[] }>(
      `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`
    )
    return (data.items ?? [])
      .filter((item) => item.status !== 'cancelled')
      .map((item) => normalizeGoogleEvent(item, calendarId))
  }

  async createEvent(input: CalendarCreateInput): Promise<CalendarEvent> {
    const calendarId = input.calendarId || 'primary'
    const body = {
      summary: input.title,
      location: input.location || undefined,
      description: input.description || undefined,
      ...toEventTimeFields(input.startAt, input.endAt, input.isAllDay)
    }
    const created = await this.request<RawGoogleEvent>(`/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      body: JSON.stringify(body)
    })
    return normalizeGoogleEvent(created, calendarId)
  }

  async updateEvent(calendarId: string, eventId: string, patch: CalendarUpdateInput): Promise<CalendarEvent> {
    const body: Record<string, unknown> = {}
    if (patch.title !== undefined) body.summary = patch.title
    if (patch.location !== undefined) body.location = patch.location
    if (patch.description !== undefined) body.description = patch.description
    if (patch.startAt !== undefined && patch.endAt !== undefined) {
      Object.assign(body, toEventTimeFields(patch.startAt, patch.endAt, patch.isAllDay))
    }
    const updated = await this.request<RawGoogleEvent>(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(body)
      }
    )
    return normalizeGoogleEvent(updated, calendarId)
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.request<void>(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE' }
    )
  }
}
