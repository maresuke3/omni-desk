import { lazy } from 'react'
import { ListChecks } from 'lucide-react'
import { useUnifiedTasks } from '@omni-desk/client'
import { FEATURE_IDS, routes } from '@omni-desk/contracts'
import type { FeatureModule, NavBadge } from '@omni-desk/contracts/feature'
import { dueInfo } from '@omni-desk/message-kit'

/** 期限切れ＋今日が期限の未完了タスク数 */
function useUrgentTaskBadge(): NavBadge | undefined {
  const tasks = useUnifiedTasks()
  const count = tasks.items.filter((t) => {
    if (t.status !== 'open') return false
    const group = dueInfo(t).group
    return group === 'overdue' || group === 'today'
  }).length
  return count ? { count, tone: 'danger' } : undefined
}

export const tasksFeature: FeatureModule = {
  id: FEATURE_IDS.tasks,
  nav: [
    { id: 'tasks', label: 'タスク', section: 'primary', order: 30, icon: ListChecks, route: routes.tasks(), useBadge: useUrgentTaskBadge }
  ],
  View: lazy(() => import('./TasksView').then((m) => ({ default: m.TasksView })))
}
