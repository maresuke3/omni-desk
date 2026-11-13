import { lazy } from 'react'
import { Settings } from 'lucide-react'
import { FEATURE_IDS, routes } from '@omni-desk/contracts'
import type { FeatureModule } from '@omni-desk/contracts/feature'

export const settingsFeature: FeatureModule = {
  id: FEATURE_IDS.settings,
  nav: [{ id: 'settings', label: '設定', section: 'footer', order: 10, icon: Settings, route: routes.settings() }],
  View: lazy(() => import('./SettingsView').then((m) => ({ default: m.SettingsView })))
}
