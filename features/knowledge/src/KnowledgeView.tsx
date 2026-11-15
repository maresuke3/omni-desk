import { useMemo, useState } from 'react'
import {
  BookOpen,
  CircleDot,
  ExternalLink,
  FilePlus2,
  FileText,
  FolderGit2,
  GitPullRequest,
  RefreshCw,
  Search
} from 'lucide-react'
import { actions, openExternal, useKnowledge, useSettings } from '@omni-desk/client'
import { routes, type GitHubRepo, type KnowledgeDoc } from '@omni-desk/contracts'
import type { FeatureContext } from '@omni-desk/contracts/feature'
import { formatMessageTime } from '@omni-desk/message-kit'
import { Button, EmptyState, PageHeader, Segmented, SkeletonList, cn } from '@omni-desk/ui'
import { CreateKnowledgeModal } from './CreateKnowledgeModal'

type KnowledgeTab = 'all' | 'confluence' | 'notion' | 'repos'

type SelectedItem =
  | { kind: 'doc'; doc: KnowledgeDoc }
  | { kind: 'repo'; repo: GitHubRepo }

export function KnowledgeView({ navigate }: FeatureContext) {
  const settings = useSettings()
  const knowledge = useKnowledge()
  const [tab, setTab] = useState<KnowledgeTab>('all')
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [draftSeed, setDraftSeed] = useState<{ title: string; body: string } | null>(null)

  const q = query.trim().toLowerCase()
  const allDocs = useMemo(
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

  const confluenceDocs = useMemo(() => allDocs.filter((d) => d.source === 'confluence'), [allDocs])
  const notionDocs = useMemo(() => allDocs.filter((d) => d.source === 'notion'), [allDocs])

  const visibleDocs = useMemo(() => {
    if (tab === 'confluence') return confluenceDocs
    if (tab === 'notion') return notionDocs
    if (tab === 'repos') return []
    return allDocs
  }, [tab, allDocs, confluenceDocs, notionDocs])

  const visibleRepos = useMemo(() => {
    if (tab === 'confluence' || tab === 'notion') return []
    return knowledge.repos.filter(
      (r) =>
        !q ||
        r.fullName.toLowerCase().includes(q) ||
        (r.description?.toLowerCase().includes(q) ?? false) ||
        (r.language?.toLowerCase().includes(q) ?? false)
    )
  }, [tab, knowledge.repos, q])

  const selectableItems = useMemo<Array<{ key: string; item: SelectedItem }>>(() => {
    const out: Array<{ key: string; item: SelectedItem }> = []
    for (const doc of visibleDocs) out.push({ key: `doc:${doc.id}`, item: { kind: 'doc', doc } })
    for (const repo of visibleRepos) out.push({ key: `repo:${repo.id}`, item: { kind: 'repo', repo } })
    return out
  }, [visibleDocs, visibleRepos])

  const selected = useMemo(
    () => selectableItems.find((x) => x.key === selectedKey)?.item ?? selectableItems[0]?.item ?? null,
    [selectableItems, selectedKey]
  )

  const relatedPrs = useMemo(() => {
    if (selected?.kind !== 'repo') return []
    return knowledge.pullRequests.filter((pr) => pr.repo === selected.repo.fullName && pr.state === 'open')
  }, [selected, knowledge.pullRequests])

  const relatedIssues = useMemo(() => {
    if (selected?.kind !== 'repo') return []
    return (knowledge.githubIssues ?? []).filter((i) => i.repo === selected.repo.fullName && i.state === 'open')
  }, [selected, knowledge.githubIssues])

  const hasAnyConnection = Boolean(
    settings.github ||
      (settings.githubAccounts?.length ?? 0) > 0 ||
      settings.atlassian ||
      settings.notion
  )
  const totalCount = visibleDocs.length + visibleRepos.length

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="ナレッジ"
        subtitle="Confluence・Notion の共有資料とリポジトリ知識を横断確認・蓄積します"
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setDraftSeed(null)
                setCreateOpen(true)
              }}
            >
              <FilePlus2 className="size-3.5" />
              ナレッジを作成
            </Button>
            <Button
              size="sm"
              onClick={() => actions.refreshKnowledge(query.trim() ? { docQuery: query.trim() } : undefined)}
              disabled={knowledge.loading}
            >
              <RefreshCw className={cn('size-3.5', knowledge.loading && 'animate-spin')} />
              更新
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <Segmented<KnowledgeTab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'all', label: 'すべて', count: allDocs.length + knowledge.repos.length },
              { value: 'confluence', label: 'Confluence', count: confluenceDocs.length },
              { value: 'notion', label: 'Notion', count: notionDocs.length },
              { value: 'repos', label: 'リポジトリ', count: knowledge.repos.length }
            ]}
          />
          <div className="flex h-8 min-w-[200px] flex-1 items-center gap-1.5 rounded-lg border border-line bg-sunken px-2.5 focus-within:border-accent focus-within:bg-panel">
            <Search className="size-3.5 text-fg-subtle" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="タイトル・スペース・リポジトリ・言語で検索..."
              className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-fg-subtle"
            />
          </div>
        </div>
      </PageHeader>

      {knowledge.error && (
        <div className="px-7 pt-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-[12.5px] text-danger">
            <span>{knowledge.error.message}</span>
            <Button size="sm" onClick={() => navigate(routes.settings())}>
              設定を開く
            </Button>
          </div>
        </div>
      )}

      {!hasAnyConnection && !settings.demoActive ? (
        <div className="flex-1 p-7">
          <div className="card flex items-center justify-between gap-4 p-5">
            <div>
              <p className="text-[13.5px] font-semibold">Confluence / Notion / GitHub を連携しましょう</p>
              <p className="mt-0.5 text-[12px] text-fg-muted">
                設定画面から接続すると、社内ドキュメントや Organization リポジトリをここに集約できます。
              </p>
            </div>
            <Button size="sm" variant="primary" onClick={() => navigate(routes.settings())}>
              設定へ
            </Button>
          </div>
        </div>
      ) : knowledge.loading && totalCount === 0 ? (
        <div className="p-7">
          <div className="card p-4">
            <SkeletonList rows={6} avatar={false} />
          </div>
        </div>
      ) : totalCount === 0 ? (
        <div className="flex-1 p-7">
          <EmptyState
            icon={<BookOpen className="size-5" />}
            title="表示できるナレッジがありません"
            description={q ? '検索キーワードを変えてみてください' : '右上の「更新」または設定画面からサービスを連携してください'}
          />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[400px_minmax(0,1fr)]">
          {/* 左ペイン：ドキュメント & リポジトリ一覧 */}
          <div className="thin-scroll divide-y divide-line overflow-y-auto border-r border-line">
            {visibleDocs.length > 0 && (
              <section>
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-sunken/95 px-4 py-2 backdrop-blur">
                  <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-fg-muted">
                    <FileText className="size-3.5" />
                    ドキュメント
                  </span>
                  <span className="text-[11px] text-fg-subtle tabular-nums">{visibleDocs.length}</span>
                </div>
                <ul className="divide-y divide-line">
                  {visibleDocs.map((doc) => {
                    const key = `doc:${doc.id}`
                    const active = selected?.kind === 'doc' && selected.doc.id === doc.id
                    return (
                      <li key={doc.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedKey(key)}
                          className={cn(
                            'flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-hover/50',
                            active && 'bg-accent/10'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-sunken px-1.5 py-px text-[10.5px] font-medium uppercase text-fg-muted">
                              {doc.source}
                            </span>
                            {doc.spaceOrParent && (
                              <span className="truncate text-[11px] text-fg-subtle">{doc.spaceOrParent}</span>
                            )}
                          </div>
                          <p className="truncate text-[13px] font-medium text-fg">{doc.title}</p>
                          <p className="text-[11px] text-fg-subtle">
                            {doc.author ? `${doc.author.name} · ` : ''}
                            {formatMessageTime(doc.updatedAt)}
                          </p>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {visibleRepos.length > 0 && (
              <section>
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-sunken/95 px-4 py-2 backdrop-blur">
                  <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-fg-muted">
                    <FolderGit2 className="size-3.5" />
                    リポジトリ
                  </span>
                  <span className="text-[11px] text-fg-subtle tabular-nums">{visibleRepos.length}</span>
                </div>
                <ul className="divide-y divide-line">
                  {visibleRepos.map((repo) => {
                    const key = `repo:${repo.id}`
                    const active = selected?.kind === 'repo' && selected.repo.id === repo.id
                    return (
                      <li key={repo.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedKey(key)}
                          className={cn(
                            'flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-hover/50',
                            active && 'bg-accent/10'
                          )}
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate font-mono text-[12.5px] font-medium text-fg">{repo.fullName}</span>
                            <span className="rounded bg-sunken px-1.5 py-px text-[10px] text-fg-subtle">
                              {repo.isPrivate ? 'Private' : 'Public'}
                            </span>
                            {repo.language && (
                              <span className="rounded bg-sunken px-1.5 py-px text-[10px] text-fg-muted">
                                {repo.language}
                              </span>
                            )}
                          </div>
                          {repo.description && <p className="line-clamp-1 text-[11.5px] text-fg-muted">{repo.description}</p>}
                          <p className="text-[11px] text-fg-subtle">更新: {formatMessageTime(repo.updatedAt)}</p>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </div>

          {/* 右ペイン：詳細プレビュー＆関連コンテキスト */}
          <div className="thin-scroll overflow-y-auto p-6">
            {selected?.kind === 'doc' ? (
              <div className="mx-auto max-w-2xl space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-sunken px-2 py-0.5 text-[11px] font-semibold uppercase text-fg-muted">
                        {selected.doc.source}
                      </span>
                      {selected.doc.spaceOrParent && (
                        <span className="text-[12px] text-fg-subtle">{selected.doc.spaceOrParent}</span>
                      )}
                    </div>
                    <h2 className="mt-2 text-[17px] font-semibold text-fg">{selected.doc.title}</h2>
                    <p className="mt-1 text-[12px] text-fg-subtle">
                      {selected.doc.author ? `作成・編集: ${selected.doc.author.name} · ` : ''}
                      最終更新: {formatMessageTime(selected.doc.updatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setDraftSeed({
                          title: `${selected.doc.title}（補足メモ）`,
                          body: `## 参照元\n- [${selected.doc.source}] ${selected.doc.title}${selected.doc.url ? ` - ${selected.doc.url}` : ''}\n\n## 要点\n- `
                        })
                        setCreateOpen(true)
                      }}
                    >
                      <FilePlus2 className="size-3.5" />
                      派生メモを作成
                    </Button>
                    {selected.doc.url && (
                      <Button size="sm" variant="primary" onClick={() => openExternal(selected.doc.url)}>
                        <ExternalLink className="size-3.5" />
                        ブラウザで開く
                      </Button>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-line bg-panel p-5">
                  <p className="text-[11.5px] font-medium text-fg-subtle">概要 / 抜粋</p>
                  <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg">
                    {selected.doc.excerpt || '（抜粋テキストはありません。右上の「ブラウザで開く」から本文を確認できます）'}
                  </p>
                </div>
              </div>
            ) : selected?.kind === 'repo' ? (
              <div className="mx-auto max-w-2xl space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-sunken px-2 py-0.5 text-[11px] font-medium text-fg-muted">
                        {selected.repo.isPrivate ? 'Private' : 'Public'}
                      </span>
                      {selected.repo.language && (
                        <span className="rounded bg-sunken px-2 py-0.5 text-[11px] text-fg-muted">
                          {selected.repo.language}
                        </span>
                      )}
                      {selected.repo.owner && (
                        <span className="text-[12px] text-fg-subtle">Owner: {selected.repo.owner}</span>
                      )}
                    </div>
                    <h2 className="mt-2 font-mono text-[17px] font-semibold text-fg">{selected.repo.fullName}</h2>
                    <p className="mt-1 text-[12px] text-fg-subtle">最終更新: {formatMessageTime(selected.repo.updatedAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setDraftSeed({
                          title: `${selected.repo.fullName} ナレッジメモ`,
                          body: `## リポジトリ\n- ${selected.repo.fullName} (${selected.repo.url})\n${selected.repo.description ? `- ${selected.repo.description}\n` : ''}\n## メモ\n- `
                        })
                        setCreateOpen(true)
                      }}
                    >
                      <FilePlus2 className="size-3.5" />
                      リポジトリメモを作成
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => openExternal(selected.repo.url)}>
                      <ExternalLink className="size-3.5" />
                      GitHub で開く
                    </Button>
                  </div>
                </div>

                {selected.repo.description && (
                  <div className="rounded-xl border border-line bg-panel p-4 text-[13px] text-fg">
                    {selected.repo.description}
                  </div>
                )}

                <div className="space-y-3">
                  <h3 className="flex items-center gap-2 text-[12.5px] font-semibold text-fg">
                    <GitPullRequest className="size-4 text-accent-text" />
                    関連するオープン PR（{relatedPrs.length}）
                  </h3>
                  {relatedPrs.length === 0 ? (
                    <p className="text-[12px] text-fg-subtle">このリポジトリに関連するオープン PR はありません</p>
                  ) : (
                    <div className="card divide-y divide-line overflow-hidden">
                      {relatedPrs.map((pr) => (
                        <button
                          key={pr.id}
                          type="button"
                          onClick={() => openExternal(pr.url)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-hover/50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium text-fg">
                              #{pr.number} {pr.title}
                            </p>
                            <p className="text-[11px] text-fg-subtle">
                              {pr.role === 'reviewer' ? 'レビュー依頼' : '自分の PR'} · {pr.author.name}
                            </p>
                          </div>
                          <ExternalLink className="size-3.5 shrink-0 text-fg-subtle" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h3 className="flex items-center gap-2 text-[12.5px] font-semibold text-fg">
                    <CircleDot className="size-4 text-success" />
                    関連するアサイン済み Issue（{relatedIssues.length}）
                  </h3>
                  {relatedIssues.length === 0 ? (
                    <p className="text-[12px] text-fg-subtle">このリポジトリにアサインされたオープン Issue はありません</p>
                  ) : (
                    <div className="card divide-y divide-line overflow-hidden">
                      {relatedIssues.map((issue) => (
                        <button
                          key={issue.id}
                          type="button"
                          onClick={() => openExternal(issue.url)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-hover/50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium text-fg">
                              #{issue.number} {issue.title}
                            </p>
                            <p className="text-[11px] text-fg-subtle">{formatMessageTime(issue.updatedAt)}</p>
                          </div>
                          <ExternalLink className="size-3.5 shrink-0 text-fg-subtle" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState icon={<BookOpen className="size-6" />} title="項目を選択してください" />
            )}
          </div>
        </div>
      )}

      {createOpen && (
        <CreateKnowledgeModal
          initialTitle={draftSeed?.title}
          initialBody={draftSeed?.body}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  )
}
