import { useState } from 'react'
import { CircleCheckBig, Info, Plus } from 'lucide-react'
import { routes, type Source, type Task } from '@omni-desk/contracts'
import type { FeatureContext } from '@omni-desk/contracts/feature'
import { TaskRow } from '@omni-desk/message-kit'
import { Button, EmptyState, ErrorNotice, PageHeader, Segmented, SkeletonList } from '@omni-desk/ui'
import { cn } from '@omni-desk/ui'
import { actions, useAppStore, useKnowledge, useSettings, useUnifiedTasks } from '@omni-desk/client'
import { dueInfo, DUE_GROUP_LABELS, DUE_GROUP_ORDER, type DueGroup } from '@omni-desk/message-kit'
import { CreateJiraPanel, JiraSection } from './JiraSection'
import { GitHubIssuesSection, PullRequestsSection } from './PullRequestsSection'

type Status = 'open' | 'done'
type TaskArea = 'all' | 'personal' | 'jira' | 'pr'
type PersonalSource = 'all' | Source

const GROUP_ACCENT: Record<DueGroup, string> = {
  overdue: 'text-danger',
  today: 'text-warning',
  tomorrow: 'text-accent-text',
  week: 'text-fg',
  later: 'text-fg',
  none: 'text-fg-muted'
}

export function TasksView({ navigate }: FeatureContext) {
  const settings = useSettings()
  const status = useAppStore((s) => s.ui.tasksStatus)
  const filter = useAppStore((s) => s.ui.tasksFilter)
  const setStatus = (tasksStatus: Status): void => actions.setUi({ tasksStatus })
  const setFilter = (tasksFilter: PersonalSource): void => actions.setUi({ tasksFilter })

  const [area, setArea] = useState<TaskArea>('all')
  const [showCreateJira, setShowCreateJira] = useState(false)

  const tasks = useUnifiedTasks()
  const knowledge = useKnowledge()

  const bySource = tasks.items.filter((t) => filter === 'all' || t.source === filter)
  const visiblePersonal = bySource.filter((t) => t.status === status)
  const sourceCount = (s: Source): number => tasks.items.filter((t) => t.source === s && t.status === status).length

  const visibleJira = knowledge.jiraIssues.filter((j) =>
    status === 'open' ? j.statusCategory !== 'done' : j.statusCategory === 'done'
  )
  const openPrs = knowledge.pullRequests.filter((pr) => pr.state === 'open')
  const openGitHubIssues = (knowledge.githubIssues ?? []).filter((issue) => issue.state === 'open')

  const now = Date.now()
  const groups = DUE_GROUP_ORDER.map((group) => ({
    group,
    items: visiblePersonal
      .filter((t) => dueInfo(t, now).group === group)
      .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))
  })).filter((g) => g.items.length)

  const doneSorted = [...visiblePersonal].sort(
    (a, b) => (b.completedAt ?? b.dueAt ?? 0) - (a.completedAt ?? a.dueAt ?? 0)
  )

  const showPersonal = area === 'all' || area === 'personal'
  const showJira = area === 'all' || area === 'jira'
  const showPr = area === 'all' || area === 'pr'

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="タスク" subtitle="マイタスク（Slack / Chatwork）・Jira チケット・GitHub PR をまとめて管理します">
        <div className="flex flex-wrap items-center gap-2.5">
          <Segmented<TaskArea>
            value={area}
            onChange={setArea}
            options={[
              { value: 'all', label: 'すべて' },
              { value: 'personal', label: 'マイタスク', count: visiblePersonal.length },
              { value: 'jira', label: 'Jira', count: visibleJira.length },
              { value: 'pr', label: 'GitHub', count: openPrs.length + openGitHubIssues.length }
            ]}
          />
          {area !== 'pr' && (
            <Segmented
              value={status}
              onChange={setStatus}
              options={[
                { value: 'open', label: '未完了' },
                { value: 'done', label: '完了' }
              ]}
            />
          )}
          {area === 'personal' && (
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'すべて' },
                { value: 'slack', label: 'Slack', count: sourceCount('slack') },
                { value: 'chatwork', label: 'Chatwork', count: sourceCount('chatwork') }
              ]}
            />
          )}
          {(settings.atlassian || settings.demoActive) && (
            <Button size="sm" variant="primary" onClick={() => setShowCreateJira((v) => !v)}>
              <Plus className="size-3.5" />
              Jira 起票
            </Button>
          )}
        </div>
      </PageHeader>

      <div className="thin-scroll flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[920px] space-y-6 px-7 py-6">
          {showCreateJira && <CreateJiraPanel onClose={() => setShowCreateJira(false)} />}

          {showPersonal && tasks.slackUnavailableReason && filter !== 'chatwork' && (
            <div className="flex items-start gap-2.5 rounded-lg border border-line bg-panel px-3.5 py-3 text-[12.5px]">
              <Info className="mt-0.5 size-4 shrink-0 text-accent" />
              <p className="flex-1 text-fg-muted">{tasks.slackUnavailableReason}</p>
              <Button size="sm" onClick={() => navigate(routes.settings())}>
                接続方法を見る
              </Button>
            </div>
          )}

          {showPersonal &&
            tasks.sources
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

          {showPersonal && (
            <div className="space-y-4">
              {tasks.isLoading && visiblePersonal.length === 0 ? (
                <div className="card p-4">
                  <SkeletonList rows={4} avatar={false} />
                </div>
              ) : visiblePersonal.length === 0 ? (
                area === 'personal' ? (
                  <EmptyState
                    icon={<CircleCheckBig className="size-5" />}
                    title={status === 'open' ? '未完了のマイタスクはありません' : '完了したマイタスクはありません'}
                    description={status === 'open' ? 'お疲れさまでした！' : undefined}
                  />
                ) : null
              ) : status === 'open' ? (
                groups.map((g) => (
                  <TaskGroup key={g.group} title={DUE_GROUP_LABELS[g.group]} accent={GROUP_ACCENT[g.group]} tasks={g.items} />
                ))
              ) : (
                <TaskGroup title="完了（マイタスク）" accent="text-success" tasks={doneSorted} />
              )}
            </div>
          )}

          {showJira && (area === 'jira' || visibleJira.length > 0 || Boolean(settings.atlassian)) && (
            <JiraSection
              items={visibleJira}
              canEdit={Boolean(settings.atlassian)}
              onOpenCreate={() => setShowCreateJira(true)}
            />
          )}

          {showPr && (area === 'pr' || openPrs.length > 0 || openGitHubIssues.length > 0 || Boolean(settings.github) || (settings.githubAccounts?.length ?? 0) > 0) && (
            <>
              <PullRequestsSection items={openPrs} />
              <GitHubIssuesSection items={openGitHubIssues} />
            </>
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
