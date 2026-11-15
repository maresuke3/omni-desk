import { lazy } from 'react'
import { Mail } from 'lucide-react'
import { useMail } from '@omni-desk/client'
import { FEATURE_IDS, routes } from '@omni-desk/contracts'
import type { FeatureModule, NavBadge } from '@omni-desk/contracts/feature'

function useUnreadMailBadge(): NavBadge | undefined {
  const { messages } = useMail()
  const count = messages.filter((m) => m.isUnread).length
  return count ? { count, tone: 'accent' } : undefined
}

export const mailFeature: FeatureModule = {
  id: FEATURE_IDS.mail,
  nav: [
    {
      id: 'mail',
      label: 'メール',
      section: 'primary',
      order: 25,
      icon: Mail,
      route: routes.mail(),
      useBadge: useUnreadMailBadge
    }
  ],
  View: lazy(() => import('./MailView').then((m) => ({ default: m.MailView })))
}
