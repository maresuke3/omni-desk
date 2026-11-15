import { useMemo, useState } from 'react'
import { MessageSquarePlus, Plus, Ticket } from 'lucide-react'
import { actions, openExternal, useAsyncAction, useKnowledge } from '@omni-desk/client'
import type { JiraIssue } from '@omni-desk/contracts'
import { formatMessageTime } from '@omni-desk/message-kit'
import { Button, EmptyState, cn } from '@omni-desk/ui'

const JIRA_CATEGORY_STYLE: Record<JiraIssue['statusCategory'], string> = {
  todo: 'bg-sunken text-fg-muted',
  in_progress: 'bg-accent/15 text-accent-text',
  done: 'bg-success-soft text-success'
}

const DEFAULT_ISSUE_TYPES = ['Task', 'Story', 'Bug', 'Epic', 'Sub-task'] as const

const DESCRIPTION_PLACEHOLDERS: Record<string, string> = {
  Bug: '再現手順・期待する挙動・実際の挙動を記入',
  Story: 'ユーザーストーリー（誰が・何を・なぜ）と受け入れ条件',
  Epic: 'Epic の目的・対象スコープ・関連マイルストーン',
  'Sub-task': '親チケットに紐づく作業内容・完了条件'
}

export function CreateJiraPanel({ onClose }: { onClose: () => void }) {
  const { jiraProjects = [], jiraIssues } = useKnowledge()
  const projects = useMemo(() => {
    if (jiraProjects.length > 0) return jiraProjects
    const keys = [...new Set(jiraIssues.map((i) => i.projectKey).filter(Boolean))]
    return keys.map((key) => ({ key, name: key }))
  }, [jiraProjects, jiraIssues])

  const [selected, setSelected] = useState(() => projects[0]?.key ?? '__custom__')
  const [customKey, setCustomKey] = useState('')
  const projectKey = selected === '__custom__' ? customKey.trim() : selected

  const issueTypeOptions = useMemo(() => {
    const proj = projects.find((p) => p.key === projectKey)
    const fromProject =
      'issueTypes' in (proj ?? {}) && Array.isArray((proj as { issueTypes?: string[] }).issueTypes)
        ? (proj as { issueTypes?: string[] }).issueTypes!
        : []
    const fromIssues = jiraIssues
      .filter((i) => !projectKey || i.projectKey === projectKey)
      .map((i) => i.issueType)
      .filter((t): t is string => Boolean(t))
    return [...new Set([...fromProject, ...fromIssues, ...DEFAULT_ISSUE_TYPES])]
  }, [projects, jiraIssues, projectKey])

  const [selectedType, setSelectedType] = useState<string>('Task')
  const [customType, setCustomType] = useState('')
  const issueType = selectedType === '__custom__' ? customType.trim() : selectedType

  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [assigneeMode, setAssigneeMode] = useState<'' | '@me' | 'default' | '__custom__'>('')
  const [customAssignee, setCustomAssignee] = useState('')
  const [labelsText, setLabelsText] = useState('')
  const [parent, setParent] = useState('')
  const [showCustomAttrs, setShowCustomAttrs] = useState(false)
  const [customAttrsJson, setCustomAttrsJson] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const create = useAsyncAction(actions.createJiraIssue)

  const isSubtask = issueType.toLowerCase() === 'sub-task' || issueType.toLowerCase() === 'subtask'
  const assignee = assigneeMode === '__custom__' ? customAssignee.trim() : assigneeMode
  const canSubmit = Boolean(projectKey && issueType && summary.trim() && (!isSubtask || parent.trim()))

  return (
    <form
      className="card space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSubmit) return
        setJsonError(null)
        let additionalAttributes: Record<string, unknown> | undefined
        if (customAttrsJson.trim()) {
          try {
            const parsed = JSON.parse(customAttrsJson)
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
              setJsonError('カスタム属性は JSON オブジェクト形式で入力してください')
              return
            }
            additionalAttributes = parsed as Record<string, unknown>
          } catch {
            setJsonError('カスタム属性の JSON 形式が正しくありません')
            return
          }
        }
        const labels = labelsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)

        void create
          .run({
            projectKey,
            issueType,
            summary,
            description,
            assignee: assignee || undefined,
            labels: labels.length ? labels : undefined,
            parent: parent.trim() || undefined,
            additionalAttributes
          })
          .then((res) => {
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
      <div className="grid gap-3 sm:grid-cols-6">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="h-9 rounded-lg border border-line bg-sunken px-3 text-[12.5px] outline-none focus:border-accent focus:bg-panel sm:col-span-2"
        >
          {projects.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name !== p.key ? `${p.key} — ${p.name}` : p.key}
            </option>
          ))}
          <option value="__custom__">その他のプロジェクト…</option>
        </select>
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="h-9 rounded-lg border border-line bg-sunken px-3 text-[12.5px] outline-none focus:border-accent focus:bg-panel sm:col-span-1"
        >
          {issueTypeOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          <option value="__custom__">その他…</option>
        </select>
        <input
          type="text"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="件名（必須）"
          className="h-9 rounded-lg border border-line bg-sunken px-3 text-[12.5px] outline-none focus:border-accent focus:bg-panel sm:col-span-3"
        />
      </div>
      {(selected === '__custom__' || selectedType === '__custom__') && (
        <div className="grid gap-3 sm:grid-cols-2">
          {selected === '__custom__' && (
            <input
              type="text"
              value={customKey}
              onChange={(e) => setCustomKey(e.target.value.toUpperCase())}
              placeholder="プロジェクトキー（例: OMNI）"
              className="h-9 rounded-lg border border-line bg-sunken px-3 text-[12.5px] outline-none focus:border-accent focus:bg-panel"
            />
          )}
          {selectedType === '__custom__' && (
            <input
              type="text"
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              placeholder="チケットタイプ名（大文字小文字区別、例: Incident）"
              className="h-9 rounded-lg border border-line bg-sunken px-3 text-[12.5px] outline-none focus:border-accent focus:bg-panel"
            />
          )}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <select
          value={assigneeMode}
          onChange={(e) => setAssigneeMode(e.target.value as typeof assigneeMode)}
          className="h-9 rounded-lg border border-line bg-sunken px-3 text-[12.5px] outline-none focus:border-accent focus:bg-panel"
        >
          <option value="">担当者: 未割り当て</option>
          <option value="@me">担当者: 自分（@me）</option>
          <option value="default">担当者: プロジェクト既定</option>
          <option value="__custom__">担当者: メール / ID を指定…</option>
        </select>
        <input
          type="text"
          value={labelsText}
          onChange={(e) => setLabelsText(e.target.value)}
          placeholder="ラベル（カンマ区切り、例: bug,cli）"
          className="h-9 rounded-lg border border-line bg-sunken px-3 text-[12.5px] outline-none focus:border-accent focus:bg-panel"
        />
        <input
          type="text"
          value={parent}
          onChange={(e) => setParent(e.target.value.toUpperCase())}
          placeholder={isSubtask ? '親チケットキー（Sub-task は必須、例: OMNI-101）' : '親チケット / Epic キー（任意）'}
          className={cn(
            'h-9 rounded-lg border bg-sunken px-3 text-[12.5px] outline-none focus:border-accent focus:bg-panel',
            isSubtask && !parent.trim() ? 'border-warning' : 'border-line'
          )}
        />
      </div>
      {assigneeMode === '__custom__' && (
        <input
          type="text"
          value={customAssignee}
          onChange={(e) => setCustomAssignee(e.target.value)}
          placeholder="担当者のメールアドレスまたは Atlassian Account ID"
          className="h-9 w-full rounded-lg border border-line bg-sunken px-3 text-[12.5px] outline-none focus:border-accent focus:bg-panel"
        />
      )}
      <textarea
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={DESCRIPTION_PLACEHOLDERS[issueType] ?? '詳細説明（任意）'}
        className="w-full rounded-lg border border-line bg-sunken p-3 text-[12.5px] outline-none focus:border-accent focus:bg-panel"
      />
      <div>
        <button
          type="button"
          onClick={() => setShowCustomAttrs((v) => !v)}
          className="text-[11.5px] text-fg-subtle hover:text-fg"
        >
          {showCustomAttrs ? 'カスタムフィールド設定を隠す' : 'カスタムフィールド（additionalAttributes）を指定…'}
        </button>
        {showCustomAttrs && (
          <textarea
            rows={3}
            value={customAttrsJson}
            onChange={(e) => setCustomAttrsJson(e.target.value)}
            placeholder={'{\n  "customfield_10000": { "value": "High" }\n}'}
            className="mt-2 w-full rounded-lg border border-line bg-sunken p-3 font-mono text-[12px] outline-none focus:border-accent focus:bg-panel"
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" size="sm" loading={create.pending} disabled={!canSubmit}>
          作成する
        </Button>
        {(jsonError || create.error) && (
          <span className="text-[12px] text-danger">{jsonError || create.error?.message}</span>
        )}
      </div>
    </form>
  )
}

export function JiraSection({
  items,
  canEdit,
  onOpenCreate
}: {
  items: JiraIssue[]
  canEdit: boolean
  onOpenCreate?: () => void
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [nextStatus, setNextStatus] = useState('')
  const [comment, setComment] = useState('')
  const updateIssue = useAsyncAction(actions.updateJiraIssue)
  const addComment = useAsyncAction(actions.addJiraComment)

  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Ticket className="size-4 text-accent-text" />
          <h3 className="text-[12.5px] font-semibold text-fg">Jira チケット</h3>
          <span className="text-[11.5px] text-fg-subtle tabular-nums">{items.length}</span>
        </div>
        {canEdit && onOpenCreate && (
          <button
            type="button"
            onClick={onOpenCreate}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-accent-text hover:underline"
          >
            <Plus className="size-3.5" />
            起票
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="card p-6">
          <EmptyState icon={<Ticket className="size-5" />} title="該当する Jira チケットはありません" />
        </div>
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {items.map((issue) => {
            const expanded = activeKey === issue.key
            return (
              <div key={issue.key} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                      <button
                        type="button"
                        onClick={() => issue.url && openExternal(issue.url)}
                        className="font-mono font-semibold text-accent-text hover:underline"
                      >
                        {issue.key}
                      </button>
                      {issue.issueType && (
                        <span className="rounded bg-sunken px-1.5 py-px text-fg-muted">{issue.issueType}</span>
                      )}
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
                      <p className="text-[11.5px] text-danger">{(updateIssue.error ?? addComment.error)?.message}</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
