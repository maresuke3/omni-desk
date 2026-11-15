import { useMemo, useState, type FormEvent } from 'react'
import { Check, Copy, ExternalLink, FilePlus2, Search, Sparkles, X } from 'lucide-react'
import { actions, openExternal, useKnowledge, useMail, useSettings, useUnifiedTasks } from '@omni-desk/client'
import type { KnowledgeDoc } from '@omni-desk/contracts'
import { Button, cn } from '@omni-desk/ui'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2">
            <FilePlus2 className="size-4 text-accent-text" />
            <h2 className="text-[15px] font-semibold text-fg">ナレッジを作成・出力</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-fg-subtle hover:bg-hover hover:text-fg">
            <X className="size-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)]">
          {/* 左：タスク / PR / メール参照ピッカー */}
          <div className="flex min-h-0 flex-col border-b border-line bg-sunken/30 p-3.5 md:border-r md:border-b-0">
            <p className="text-[12px] font-semibold text-fg">タスク・PR・メールを参照</p>
            <p className="mt-0.5 text-[11px] text-fg-muted">チェックして「本文に挿入」すると骨子を自動作成します</p>
            <div className="mt-2.5 flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel px-2">
              <Search className="size-3.5 text-fg-subtle" />
              <input
                value={refQuery}
                onChange={(e) => setRefQuery(e.target.value)}
                placeholder="参照元を検索..."
                className="w-full bg-transparent text-[12px] outline-none placeholder:text-fg-subtle"
              />
            </div>
            <div className="thin-scroll mt-2.5 flex-1 space-y-1 overflow-y-auto pr-1">
              {filteredRefs.length === 0 ? (
                <p className="py-6 text-center text-[11.5px] text-fg-subtle">参照できる項目がありません</p>
              ) : (
                filteredRefs.map((r) => {
                  const checked = selectedRefIds.has(r.id)
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleRef(r.id)}
                      className={cn(
                        'flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
                        checked ? 'border-accent/50 bg-accent/10' : 'border-transparent hover:bg-hover/60'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border text-white',
                          checked ? 'border-accent bg-accent' : 'border-line-strong bg-panel'
                        )}
                      >
                        {checked && <Check className="size-3" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-sunken px-1 py-px text-[10px] font-medium text-fg-muted">
                            {r.kindLabel}
                          </span>
                          {r.meta && <span className="truncate text-[10.5px] text-fg-subtle">{r.meta}</span>}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[12px] font-medium text-fg">{r.title}</p>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
            <Button
              type="button"
              size="sm"
              className="mt-2.5 w-full"
              disabled={selectedRefIds.size === 0}
              onClick={insertSelectedRefs}
            >
              <Sparkles className="size-3.5" />
              選択した {selectedRefIds.size} 件を本文に挿入
            </Button>
          </div>

          {/* 右：エディタ & 出力先 */}
          <form onSubmit={handleCreateNotion} className="thin-scroll flex flex-col gap-3 overflow-y-auto p-5">
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-fg-muted">タイトル</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例: ○○機能の設計メモ / 障害振り返り"
                className="h-9 w-full rounded-lg border border-line bg-sunken px-3 text-[13.5px] text-fg outline-none focus:border-accent"
              />
            </div>

            <div className="flex flex-1 flex-col">
              <label className="mb-1 block text-[11.5px] font-medium text-fg-muted">
                本文（Markdown 形式：<code className="rounded bg-sunken px-1"># 見出し</code> /{' '}
                <code className="rounded bg-sunken px-1">- 箇条書き</code> に対応）
              </label>
              <textarea
                rows={11}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="左からタスク・PR を選んで挿入するか、直接入力してください..."
                className="min-h-[220px] flex-1 rounded-lg border border-line bg-sunken p-3 font-mono text-[12.5px] leading-relaxed text-fg outline-none focus:border-accent"
              />
            </div>

            {settings.notion ? (
              <div>
                <label className="mb-1 block text-[11.5px] font-medium text-fg-muted">Notion 保存先（親ページ / データベース）</label>
                {notionParents.length > 0 ? (
                  <select
                    value={parentId}
                    onChange={(e) => setParentId(e.target.value)}
                    className="h-9 w-full rounded-lg border border-line bg-sunken px-2.5 text-[12.5px] text-fg outline-none focus:border-accent"
                  >
                    {notionParents.map((p) => (
                      <option key={p.id} value={p.rawId}>
                        [{p.objectType === 'database' ? 'DB' : 'ページ'}] {p.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-[11.5px] text-fg-subtle">
                    Notion 上でインテグレーションにアクセス許可されたページ/データベースが見つかりません。先にナレッジの「更新」を試してください。
                  </p>
                )}
              </div>
            ) : (
              <p className="rounded-lg border border-line bg-sunken/50 px-3 py-2 text-[11.5px] text-fg-muted">
                Notion へ直接保存するには設定画面で Notion を連携してください。未連携でも Markdown コピーや Google ドキュメントへ出力できます。
              </p>
            )}

            {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</p>}

            {createdDoc && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-[12.5px]">
                <span className="text-fg">Notion に「{createdDoc.title}」を作成しました。</span>
                {createdDoc.url && (
                  <Button type="button" size="sm" onClick={() => openExternal(createdDoc.url)}>
                    <ExternalLink className="size-3.5" />
                    Notion で開く
                  </Button>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" onClick={() => void copyMarkdown()}>
                  {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                  {copied ? 'コピーしました' : 'Markdown をコピー'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    void copyMarkdown().then(() => openExternal('https://docs.new'))
                  }}
                >
                  <ExternalLink className="size-3.5" />
                  コピーして Google ドキュメント作成
                </Button>
              </div>
              <div className="flex items-center gap-2">
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
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
