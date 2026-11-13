import { useMemo, useState } from 'react'
import {
  BookOpen,
  ExternalLink,
  FileText,
  FolderGit2,
  GitPullRequest,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Search,
  Ticket
} from 'lucide-react'
import { actions, openExternal, useAsyncAction, useKnowledge, useSettings } from '@omni-desk/client'
import { routes, type JiraIssue, type KnowledgeDoc, type PullRequest } from '@omni-desk/contracts'
import type { FeatureContext } from '@omni-desk/contracts/feature'
import { formatMessageTime } from '@omni-desk/message-kit'
import { Button, EmptyState, PageHeader, Segmented, SkeletonList, cn } from '@omni-desk/ui'

type BoardTab = 'all' | 'github' | 'jira' | 'docs'

const JIRA_CATEGORY_STYLE: Record<JiraIssue['statusCategory'], string> = {
  todo: 'bg-sunken text-fg-muted',
  in_progress: 'bg-accent/15 text-accent-text',
  done: 'bg-success-soft text-success'
}

export function KnowledgeView({ navigate }: FeatureContext) {
  const settings = useSettings()
  const knowledge = useKnowledge()
  const [tab, setTab] = useState<BoardTab>('all')
  const [query, setQuery] = useState('')
  const [showCreateJira, setShowCreateJira] = useState(false)

  const q = query.trim().toLowerCase()
  const prs = useMemo(
    () =>
      knowledge.pullRequests.filter(
        (pr) => !q || pr.title.toLowerCase().includes(q) || pr.repo.toLowerCase().includes(q)
      ),
    [knowledge.pullRequests, q]
  )
  const repos = useMemo(
    () =>
      knowledge.repos.filter(
        (r) =>
          !q ||
          r.fullName.toLowerCase().includes(q) ||
          (r.description?.toLowerCase().includes(q) ?? false)
      ),
    [knowledge.repos, q]
  )
  const jiraIssues = useMemo(
    () =>
      knowledge.jiraIssues.filter(
        (j) => !q || j.key.toLowerCase().includes(q) || j.summary.toLowerCase().includes(q)
      ),
    [knowledge.jiraIssues, q]
  )
  const docs = useMemo(
    () =>
      knowledge.docs.filter(
        (d) =>
          !q ||
          d.title.toLowerCase().includes(q) ||
          (d.spaceOrParent?.toLowerCase().includes(q) ?? false) ||
          (d.excerpt?.toLowerCase().includes(q) ?? false)
      ),
    [knowledge.docs, q]
  )

  const hasAnyConnection = Boolean(settings.github || settings.atlassian || settings.notion)
  const totalCount = prs.length + repos.length + jiraIssues.length + docs.length

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="ナレッジボード"
        subtitle="PR・リポジトリ・Jira・Confluence・Notion を横断して整理します"
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'all', label: 'すべて' },
              { value: 'github', label: 'PR & Repo', count: prs.length + repos.length },
              { value: 'jira', label: 'Jira', count: jiraIssues.length },
              { value: 'docs', label: '共有資料', count: docs.length }
            ]}
          />
          <div className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-sunken px-2.5 focus-within:border-accent focus-within:bg-panel">
            <Search className="size-3.5 text-fg-subtle" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="キーワードで絞り込み..."
              className="w-44 bg-transparent text-[12.5px] outline-none placeholder:text-fg-subtle"
            />
          </div>
          {settings.atlassian && (
            <Button size="sm" onClick={() => setShowCreateJira((v) => !v)}>
              <Plus className="size-3.5" />
              Jira 起票
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => actions.refreshKnowledge(query.trim() ? { docQuery: query.trim() } : undefined)}
            disabled={knowledge.loading}
          >
            <RefreshCw className={cn('size-3.5', knowledge.loading && 'animate-spin')} />
            更新
          </Button>
        </div>
      </PageHeader>

      <div className="thin-scroll flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1100px] space-y-5 px-7 py-6">
          {!hasAnyConnection && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel px-4 py-3 text-[12.5px]">
              <p className="text-fg-muted">
                GitHub / Atlassian CLI（Jira・Confluence）/ Notion を接続すると実データが表示されます（現在はデモデータを表示中）。
              </p>
              <Button size="sm" onClick={() => navigate(routes.settings())}>
                接続設定へ
              </Button>
            </div>
          )}

          {knowledge.error && (
            <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-[12.5px] text-danger">
              一部のデータ取得に失敗しました: {knowledge.error.message}
            </div>
          )}

          {showCreateJira && <CreateJiraPanel onClose={() => setShowCreateJira(false)} />}

          {knowledge.loading && totalCount === 0 ? (
            <div className="card p-4">
              <SkeletonList rows={6} avatar={false} />
            </div>
          ) : totalCount === 0 ? (
            <EmptyState
              icon={<BookOpen className="size-5" />}
              title="表示できる項目がありません"
              description="検索条件を変えるか、設定画面からサービスを接続してください。"
            />
          ) : tab === 'all' ? (
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-5">
                <PrSection items={prs} />
                <JiraSection items={jiraIssues} canEdit={Boolean(settings.atlassian)} />
              </div>
              <div className="space-y-5">
                <DocsSection items={docs} />
                <RepoSection items={repos} />
              </div>
            </div>
          ) : tab === 'github' ? (
            <div className="space-y-5">
              <PrSection items={prs} />
              <RepoSection items={repos} />
            </div>
          ) : tab === 'jira' ? (
            <JiraSection items={jiraIssues} canEdit={Boolean(settings.atlassian)} />
          ) : (
            <DocsSection items={docs} />
          )}
        </div>
      </div>
    </div>
  )
}

