import { CircleCheckBig, Info } from 'lucide-react'
import { routes, type Source, type Task } from '@omni-desk/contracts'
import type { FeatureContext } from '@omni-desk/contracts/feature'
import { TaskRow } from '@omni-desk/message-kit'
import { Button, EmptyState, ErrorNotice, PageHeader, Segmented, SkeletonList } from '@omni-desk/ui'
import { cn } from '@omni-desk/ui'
import { actions, useAppStore, useUnifiedTasks } from '@omni-desk/client'
import { dueInfo, DUE_GROUP_LABELS, DUE_GROUP_ORDER, type DueGroup } from '@omni-desk/message-kit'

type Status = 'open' | 'done'
type Filter = 'all' | Source

const GROUP_ACCENT: Record<DueGroup, string> = {
  overdue: 'text-danger',
  today: 'text-warning',
  tomorrow: 'text-accent-text',
  week: 'text-fg',
  later: 'text-fg',
  none: 'text-fg-muted'
}

export function TasksView({ navigate }: FeatureContext) {
  const status = useAppStore((s) => s.ui.tasksStatus)
  const filter = useAppStore((s) => s.ui.tasksFilter)
  const setStatus = (tasksStatus: Status): void => actions.setUi({ tasksStatus })
  const setFilter = (tasksFilter: Filter): void => actions.setUi({ tasksFilter })
  const tasks = useUnifiedTasks()

  const bySource = tasks.items.filter((t) => filter === 'all' || t.source === filter)
  const visible = bySource.filter((t) => t.status === status)
  const sourceCount = (s: Source): number => tasks.items.filter((t) => t.source === s && t.status === status).length

  const now = Date.now()
  const groups = DUE_GROUP_ORDER.map((group) => ({
    group,
    items: visible
      .filter((t) => dueInfo(t, now).group === group)
      .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))
  })).filter((g) => g.items.length)

  const doneSorted = [...visible].sort(
    (a, b) => (b.completedAt ?? b.dueAt ?? 0) - (a.completedAt ?? a.dueAt ?? 0)
  )

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="タスク" subtitle="Chatwork のタスクと Slack の To-dos をまとめて表示します">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: 'open', label: '未完了', count: bySource.filter((t) => t.status === 'open').length },
              { value: 'done', label: '完了', count: bySource.filter((t) => t.status === 'done').length }
            ]}
          />
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'すべて' },
              { value: 'slack', label: 'Slack', count: sourceCount('slack') },
              { value: 'chatwork', label: 'Chatwork', count: sourceCount('chatwork') }
            ]}
          />
        </div>
      </PageHeader>

      <div className="thin-scroll flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[860px] space-y-5 px-7 py-6">
          {tasks.slackUnavailableReason && filter !== 'chatwork' && (
            <div className="flex items-start gap-2.5 rounded-lg border border-line bg-panel px-3.5 py-3 text-[12.5px]">
              <Info className="mt-0.5 size-4 shrink-0 text-accent" />
              <p className="flex-1 text-fg-muted">{tasks.slackUnavailableReason}</p>
              <Button size="sm" onClick={() => navigate(routes.settings())}>
                接続方法を見る
              </Button>
            </div>
          )}
          {tasks.sources
            .filter((s) => s.error && (filter === 'all' || filter === s.source))
            .map((s) => (
              <ErrorNotice
                key={s.source}
                error={s.error!}
                source={s.source}
                onRetry={s.refetch}
                onOpenSettings={() => navigate(routes.settings())}
              />
            ))}

          {tasks.isLoading && visible.length === 0 ? (
            <div className="card p-4">
              <SkeletonList rows={5} avatar={false} />
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<CircleCheckBig className="size-5" />}
              title={status === 'open' ? '未完了のタスクはありません' : '完了したタスクはありません'}
              description={status === 'open' ? 'お疲れさまでした！' : undefined}
            />
          ) : status === 'open' ? (
            groups.map((g) => <TaskGroup key={g.group} title={DUE_GROUP_LABELS[g.group]} accent={GROUP_ACCENT[g.group]} tasks={g.items} />)
          ) : (
            <TaskGroup title="完了" accent="text-success" tasks={doneSorted} />
          )}
        </div>
      </div>
    </div>
  )
}

function TaskGroup({ title, accent, tasks }: { title: string; accent: string; tasks: Task[] }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 px-1">
        <h3 className={cn('text-[12.5px] font-semibold', accent)}>{title}</h3>
        <span className="text-[11.5px] text-fg-subtle tabular-nums">{tasks.length}</span>
      </div>
      <div className="card divide-y divide-line overflow-hidden">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </div>
    </section>
  )
}
