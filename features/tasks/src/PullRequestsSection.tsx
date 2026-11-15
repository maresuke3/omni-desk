import { CircleDot, ExternalLink, GitPullRequest } from 'lucide-react'
import { openExternal } from '@omni-desk/client'
import type { GitHubIssue, PullRequest } from '@omni-desk/contracts'
import { formatMessageTime } from '@omni-desk/message-kit'
import { EmptyState, cn } from '@omni-desk/ui'

export function PullRequestsSection({ items }: { items: PullRequest[] }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 px-1">
        <GitPullRequest className="size-4 text-accent-text" />
        <h3 className="text-[12.5px] font-semibold text-fg">GitHub Pull Requests</h3>
        <span className="text-[11.5px] text-fg-subtle tabular-nums">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="card p-6">
          <EmptyState icon={<GitPullRequest className="size-5" />} title="対象の Pull Request はありません" />
        </div>
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {items.map((pr) => (
            <button
              key={pr.id}
              type="button"
              onClick={() => openExternal(pr.url)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-hover/50"
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
                  <span className="truncate font-mono text-fg-subtle">
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
          ))}
        </div>
      )}
    </section>
  )
}

export function GitHubIssuesSection({ items }: { items: GitHubIssue[] }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 px-1">
        <CircleDot className="size-4 text-success" />
        <h3 className="text-[12.5px] font-semibold text-fg">GitHub Issues（アサイン済み）</h3>
        <span className="text-[11.5px] text-fg-subtle tabular-nums">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="card p-6">
          <EmptyState icon={<CircleDot className="size-5" />} title="アサインされた Issue はありません" />
        </div>
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {items.map((issue) => (
            <button
              key={issue.id}
              type="button"
              onClick={() => openExternal(issue.url)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-hover/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                  <span className="truncate font-mono text-fg-subtle">
                    {issue.repo} #{issue.number}
                  </span>
                  {issue.labels?.slice(0, 3).map((label) => (
                    <span key={label} className="rounded bg-sunken px-1.5 py-px text-fg-muted">
                      {label}
                    </span>
                  ))}
                </div>
                <p className="mt-1 truncate text-[13px] font-medium text-fg">{issue.title}</p>
                <p className="mt-0.5 text-[11.5px] text-fg-subtle">
                  {issue.author.name} · {formatMessageTime(issue.updatedAt)}
                </p>
              </div>
              <ExternalLink className="mt-1 size-3.5 shrink-0 text-fg-subtle" />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