function SectionCard({
  title,
  icon,
  count,
  children
}: {
  title: string
  icon: React.ReactNode
  count: number
  children: React.ReactNode
}) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="text-fg-muted">{icon}</span>
        <h2 className="text-[13.5px] font-semibold">{title}</h2>
        <span className="rounded-full bg-sunken px-2 py-px text-[11px] text-fg-muted tabular-nums">{count}</span>
      </div>
      {children}
    </section>
  )
}

function PrSection({ items }: { items: PullRequest[] }) {
  return (
    <SectionCard title="Pull Requests" icon={<GitPullRequest className="size-4" />} count={items.length}>
      {items.length === 0 ? (
        <p className="px-4 py-5 text-[12.5px] text-fg-subtle">対象の PR はありません</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((pr) => (
            <li key={pr.id}>
              <button
                type="button"
                onClick={() => openExternal(pr.url)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-hover"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                    <span
                      className={cn(
                        'rounded px-1.5 py-px font-medium',
                        pr.role === 'reviewer' ? 'bg-warning-soft text-warning' : 'bg-accent/15 text-accent-text'
                      )}
                    >
                      {pr.role === 'reviewer' ? 'レビュー依頼' : '自分の PR'}
                    </span>
                    {pr.isDraft && <span className="rounded bg-sunken px-1.5 py-px text-fg-muted">Draft</span>}
                    <span className="font-mono text-fg-subtle">
                      {pr.repo} #{pr.number}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[13px] font-medium text-fg">{pr.title}</p>
                  <p className="mt-0.5 text-[11.5px] text-fg-subtle">
                    {pr.author.name} · {formatMessageTime(pr.updatedAt)}
                  </p>
                </div>
                <ExternalLink className="mt-1 size-3.5 shrink-0 text-fg-subtle" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function RepoSection({ items }: { items: ReturnType<typeof useKnowledge>['repos'] }) {
  return (
    <SectionCard title="リポジトリ" icon={<FolderGit2 className="size-4" />} count={items.length}>
      {items.length === 0 ? (
        <p className="px-4 py-5 text-[12.5px] text-fg-subtle">対象のリポジトリはありません</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((repo) => (
            <li key={repo.id}>
              <button
                type="button"
                onClick={() => openExternal(repo.url)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-hover"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono text-[12.5px] font-medium text-fg">{repo.fullName}</span>
                    {repo.isPrivate && (
                      <span className="rounded bg-sunken px-1.5 py-px text-[10.5px] text-fg-muted">Private</span>
                    )}
                  </div>
                  {repo.description && <p className="mt-0.5 truncate text-[12px] text-fg-muted">{repo.description}</p>}
                </div>
                <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function JiraSection({ items, canEdit }: { items: JiraIssue[]; canEdit: boolean }) {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [nextStatus, setNextStatus] = useState('')
  const addComment = useAsyncAction(actions.addJiraComment)
  const updateIssue = useAsyncAction(actions.updateJiraIssue)

  return (
    <SectionCard title="Jira チケット" icon={<Ticket className="size-4" />} count={items.length}>
      {items.length === 0 ? (
        <p className="px-4 py-5 text-[12.5px] text-fg-subtle">対象のチケットはありません</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((issue) => {
            const expanded = activeKey === issue.key
            return (
              <li key={issue.key} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                      <button
                        type="button"
                        onClick={() => openExternal(issue.url)}
                        className="font-mono font-semibold text-accent-text hover:underline"
                      >
                        {issue.key}
                      </button>
                      <span className={cn('rounded px-1.5 py-px font-medium', JIRA_CATEGORY_STYLE[issue.statusCategory])}>
                        {issue.status}
                      </span>
                      {issue.priority && <span className="text-fg-subtle">{issue.priority}</span>}
                    </div>
                    <p className="mt-1 text-[13px] font-medium text-fg">{issue.summary}</p>
                    <p className="mt-0.5 text-[11.5px] text-fg-subtle">
                      {issue.assignee ? `担当: ${issue.assignee.name} · ` : ''}
                      {formatMessageTime(issue.updatedAt)}
                    </p>
                  </div>
                  {canEdit && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setActiveKey(expanded ? null : issue.key)
                        setNextStatus('')
                        setComment('')
                      }}
                    >
                      <MessageSquarePlus className="size-3.5" />
                      操作
                    </Button>
                  )}
                </div>

                {expanded && canEdit && (
                  <div className="mt-3 space-y-2.5 rounded-lg border border-line bg-sunken p-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={nextStatus}
                        onChange={(e) => setNextStatus(e.target.value)}
                        placeholder="ステータス変更（例: In Progress / Done）"
                        className="h-8 flex-1 rounded-md border border-line bg-panel px-2.5 text-[12px] outline-none focus:border-accent"
                      />
                      <Button
                        size="sm"
                        loading={updateIssue.pending}
                        disabled={!nextStatus.trim()}
                        onClick={() =>
                          void updateIssue.run(issue.key, { status: nextStatus.trim() }).then((ok) => {
                            if (ok !== undefined) setNextStatus('')
                          })
                        }
                      >
                        変更
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Jira にコメントを投稿..."
                        className="h-8 flex-1 rounded-md border border-line bg-panel px-2.5 text-[12px] outline-none focus:border-accent"
                      />
                      <Button
                        size="sm"
                        variant="primary"
                        loading={addComment.pending}
                        disabled={!comment.trim()}
                        onClick={() =>
                          void addComment.run(issue.key, comment.trim()).then((ok) => {
                            if (ok !== undefined) {
                              setComment('')
                              setActiveKey(null)
                            }
                          })
                        }
                      >
                        コメント
                      </Button>
                    </div>
                    {(updateIssue.error || addComment.error) && (
                      <p className="text-[11.5px] text-danger">
                        {(updateIssue.error ?? addComment.error)?.message}
                      </p>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}

function DocsSection({ items }: { items: KnowledgeDoc[] }) {
  return (
    <SectionCard title="共有資料（Confluence & Notion）" icon={<FileText className="size-4" />} count={items.length}>
      {items.length === 0 ? (
        <p className="px-4 py-5 text-[12.5px] text-fg-subtle">共有資料はありません</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((doc) => (
            <li key={doc.id}>
              <button
                type="button"
                onClick={() => openExternal(doc.url)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-hover"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                    <span
                      className={cn(
                        'rounded px-1.5 py-px font-medium',
                        doc.source === 'confluence' ? 'bg-accent/15 text-accent-text' : 'bg-sunken text-fg'
                      )}
                    >
                      {doc.source === 'confluence' ? 'Confluence' : 'Notion'}
                    </span>
                    {doc.spaceOrParent && <span className="text-fg-subtle">{doc.spaceOrParent}</span>}
                  </div>
                  <p className="mt-1 truncate text-[13px] font-medium text-fg">{doc.title}</p>
                  {doc.excerpt && <p className="mt-0.5 line-clamp-2 text-[12px] text-fg-muted">{doc.excerpt}</p>}
                  <p className="mt-0.5 text-[11.5px] text-fg-subtle">{formatMessageTime(doc.updatedAt)}</p>
                </div>
                <ExternalLink className="mt-1 size-3.5 shrink-0 text-fg-subtle" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function CreateJiraPanel({ onClose }: { onClose: () => void }) {
  const [projectKey, setProjectKey] = useState('')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const create = useAsyncAction(actions.createJiraIssue)

  return (
    <form
      className="card space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        void create.run({ projectKey, summary, description }).then((res) => {
          if (res) onClose()
        })
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[13.5px] font-semibold">新しい Jira チケットを作成</h3>
        <button type="button" onClick={onClose} className="text-[12px] text-fg-subtle hover:text-fg">
          閉じる
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <input
          type="text"
          value={projectKey}
          onChange={(e) => setProjectKey(e.target.value)}
          placeholder="プロジェクト (例: OMNI)"
          className="h-9 rounded-lg border border-line bg-sunken px-3 text-[12.5px] outline-none focus:border-accent focus:bg-panel"
        />
        <input
          type="text"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="件名"
          className="h-9 rounded-lg border border-line bg-sunken px-3 text-[12.5px] outline-none focus:border-accent focus:bg-panel sm:col-span-3"
        />
      </div>
      <textarea
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="詳細説明（任意）"
        className="w-full rounded-lg border border-line bg-sunken p-3 text-[12.5px] outline-none focus:border-accent focus:bg-panel"
      />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" size="sm" loading={create.pending} disabled={!projectKey.trim() || !summary.trim()}>
          作成する
        </Button>
        {create.error && <span className="text-[12px] text-danger">{create.error.message}</span>}
      </div>
    </form>
  )
}
