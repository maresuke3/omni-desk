import { lazy } from 'react'
import { House } from 'lucide-react'
import { FEATURE_IDS, routes } from '@omni-desk/contracts'
import type { FeatureModule } from '@omni-desk/contracts/feature'

export const homeFeature: FeatureModule = {
  id: FEATURE_IDS.home,
  nav: [{ id: 'home', label: 'ホーム', section: 'primary', order: 10, icon: House, route: routes.home() }],
  View: lazy(() => import('./HomeView').then((m) => ({ default: m.HomeView })))
}
