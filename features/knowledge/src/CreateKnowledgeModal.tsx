import { useMemo, useState, type FormEvent } from 'react'
import { Check, Copy, ExternalLink, FilePlus2, Search, Sparkles } from 'lucide-react'
import { actions, openExternal, useKnowledge, useMail, useSettings, useUnifiedTasks } from '@omni-desk/client'
import type { KnowledgeDoc } from '@omni-desk/contracts'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  ListItemButton,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@omni-desk/ui'

interface ReferenceItem {
  id: string
  kind: 'task' | 'jira' | 'pr' | 'issue' | 'mail'
  kindLabel: string
  title: string
  meta: string
  url?: string
  snippet?: string
}

export function CreateKnowledgeModal({
  initialTitle = '',
  initialBody = '',
  onClose
}: {
  initialTitle?: string
  initialBody?: string
  onClose: () => void
}) {
  const settings = useSettings()
  const knowledge = useKnowledge()
  const tasks = useUnifiedTasks()
  const mail = useMail()

  const notionParents = useMemo(
    () => knowledge.docs.filter((d) => d.source === 'notion' && d.rawId),
    [knowledge.docs]
  )

  const references = useMemo<ReferenceItem[]>(() => {
    const out: ReferenceItem[] = []
    for (const j of knowledge.jiraIssues) {
      out.push({
        id: `jira:${j.key}`,
        kind: 'jira',
        kindLabel: `Jira ${j.key}`,
        title: j.summary,
        meta: j.status,
        url: j.url
      })
    }
    for (const pr of knowledge.pullRequests) {
      out.push({
        id: `pr:${pr.id}`,
        kind: 'pr',
        kindLabel: `PR #${pr.number}`,
        title: pr.title,
        meta: pr.repo,
        url: pr.url
      })
    }
    for (const issue of knowledge.githubIssues ?? []) {
      out.push({
        id: `issue:${issue.id}`,
        kind: 'issue',
        kindLabel: `Issue #${issue.number}`,
        title: issue.title,
        meta: issue.repo,
        url: issue.url
      })
    }
    for (const t of tasks.items.filter((x) => x.status === 'open').slice(0, 30)) {
      out.push({
        id: `task:${t.id}`,
        kind: 'task',
        kindLabel: t.source === 'slack' ? 'Slack タスク' : 'Chatwork タスク',
        title: t.text,
        meta: t.conversationName ?? ''
      })
    }
    for (const m of mail.messages.slice(0, 20)) {
      out.push({
        id: `mail:${m.id}`,
        kind: 'mail',
        kindLabel: 'メール',
        title: m.subject,
        meta: m.from.name || m.from.email,
        url: m.webUrl,
        snippet: m.snippet
      })
    }
    return out
  }, [knowledge.jiraIssues, knowledge.pullRequests, knowledge.githubIssues, tasks.items, mail.messages])

  const [refQuery, setRefQuery] = useState('')
  const [selectedRefIds, setSelectedRefIds] = useState<Set<string>>(() => new Set())
  const [title, setTitle] = useState(initialTitle)
  const [body, setBody] = useState(initialBody)
  const [parentId, setParentId] = useState<string>(() => notionParents[0]?.rawId ?? '')
  const [savingNotion, setSavingNotion] = useState(false)
  const [createdDoc, setCreatedDoc] = useState<KnowledgeDoc | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredRefs = useMemo(() => {
    const q = refQuery.trim().toLowerCase()
    if (!q) return references.slice(0, 25)
    return references.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.kindLabel.toLowerCase().includes(q) ||
        r.meta.toLowerCase().includes(q)
    )
  }, [references, refQuery])

  const toggleRef = (id: string) => {
    setSelectedRefIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const insertSelectedRefs = () => {
    const chosen = references.filter((r) => selectedRefIds.has(r.id))
    if (chosen.length === 0) return
    if (!title.trim() && chosen.length === 1) {
      setTitle(chosen[0].title)
    }
    const lines = [
      '## 参照タスク・情報',
      ...chosen.map((r) => {
        const meta = r.meta ? `（${r.meta}）` : ''
        const link = r.url ? ` - ${r.url}` : ''
        return `- [${r.kindLabel}] ${r.title}${meta}${link}`
      }),
      '',
      '## 背景・目的',
      '- ',
      '',
      '## まとめ・決定事項',
      '- '
    ]
    const snippetBlock = lines.join('\n')
    setBody((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${snippetBlock}` : snippetBlock))
  }

  const copyMarkdown = async (): Promise<boolean> => {
    const md = `# ${title.trim() || '無題のナレッジ'}\n\n${body}`
    try {
      await navigator.clipboard.writeText(md)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      return true
    } catch {
      return false
    }
  }

  const handleCreateNotion = async (e: FormEvent) => {
    e.preventDefault()
    const target = notionParents.find((p) => p.rawId === parentId)
    if (!parentId || !title.trim()) return
    setSavingNotion(true)
    setError(null)
    try {
      const created = await actions.createNotionPage({
        parentId,
        parentType: target?.objectType === 'database' ? 'database' : 'page',
        title: title.trim(),
        body
      })
      setCreatedDoc(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingNotion(false)
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <FilePlus2 size={16} />
          <span>ナレッジを作成・出力</span>
        </Stack>
        <IconButton label="閉じる" onClick={onClose}>
          <span>×</span>
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Box
          sx={{
            display: 'grid',
            minHeight: 480,
            maxHeight: '75vh',
            gridTemplateColumns: { xs: '1fr', md: '304px minmax(0, 1fr)' }
          }}
        >
          <Stack
            spacing={1}
            sx={(theme) => ({
              minHeight: 0,
              borderBottom: { xs: `1px solid ${theme.palette.divider}`, md: 'none' },
              borderRight: { md: `1px solid ${theme.palette.divider}` },
              bgcolor: theme.palette.mode === 'dark' ? '#12151a' : '#f6f7f9',
              p: 2
            })}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              タスク・PR・メールを参照
            </Typography>
            <Typography variant="caption" color="text.secondary">
              チェックして「本文に挿入」すると骨子を自動作成します
            </Typography>
            <TextField
              size="small"
              value={refQuery}
              onChange={(e) => setRefQuery(e.target.value)}
              placeholder="参照元を検索..."
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
            <Stack spacing={0.5} sx={{ flex: 1, overflowY: 'auto' }}>
              {filteredRefs.length === 0 ? (
                <Typography variant="caption" color="text.disabled" sx={{ py: 3, textAlign: 'center' }}>
                  参照できる項目がありません
                </Typography>
              ) : (
                filteredRefs.map((r) => {
                  const checked = selectedRefIds.has(r.id)
                  return (
                    <ListItemButton
                      key={r.id}
                      selected={checked}
                      onClick={() => toggleRef(r.id)}
                      sx={{ alignItems: 'flex-start', borderRadius: 1, gap: 1, px: 1, py: 1 }}
                    >
                      <Checkbox size="small" checked={checked} sx={{ p: 0 }} />
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <Chip size="small" label={r.kindLabel} />
                          {r.meta && (
                            <Typography variant="caption" color="text.disabled" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.meta}
                            </Typography>
                          )}
                        </Stack>
                        <Typography
                          variant="caption"
                          sx={{
                            mt: 0.5,
                            fontWeight: 500,
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical'
                          }}
                        >
                          {r.title}
                        </Typography>
                      </Box>
                    </ListItemButton>
                  )
                })
              )}
            </Stack>
            <Button type="button" size="sm" disabled={selectedRefIds.size === 0} onClick={insertSelectedRefs}>
              <Sparkles size={16} />
              選択した {selectedRefIds.size} 件を本文に挿入
            </Button>
          </Stack>

          <Stack component="form" spacing={2} onSubmit={handleCreateNotion} sx={{ overflowY: 'auto', p: 3 }}>
            <TextField
              required
              label="タイトル"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: ○○機能の設計メモ / 障害振り返り"
              fullWidth
            />

            <TextField
              multiline
              rows={10}
              label="本文（Markdown 形式: # 見出し / - 箇条書き）"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="左からタスク・PR を選んで挿入するか、直接入力してください..."
              fullWidth
            />

            {settings.notion ? (
              notionParents.length > 0 ? (
                <TextField
                  select
                  label="Notion 保存先（親ページ / データベース）"
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  fullWidth
                >
                  {notionParents.map((p) => (
                    <MenuItem key={p.id} value={p.rawId}>
                      [{p.objectType === 'database' ? 'DB' : 'ページ'}] {p.title}
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <Typography variant="caption" color="text.disabled">
                  Notion 上でインテグレーションにアクセス許可されたページ/データベースが見つかりません。先にナレッジの「更新」を試してください。
                </Typography>
              )
            ) : (
              <Alert severity="info">
                Notion へ直接保存するには設定画面で Notion を連携してください。未連携でも Markdown コピーや Google ドキュメントへ出力できます。
              </Alert>
            )}

            {error && <Alert severity="error">{error}</Alert>}

            {createdDoc && (
              <Alert
                severity="success"
                action={
                  createdDoc.url ? (
                    <Button type="button" size="sm" onClick={() => openExternal(createdDoc.url)}>
                      <ExternalLink size={16} />
                      Notion で開く
                    </Button>
                  ) : undefined
                }
              >
                Notion に「{createdDoc.title}」を作成しました。
              </Alert>
            )}

            <Stack
              direction="row"
              spacing={1}
              sx={(theme) => ({
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderTop: `1px solid ${theme.palette.divider}`,
                pt: 2
              })}
            >
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                <Button type="button" size="sm" onClick={() => void copyMarkdown()}>
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'コピーしました' : 'Markdown をコピー'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    void copyMarkdown().then(() => openExternal('https://docs.new'))
                  }}
                >
                  <ExternalLink size={16} />
                  コピーして Google ドキュメント作成
                </Button>
              </Stack>
              <Stack direction="row" spacing={1}>
                <Button type="button" size="sm" onClick={onClose}>
                  閉じる
                </Button>
                {settings.notion && notionParents.length > 0 && (
                  <Button
                    type="submit"
                    size="sm"
                    variant="primary"
                    loading={savingNotion}
                    disabled={!title.trim() || !parentId}
                  >
                    Notion に保存
                  </Button>
                )}
              </Stack>
            </Stack>
          </Stack>
        </Box>
      </DialogContent>
    </Dialog>
  )
}
