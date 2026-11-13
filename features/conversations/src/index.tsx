import { lazy } from 'react'
import { Mail, Users } from 'lucide-react'
import { useAppStore, useChatworkStatus, useServiceState } from '@omni-desk/client'
import { FEATURE_IDS, routes, type Source } from '@omni-desk/contracts'
import type { FeatureModule, NavBadge, NavStatus } from '@omni-desk/contracts/feature'
import { SourceMark } from '@omni-desk/ui'

function useConnectionStatus(source: Source): NavStatus {
  const s = useServiceState(source)
  return s.demo ? 'demo' : s.connected ? 'connected' : 'off'
}

function useSlackBadge(): NavBadge | undefined {
  const { enabled } = useServiceState('slack')
  const unread = useAppStore((s) => s.services.slack.conversations?.filter((c) => c.hasUnread).length ?? 0)
  const count = enabled ? unread : 0
  return count ? { count, tone: 'muted' } : undefined
}

function useChatworkBadge(): NavBadge | undefined {
  const { enabled } = useServiceState('chatwork')
  const status = useChatworkStatus()
  const count = enabled ? (status?.unreadCount ?? 0) : 0
  return count ? { count, tone: 'muted' } : undefined
}

const SlackIcon = () => <SourceMark source="slack" size="xs" />
const ChatworkIcon = () => <SourceMark source="chatwork" size="xs" />

export const conversationsFeature: FeatureModule = {
  id: FEATURE_IDS.conversations,
  nav: [
    {
      id: 'slack',
      label: 'Slack',
      section: 'services',
      order: 10,
      icon: SlackIcon,
      route: routes.conversations('slack'),
      useBadge: useSlackBadge,
      useStatus: () => useConnectionStatus('slack')
    },
    {
      id: 'chatwork',
      label: 'Chatwork',
      section: 'services',
      order: 20,
      icon: ChatworkIcon,
      route: routes.conversations('chatwork'),
      useBadge: useChatworkBadge,
      useStatus: () => useConnectionStatus('chatwork')
    },
    // 今後追加するサービスの枠
    { id: 'teams', label: 'Teams', section: 'services', order: 30, icon: Users, route: routes.home(), disabled: true, tag: '準備中' },
    { id: 'mail', label: 'メール', section: 'services', order: 40, icon: Mail, route: routes.home(), disabled: true, tag: '準備中' }
  ],
  View: lazy(() => import('./ConversationsView').then((m) => ({ default: m.ConversationsView })))
}
