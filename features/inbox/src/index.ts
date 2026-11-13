import { lazy } from 'react'
import { Inbox } from 'lucide-react'
import { useInbox } from '@omni-desk/client'
import { FEATURE_IDS, routes } from '@omni-desk/contracts'
import type { FeatureModule, NavBadge } from '@omni-desk/contracts/feature'

/** 未対応の自分宛て件数（あとで・対応済みは数えない） */
function useInboxBadge(): NavBadge | undefined {
  const { counts } = useInbox()
  return counts.open ? { count: counts.open, tone: 'accent' } : undefined
}

export const inboxFeature: FeatureModule = {
  id: FEATURE_IDS.inbox,
  nav: [
    { id: 'inbox', label: '受信箱', section: 'primary', order: 20, icon: Inbox, route: routes.inbox(), useBadge: useInboxBadge }
  ],
  View: lazy(() => import('./InboxView').then((m) => ({ default: m.InboxView })))
}
