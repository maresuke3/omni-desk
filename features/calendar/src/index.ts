import { lazy } from 'react'
import { CalendarDays } from 'lucide-react'
import { useCalendar } from '@omni-desk/client'
import { FEATURE_IDS, routes } from '@omni-desk/contracts'
import type { FeatureModule, NavBadge } from '@omni-desk/contracts/feature'

function useTodayEventsBadge(): NavBadge | undefined {
  const { events } = useCalendar()
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = start.getTime() + 86_400_000
  const now = Date.now()
  const count = events.filter((e) => e.endAt > now && e.startAt < end).length
  return count ? { count, tone: 'accent' } : undefined
}

export const calendarFeature: FeatureModule = {
  id: FEATURE_IDS.calendar,
  nav: [
    {
      id: 'calendar',
      label: 'カレンダー',
      section: 'primary',
      order: 30,
      icon: CalendarDays,
      route: routes.calendar(),
      useBadge: useTodayEventsBadge
    }
  ],
  View: lazy(() => import('./CalendarView').then((m) => ({ default: m.CalendarView })))
}
