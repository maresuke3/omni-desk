import { toErrorPayload } from '@omni-desk/connector-core'
import { GoogleCalendarService } from '@omni-desk/connector-google-calendar'
import type { CalendarCreateInput, CalendarEvent, CalendarUpdateInput } from '@omni-desk/contracts'
import { settings } from '../settings'
import type { StateHub } from './hub'

function buildDemoEvents(): CalendarEvent[] {
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  const day = base.getTime()
  const hour = 3_600_000

  return [
    {
      id: 'demo-cal-1',
      calendarId: 'primary',
      title: 'プロダクト朝会',
      description: '今週のスプリント進捗とブロッカー確認',
      startAt: day + 10 * hour,
      endAt: day + 10.5 * hour,
      isAllDay: false,
      meetUrl: 'https://meet.google.com/demo-morning-sync',
      htmlLink: 'https://calendar.google.com',
      status: 'confirmed',
      attendees: [
        { email: 'you@example.com', displayName: 'あなた', responseStatus: 'accepted', self: true },
        { email: 'pm@example.com', displayName: '佐藤 (PM)', responseStatus: 'accepted' }
      ]
    },
    {
      id: 'demo-cal-2',
      calendarId: 'primary',
      title: 'デザインレビュー（ナレッジボード）',
      startAt: day + 14 * hour,
      endAt: day + 15 * hour,
      isAllDay: false,
      location: 'オンライン',
      meetUrl: 'https://meet.google.com/demo-design-review',
      htmlLink: 'https://calendar.google.com',
      status: 'confirmed',
      attendees: [
        { email: 'you@example.com', displayName: 'あなた', responseStatus: 'accepted', self: true },
        { email: 'design@example.com', displayName: '鈴木 (Design)', responseStatus: 'tentative' }
      ]
    },
    {
      id: 'demo-cal-3',
      calendarId: 'primary',
      title: 'リリース準備フリーズ日',
      startAt: day + 24 * hour,
      endAt: day + 48 * hour,
      isAllDay: true,
      htmlLink: 'https://calendar.google.com',
      status: 'confirmed'
    }
  ]
}

export class CalendarSyncService {
  private refreshing: Promise<void> | null = null

  constructor(private readonly hub: StateHub) {}

  private async getServices(): Promise<Array<{ accountEmail: string; service: GoogleCalendarService }>> {
    const secretsList = await settings.googleAccountSecretsList()
    return secretsList.map((s) => ({
      accountEmail: s.account.email,
      service: new GoogleCalendarService({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        clientId: s.clientId,
        clientSecret: s.clientSecret,
        expiresAt: s.expiresAt,
        onTokenRefreshed: ({ accessToken, expiresAt }) =>
          settings.updateGoogleAccountAccessToken(s.account.id, accessToken, expiresAt)
      })
    }))
  }

  private async getService(): Promise<GoogleCalendarService | null> {
    const list = await this.getServices()
    return list[0]?.service ?? null
  }

  async refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing
    this.refreshing = this.doRefresh().finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }

  private async doRefresh(): Promise<void> {
    const pub = settings.toPublic()
    const services = await this.getServices()

    if (services.length === 0) {
      if (pub.demoActive) {
        this.hub.setCalendar({
          loading: false,
          error: null,
          lastSyncedAt: Date.now(),
          events: buildDemoEvents()
        })
      } else {
        this.hub.setCalendar({
          loading: false,
          error: null,
          lastSyncedAt: null,
          events: []
        })
      }
      return
    }

    this.hub.setCalendar({ loading: true, error: null })
    const now = Date.now()
    const timeMin = new Date(now - 7 * 86_400_000).toISOString()
    const timeMax = new Date(now + 21 * 86_400_000).toISOString()

    const merged: CalendarEvent[] = []
    let firstError: unknown = null

    await Promise.all(
      services.map(async ({ accountEmail, service }) => {
        try {
          const items = await service.listEvents(timeMin, timeMax, 'primary')
          for (const ev of items) {
            merged.push({ ...ev, accountEmail })
          }
        } catch (err) {
          firstError ??= err
        }
      })
    )

    merged.sort((a, b) => a.startAt - b.startAt)
    this.hub.setCalendar({
      loading: false,
      error: firstError ? toErrorPayload(firstError) : null,
      lastSyncedAt: Date.now(),
      events: merged
    })
  }

  async createEvent(input: CalendarCreateInput): Promise<CalendarEvent> {
    const svc = await this.getService()
    if (!svc) {
      const created: CalendarEvent = {
        id: `demo-cal-${Date.now()}`,
        calendarId: input.calendarId || 'primary',
        title: input.title,
        description: input.description,
        startAt: input.startAt,
        endAt: input.endAt,
        isAllDay: Boolean(input.isAllDay),
        location: input.location,
        htmlLink: 'https://calendar.google.com',
        status: 'confirmed'
      }
      const prev = this.hub.get().calendar.events
      this.hub.setCalendar({ events: [...prev, created].sort((a, b) => a.startAt - b.startAt) })
      return created
    }
    const created = await svc.createEvent(input)
    await this.refresh()
    return created
  }

  async updateEvent(calendarId: string, eventId: string, patch: CalendarUpdateInput): Promise<CalendarEvent> {
    const svc = await this.getService()
    if (!svc) {
      const prev = this.hub.get().calendar.events
      let updated: CalendarEvent | undefined
      const next = prev.map((e) => {
        if (e.id !== eventId) return e
        updated = { ...e, ...patch }
        return updated
      })
      if (!updated) throw new Error('予定が見つかりません')
      this.hub.setCalendar({ events: next.sort((a, b) => a.startAt - b.startAt) })
      return updated
    }
    const updated = await svc.updateEvent(calendarId, eventId, patch)
    await this.refresh()
    return updated
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    const svc = await this.getService()
    if (!svc) {
      const prev = this.hub.get().calendar.events
      this.hub.setCalendar({ events: prev.filter((e) => e.id !== eventId) })
      return
    }
    await svc.deleteEvent(calendarId, eventId)
    await this.refresh()
  }
}
