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
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  InputAdornment,
  ListItemButton,
  PageHeader,
  Paper,
  Segmented,
  SkeletonList,
  Stack,
  TextField,
  Typography
} from '@omni-desk/ui'
import { CreateKnowledgeModal } from './CreateKnowledgeModal'

type KnowledgeTab = 'all' | 'confluence' | 'notion' | 'repos'

type SelectedItem = { kind: 'doc'; doc: KnowledgeDoc } | { kind: 'repo'; repo: GitHubRepo }

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
    <Stack sx={{ height: '100%' }}>
      <PageHeader
        title="ナレッジ"
        subtitle="Confluence・Notion の共有資料とリポジトリ知識を横断確認・蓄積します"
        actions={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setDraftSeed(null)
                setCreateOpen(true)
              }}
            >
              <FilePlus2 size={16} />
              ナレッジを作成
            </Button>
            <Button
              size="sm"
              onClick={() => actions.refreshKnowledge(query.trim() ? { docQuery: query.trim() } : undefined)}
              loading={knowledge.loading}
            >
              <RefreshCw size={16} />
              更新
            </Button>
          </Stack>
        }
      >
        <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', alignItems: 'center', rowGap: 1 }}>
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
          <TextField
            size="small"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="タイトル・スペース・リポジトリ・言語で検索..."
            sx={{ minWidth: 200, flex: 1 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} />
                  </InputAdornment>
                )
              }
            }}
          />
        </Stack>
      </PageHeader>

      {knowledge.error && (
        <Box sx={{ px: 3, pt: 2 }}>
          <Alert
            severity="error"
            action={
              <Button size="sm" onClick={() => navigate(routes.settings())}>
                設定を開く
              </Button>
            }
          >
            {knowledge.error.message}
          </Alert>
        </Box>
      )}

      {!hasAnyConnection && !settings.demoActive ? (
        <Box sx={{ flex: 1, p: 3 }}>
          <Card sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, p: 3 }}>
            <Box>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                Confluence / Notion / GitHub を連携しましょう
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                設定画面から接続すると、社内ドキュメントや Organization リポジトリをここに集約できます。
              </Typography>
            </Box>
            <Button size="sm" variant="primary" onClick={() => navigate(routes.settings())}>
              設定へ
            </Button>
          </Card>
        </Box>
      ) : knowledge.loading && totalCount === 0 ? (
        <Box sx={{ p: 3 }}>
          <Card sx={{ p: 2 }}>
            <SkeletonList rows={6} avatar={false} />
          </Card>
        </Box>
      ) : totalCount === 0 ? (
        <Box sx={{ flex: 1, p: 3 }}>
          <EmptyState
            icon={<BookOpen size={24} />}
            title="表示できるナレッジがありません"
            description={q ? '検索キーワードを変えてみてください' : '右上の「更新」または設定画面からサービスを連携してください'}
          />
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            minHeight: 0,
            flex: 1,
            gridTemplateColumns: { xs: '1fr', lg: '400px minmax(0, 1fr)' }
          }}
        >
          <Box sx={(theme) => ({ overflowY: 'auto', borderRight: `1px solid ${theme.palette.divider}` })}>
            {visibleDocs.length > 0 && (
              <Box>
                <Stack
                  direction="row"
                  sx={(theme) => ({
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: `1px solid ${theme.palette.divider}`,
                    bgcolor: theme.palette.mode === 'dark' ? '#12151a' : '#f6f7f9',
                    px: 2,
                    py: 1
                  })}
                >
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: 'text.secondary' }}>
                    <FileText size={16} />
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      ドキュメント
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.disabled">
                    {visibleDocs.length}
                  </Typography>
                </Stack>
                <Stack divider={<Divider />}>
                  {visibleDocs.map((doc) => {
                    const key = `doc:${doc.id}`
                    const active = selected?.kind === 'doc' && selected.doc.id === doc.id
                    return (
                      <ListItemButton
                        key={doc.id}
                        selected={active}
                        onClick={() => setSelectedKey(key)}
                        sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 0.5, px: 2, py: 2 }}
                      >
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <Chip size="small" label={doc.source.toUpperCase()} />
                          {doc.spaceOrParent && (
                            <Typography variant="caption" color="text.disabled" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {doc.spaceOrParent}
                            </Typography>
                          )}
                        </Stack>
                        <Typography variant="body1" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.title}
                        </Typography>
                        <Typography variant="caption" color="text.disabled">
                          {doc.author ? `${doc.author.name} · ` : ''}
                          {formatMessageTime(doc.updatedAt)}
                        </Typography>
                      </ListItemButton>
                    )
                  })}
                </Stack>
              </Box>
            )}

            {visibleRepos.length > 0 && (
              <Box>
                <Stack
                  direction="row"
                  sx={(theme) => ({
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: `1px solid ${theme.palette.divider}`,
                    bgcolor: theme.palette.mode === 'dark' ? '#12151a' : '#f6f7f9',
                    px: 2,
                    py: 1
                  })}
                >
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: 'text.secondary' }}>
                    <FolderGit2 size={16} />
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      リポジトリ
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.disabled">
                    {visibleRepos.length}
                  </Typography>
                </Stack>
                <Stack divider={<Divider />}>
                  {visibleRepos.map((repo) => {
                    const key = `repo:${repo.id}`
                    const active = selected?.kind === 'repo' && selected.repo.id === repo.id
                    return (
                      <ListItemButton
                        key={repo.id}
                        selected={active}
                        onClick={() => setSelectedKey(key)}
                        sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 0.5, px: 2, py: 2 }}
                      >
                        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {repo.fullName}
                          </Typography>
                          <Chip size="small" label={repo.isPrivate ? 'Private' : 'Public'} />
                          {repo.language && <Chip size="small" variant="outlined" label={repo.language} />}
                        </Stack>
                        {repo.description && (
                          <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {repo.description}
                          </Typography>
                        )}
                        <Typography variant="caption" color="text.disabled">
                          更新: {formatMessageTime(repo.updatedAt)}
                        </Typography>
                      </ListItemButton>
                    )
                  })}
                </Stack>
              </Box>
            )}
          </Box>

          <Box sx={{ overflowY: 'auto', p: 3 }}>
            {selected?.kind === 'doc' ? (
              <Stack spacing={2} sx={{ mx: 'auto', maxWidth: 680 }}>
                <Stack
                  direction="row"
                  spacing={2}
                  sx={(theme) => ({
                    flexWrap: 'wrap',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    borderBottom: `1px solid ${theme.palette.divider}`,
                    pb: 2
                  })}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Chip size="small" label={selected.doc.source.toUpperCase()} />
                      {selected.doc.spaceOrParent && (
                        <Typography variant="caption" color="text.disabled">
                          {selected.doc.spaceOrParent}
                        </Typography>
                      )}
                    </Stack>
                    <Typography variant="h2" sx={{ mt: 1 }}>
                      {selected.doc.title}
                    </Typography>
                    <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
                      {selected.doc.author ? `作成・編集: ${selected.doc.author.name} · ` : ''}
                      最終更新: {formatMessageTime(selected.doc.updatedAt)}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
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
                      <FilePlus2 size={16} />
                      派生メモを作成
                    </Button>
                    {selected.doc.url && (
                      <Button size="sm" variant="primary" onClick={() => openExternal(selected.doc.url)}>
                        <ExternalLink size={16} />
                        ブラウザで開く
                      </Button>
                    )}
                  </Stack>
                </Stack>
                <Paper variant="outlined" sx={{ p: 3 }}>
                  <Typography variant="caption" color="text.disabled">
                    概要 / 抜粋
                  </Typography>
                  <Typography variant="body1" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
                    {selected.doc.excerpt || '（抜粋テキストはありません。右上の「ブラウザで開く」から本文を確認できます）'}
                  </Typography>
                </Paper>
              </Stack>
            ) : selected?.kind === 'repo' ? (
              <Stack spacing={3} sx={{ mx: 'auto', maxWidth: 680 }}>
                <Stack
                  direction="row"
                  spacing={2}
                  sx={(theme) => ({
                    flexWrap: 'wrap',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    borderBottom: `1px solid ${theme.palette.divider}`,
                    pb: 2
                  })}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                      <Chip size="small" label={selected.repo.isPrivate ? 'Private' : 'Public'} />
                      {selected.repo.language && <Chip size="small" variant="outlined" label={selected.repo.language} />}
                      {selected.repo.owner && (
                        <Typography variant="caption" color="text.disabled">
                          Owner: {selected.repo.owner}
                        </Typography>
                      )}
                    </Stack>
                    <Typography variant="h2" sx={{ mt: 1 }}>
                      {selected.repo.fullName}
                    </Typography>
                    <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
                      最終更新: {formatMessageTime(selected.repo.updatedAt)}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
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
                      <FilePlus2 size={16} />
                      リポジトリメモを作成
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => openExternal(selected.repo.url)}>
                      <ExternalLink size={16} />
                      GitHub で開く
                    </Button>
                  </Stack>
                </Stack>

                {selected.repo.description && (
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="body1">{selected.repo.description}</Typography>
                  </Paper>
                )}

                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <GitPullRequest size={16} />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      関連するオープン PR（{relatedPrs.length}）
                    </Typography>
                  </Stack>
                  {relatedPrs.length === 0 ? (
                    <Typography variant="caption" color="text.disabled">
                      このリポジトリに関連するオープン PR はありません
                    </Typography>
                  ) : (
                    <Card sx={{ overflow: 'hidden' }}>
                      <Stack divider={<Divider />}>
                        {relatedPrs.map((pr) => (
                          <ListItemButton key={pr.id} onClick={() => openExternal(pr.url)} sx={{ justifyContent: 'space-between', gap: 2, px: 2, py: 1.5 }}>
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                              <Typography variant="body1" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                #{pr.number} {pr.title}
                              </Typography>
                              <Typography variant="caption" color="text.disabled">
                                {pr.role === 'reviewer' ? 'レビュー依頼' : '自分の PR'} · {pr.author.name}
                              </Typography>
                            </Box>
                            <ExternalLink size={16} />
                          </ListItemButton>
                        ))}
                      </Stack>
                    </Card>
                  )}
                </Stack>

                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <CircleDot size={16} />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      関連するアサイン済み Issue（{relatedIssues.length}）
                    </Typography>
                  </Stack>
                  {relatedIssues.length === 0 ? (
                    <Typography variant="caption" color="text.disabled">
                      このリポジトリにアサインされたオープン Issue はありません
                    </Typography>
                  ) : (
                    <Card sx={{ overflow: 'hidden' }}>
                      <Stack divider={<Divider />}>
                        {relatedIssues.map((issue) => (
                          <ListItemButton key={issue.id} onClick={() => openExternal(issue.url)} sx={{ justifyContent: 'space-between', gap: 2, px: 2, py: 1.5 }}>
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                              <Typography variant="body1" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                #{issue.number} {issue.title}
                              </Typography>
                              <Typography variant="caption" color="text.disabled">
                                {formatMessageTime(issue.updatedAt)}
                              </Typography>
                            </Box>
                            <ExternalLink size={16} />
                          </ListItemButton>
                        ))}
                      </Stack>
                    </Card>
                  )}
                </Stack>
              </Stack>
            ) : (
              <EmptyState icon={<BookOpen size={24} />} title="項目を選択してください" />
            )}
          </Box>
        </Box>
      )}

      {createOpen && (
        <CreateKnowledgeModal
          initialTitle={draftSeed?.title}
          initialBody={draftSeed?.body}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </Stack>
  )
}
