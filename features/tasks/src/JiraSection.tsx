import { useMemo, useState } from 'react'
import { MessageSquarePlus, Plus, Ticket } from 'lucide-react'
import { actions, openExternal, useAsyncAction, useKnowledge } from '@omni-desk/client'
import type { JiraIssue } from '@omni-desk/contracts'
import { formatMessageTime } from '@omni-desk/message-kit'
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography
} from '@omni-desk/ui'

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
    <Card
      component="form"
      sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}
      onSubmit={(e: React.FormEvent) => {
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
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="body1" sx={{ fontWeight: 600 }}>
          新しい Jira チケットを作成
        </Typography>
        <Button size="sm" variant="ghost" onClick={onClose}>
          閉じる
        </Button>
      </Stack>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr 3fr' } }}>
        <TextField select label="プロジェクト" value={selected} onChange={(e) => setSelected(e.target.value)} fullWidth>
          {projects.map((p) => (
            <MenuItem key={p.key} value={p.key}>
              {p.name !== p.key ? `${p.key} — ${p.name}` : p.key}
            </MenuItem>
          ))}
          <MenuItem value="__custom__">その他のプロジェクト…</MenuItem>
        </TextField>
        <TextField select label="種別" value={selectedType} onChange={(e) => setSelectedType(e.target.value)} fullWidth>
          {issueTypeOptions.map((t) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
          <MenuItem value="__custom__">その他…</MenuItem>
        </TextField>
        <TextField
          label="件名（必須）"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="件名（必須）"
          fullWidth
        />
      </Box>

      {(selected === '__custom__' || selectedType === '__custom__') && (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
          {selected === '__custom__' && (
            <TextField
              value={customKey}
              onChange={(e) => setCustomKey(e.target.value.toUpperCase())}
              placeholder="プロジェクトキー（例: OMNI）"
              fullWidth
            />
          )}
          {selectedType === '__custom__' && (
            <TextField
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              placeholder="チケットタイプ名（例: Incident）"
              fullWidth
            />
          )}
        </Box>
      )}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' } }}>
        <TextField
          select
          label="担当者"
          value={assigneeMode}
          onChange={(e) => setAssigneeMode(e.target.value as typeof assigneeMode)}
          fullWidth
        >
          <MenuItem value="">未割り当て</MenuItem>
          <MenuItem value="@me">自分（@me）</MenuItem>
          <MenuItem value="default">プロジェクト既定</MenuItem>
          <MenuItem value="__custom__">メール / ID を指定…</MenuItem>
        </TextField>
        <TextField
          label="ラベル"
          value={labelsText}
          onChange={(e) => setLabelsText(e.target.value)}
          placeholder="bug,cli"
          fullWidth
        />
        <TextField
          label={isSubtask ? '親チケットキー（必須）' : '親チケット / Epic キー（任意）'}
          value={parent}
          onChange={(e) => setParent(e.target.value.toUpperCase())}
          placeholder="例: OMNI-101"
          error={isSubtask && !parent.trim()}
          fullWidth
        />
      </Box>

      {assigneeMode === '__custom__' && (
        <TextField
          value={customAssignee}
          onChange={(e) => setCustomAssignee(e.target.value)}
          placeholder="担当者のメールアドレスまたは Atlassian Account ID"
          fullWidth
        />
      )}

      <TextField
        multiline
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={DESCRIPTION_PLACEHOLDERS[issueType] ?? '詳細説明（任意）'}
        fullWidth
      />

      <Box>
        <Button size="sm" variant="ghost" onClick={() => setShowCustomAttrs((v) => !v)}>
          {showCustomAttrs ? 'カスタムフィールド設定を隠す' : 'カスタムフィールド（additionalAttributes）を指定…'}
        </Button>
        {showCustomAttrs && (
          <TextField
            multiline
            rows={3}
            value={customAttrsJson}
            onChange={(e) => setCustomAttrsJson(e.target.value)}
            placeholder={'{\n  "customfield_10000": { "value": "High" }\n}'}
            fullWidth
            sx={{ mt: 1 }}
          />
        )}
      </Box>

      <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <Button type="submit" variant="primary" size="sm" loading={create.pending} disabled={!canSubmit}>
          作成する
        </Button>
        {(jsonError || create.error) && <Alert severity="error">{jsonError || create.error?.message}</Alert>}
      </Stack>
    </Card>
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
    <Box>
      <Stack direction="row" sx={{ mb: 1, alignItems: 'center', justifyContent: 'space-between', px: 0.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Ticket size={16} />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Jira チケット
          </Typography>
          <Typography variant="caption" color="text.disabled" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {items.length}
          </Typography>
        </Stack>
        {canEdit && onOpenCreate && (
          <Button size="sm" variant="ghost" onClick={onOpenCreate}>
            <Plus size={16} />
            起票
          </Button>
        )}
      </Stack>
      {items.length === 0 ? (
        <Card sx={{ p: 3 }}>
          <EmptyState icon={<Ticket size={24} />} title="該当する Jira チケットはありません" />
        </Card>
      ) : (
        <Card sx={{ overflow: 'hidden' }}>
          <Stack divider={<Divider />}>
            {items.map((issue) => {
              const expanded = activeKey === issue.key
              const statusColor =
                issue.statusCategory === 'done' ? 'success' : issue.statusCategory === 'in_progress' ? 'primary' : 'default'
              return (
                <Box key={issue.key} sx={{ px: 2, py: 2 }}>
                  <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => issue.url && openExternal(issue.url)}
                        >
                          {issue.key}
                        </Button>
                        {issue.issueType && <Chip size="small" label={issue.issueType} />}
                        <Chip size="small" color={statusColor} variant="outlined" label={issue.status} />
                        {issue.priority && (
                          <Typography variant="caption" color="text.disabled">
                            {issue.priority}
                          </Typography>
                        )}
                      </Stack>
                      <Typography variant="body1" sx={{ mt: 0.5, fontWeight: 500 }}>
                        {issue.summary}
                      </Typography>
                      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
                        {issue.assignee ? `担当: ${issue.assignee.name} · ` : ''}
                        {formatMessageTime(issue.updatedAt)}
                      </Typography>
                    </Box>
                    {canEdit && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setActiveKey(expanded ? null : issue.key)
                          setNextStatus('')
                          setComment('')
                        }}
                      >
                        <MessageSquarePlus size={16} />
                        操作
                      </Button>
                    )}
                  </Stack>

                  {expanded && canEdit && (
                    <Paper
                      variant="outlined"
                      sx={(theme) => ({
                        mt: 2,
                        p: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1.5,
                        bgcolor: theme.palette.mode === 'dark' ? '#12151a' : '#f6f7f9'
                      })}
                    >
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <TextField
                          size="small"
                          value={nextStatus}
                          onChange={(e) => setNextStatus(e.target.value)}
                          placeholder="ステータス変更（例: In Progress / Done）"
                          sx={{ flex: 1 }}
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
                      </Stack>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <TextField
                          size="small"
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="Jira にコメントを投稿..."
                          sx={{ flex: 1 }}
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
                      </Stack>
                      {(updateIssue.error || addComment.error) && (
                        <Alert severity="error">{(updateIssue.error ?? addComment.error)?.message}</Alert>
                      )}
                    </Paper>
                  )}
                </Box>
              )
            })}
          </Stack>
        </Card>
      )}
    </Box>
  )
}
