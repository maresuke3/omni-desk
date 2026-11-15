import { lazy } from 'react'
import { BookOpen } from 'lucide-react'
import { FEATURE_IDS, routes } from '@omni-desk/contracts'
import type { FeatureModule } from '@omni-desk/contracts/feature'

export const knowledgeFeature: FeatureModule = {
  id: FEATURE_IDS.knowledge,
  nav: [
    {
      id: 'knowledge',
      label: 'ナレッジ',
      section: 'primary',
      order: 35,
      icon: BookOpen,
      route: routes.knowledge()
    }
  ],
  View: lazy(() => import('./KnowledgeView').then((m) => ({ default: m.KnowledgeView })))
}
