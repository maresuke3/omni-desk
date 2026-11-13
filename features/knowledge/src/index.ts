import { lazy } from 'react'
import { BookOpen } from 'lucide-react'
import { useKnowledge } from '@omni-desk/client'
import { FEATURE_IDS, routes } from '@omni-desk/contracts'
import type { FeatureModule, NavBadge } from '@omni-desk/contracts/feature'

/** レビュー依頼中の PR 件数をバッジ表示 */
function useReviewBadge(): NavBadge | undefined {
  const { pullRequests } = useKnowledge()
  const count = pullRequests.filter((pr) => pr.role === 'reviewer' && pr.state === 'open').length
  return count ? { count, tone: 'accent' } : undefined
}

export const knowledgeFeature: FeatureModule = {
  id: FEATURE_IDS.knowledge,
  nav: [
    {
      id: 'knowledge',
      label: 'ナレッジ',
      section: 'primary',
      order: 35,
      icon: BookOpen,
      route: routes.knowledge(),
      useBadge: useReviewBadge
    }
  ],
  View: lazy(() => import('./KnowledgeView').then((m) => ({ default: m.KnowledgeView })))
}
