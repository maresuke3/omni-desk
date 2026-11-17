import { useState } from 'react'
import { CircleCheckBig, Info, Plus } from 'lucide-react'
import { routes, type Source, type Task } from '@omni-desk/contracts'
import type { FeatureContext } from '@omni-desk/contracts/feature'
import { dueInfo, DUE_GROUP_LABELS, DUE_GROUP_ORDER, TaskRow, type DueGroup } from '@omni-desk/message-kit'
import {
  Alert,
  Box,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorNotice,
  PageHeader,
  Segmented,
  SkeletonList,
  Stack,
  Typography
} from '@omni-desk/ui'
import { actions, useAppStore, useKnowledge, useSettings, useUnifiedTasks } from '@omni-desk/client'
import { CreateJiraPanel, JiraSection } from './JiraSection'
import { GitHubIssuesSection, PullRequestsSection } from './PullRequestsSection'

type Status = 'open' | 'done'
type TaskArea = 'all' | 'personal' | 'jira' | 'pr'
type PersonalSource = 'all' | Source

const GROUP_COLOR: Record<DueGroup, string> = {
  overdue: 'error.main',
  today: 'warning.main',
  tomorrow: 'primary.main',
  week: 'text.primary',
  later: 'text.primary',
  none: 'text.secondary'
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
    <Stack sx={{ height: '100%' }}>
      <PageHeader title="タスク" subtitle="マイタスク（Slack / Chatwork）・Jira チケット・GitHub PR をまとめて管理します">
        <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', alignItems: 'center', rowGap: 1 }}>
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
              <Plus size={16} />
              Jira 起票
            </Button>
          )}
        </Stack>
      </PageHeader>

      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        <Stack spacing={3} sx={{ mx: 'auto', maxWidth: 920, px: 3, py: 3 }}>
          {showCreateJira && <CreateJiraPanel onClose={() => setShowCreateJira(false)} />}

          {showPersonal && tasks.slackUnavailableReason && filter !== 'chatwork' && (
            <Alert
              severity="info"
              icon={<Info size={16} />}
              action={
                <Button size="sm" onClick={() => navigate(routes.settings())}>
                  接続方法を見る
                </Button>
              }
            >
              {tasks.slackUnavailableReason}
            </Alert>
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
            <Stack spacing={2}>
              {tasks.isLoading && visiblePersonal.length === 0 ? (
                <Card sx={{ p: 2 }}>
                  <SkeletonList rows={4} avatar={false} />
                </Card>
              ) : visiblePersonal.length === 0 ? (
                area === 'personal' ? (
                  <EmptyState
                    icon={<CircleCheckBig size={24} />}
                    title={status === 'open' ? '未完了のマイタスクはありません' : '完了したマイタスクはありません'}
                    description={status === 'open' ? 'お疲れさまでした！' : undefined}
                  />
                ) : null
              ) : status === 'open' ? (
                groups.map((g) => (
                  <TaskGroup key={g.group} title={DUE_GROUP_LABELS[g.group]} color={GROUP_COLOR[g.group]} tasks={g.items} />
                ))
              ) : (
                <TaskGroup title="完了（マイタスク）" color="success.main" tasks={doneSorted} />
              )}
            </Stack>
          )}

          {showJira && (area === 'jira' || visibleJira.length > 0 || Boolean(settings.atlassian)) && (
            <JiraSection
              items={visibleJira}
              canEdit={Boolean(settings.atlassian)}
              onOpenCreate={() => setShowCreateJira(true)}
            />
          )}

          {showPr &&
            (area === 'pr' ||
              openPrs.length > 0 ||
              openGitHubIssues.length > 0 ||
              Boolean(settings.github) ||
              (settings.githubAccounts?.length ?? 0) > 0) && (
              <>
                <PullRequestsSection items={openPrs} />
                <GitHubIssuesSection items={openGitHubIssues} />
              </>
            )}
        </Stack>
      </Box>
    </Stack>
  )
}

function TaskGroup({ title, color, tasks }: { title: string; color: string; tasks: Task[] }) {
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center', px: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color }}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {tasks.length}
        </Typography>
      </Stack>
      <Card sx={{ overflow: 'hidden' }}>
        <Stack divider={<Divider />}>
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </Stack>
      </Card>
    </Box>
  )
}
