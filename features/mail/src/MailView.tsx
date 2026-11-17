import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Archive, ExternalLink, Mail, MailOpen, PenSquare, RefreshCw, Reply, Search, Star } from 'lucide-react'
import { actions, openExternal, useMail, useSettings } from '@omni-desk/client'
import { routes, type MailAccountInfo, type MailMessage } from '@omni-desk/contracts'
import type { FeatureContext } from '@omni-desk/contracts/feature'
import { formatMessageTime } from '@omni-desk/message-kit'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  EmptyState,
  ErrorNotice,
  InputAdornment,
  ListItemButton,
  MenuItem,
  PageHeader,
  Paper,
  Segmented,
  SkeletonList,
  Stack,
  TextField,
  Typography
} from '@omni-desk/ui'

type MailFilter = 'all' | 'unread' | 'starred'

interface ComposeDraft {
  accountId: string
  to: string
  cc: string
  subject: string
  body: string
  threadId?: string
  inReplyTo?: string
  isReply?: boolean
}

function ComposeModal({
  accounts,
  initial,
  onClose
}: {
  accounts: MailAccountInfo[]
  initial: ComposeDraft
  onClose: () => void
}) {
  const [form, setForm] = useState<ComposeDraft>(initial)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.accountId || !form.to.trim() || !form.subject.trim() || !form.body.trim()) return
    setPending(true)
    setError(null)
    try {
      await actions.sendMail({
        accountId: form.accountId,
        to: form.to.trim(),
        cc: form.cc.trim() || undefined,
        subject: form.subject.trim(),
        body: form.body,
        threadId: form.threadId,
        inReplyTo: form.inReplyTo
      })
      onClose()
      actions.refreshMail()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>{form.isReply ? '返信を作成' : '新規メールを作成'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {accounts.length > 0 && (
              <TextField
                select
                label="送信元アカウント"
                value={form.accountId}
                onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
                fullWidth
              >
                {accounts.map((acc) => (
                  <MenuItem key={acc.id} value={acc.id}>
                    {acc.label ? `${acc.label} (${acc.email})` : acc.email}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <TextField
                required
                label="宛先（To）"
                value={form.to}
                onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}
                placeholder="recipient@example.com"
                fullWidth
              />
              <TextField
                label="CC（任意）"
                value={form.cc}
                onChange={(e) => setForm((f) => ({ ...f, cc: e.target.value }))}
                placeholder="cc@example.com"
                fullWidth
              />
            </Box>
            <TextField
              required
              label="件名"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="件名を入力"
              fullWidth
            />
            <TextField
              required
              multiline
              rows={7}
              label="本文"
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="メッセージを入力..."
              fullWidth
            />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" size="sm" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            type="submit"
            size="sm"
            variant="primary"
            loading={pending}
            disabled={!form.accountId || !form.to.trim() || !form.subject.trim() || !form.body.trim()}
          >
            送信
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export function MailView({ navigate }: FeatureContext) {
  const settings = useSettings()
  const mail = useMail()
  const accounts = settings.mailAccounts ?? []

  const [accountFilter, setAccountFilter] = useState<string>('all')
  const [filter, setFilter] = useState<MailFilter>('all')
  const [queryInput, setQueryInput] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadingBodyId, setLoadingBodyId] = useState<string | null>(null)
  const [compose, setCompose] = useState<ComposeDraft | null>(null)

  const filtered = useMemo(() => {
    const q = queryInput.trim().toLowerCase()
    return mail.messages.filter((m) => {
      if (accountFilter !== 'all' && m.accountId !== accountFilter) return false
      if (filter === 'unread' && !m.isUnread) return false
      if (filter === 'starred' && !m.isStarred) return false
      if (!q) return true
      return (
        m.subject.toLowerCase().includes(q) ||
        (m.from.name?.toLowerCase().includes(q) ?? false) ||
        m.from.email.toLowerCase().includes(q) ||
        m.snippet.toLowerCase().includes(q)
      )
    })
  }, [mail.messages, accountFilter, filter, queryInput])

  const selected: MailMessage | null = useMemo(
    () => filtered.find((m) => m.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId]
  )

  useEffect(() => {
    if (!selected || selected.bodyText !== undefined) return
    let cancelled = false
    setLoadingBodyId(selected.id)
    void actions
      .getMailBody(selected.accountId, selected.externalId)
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingBodyId((cur) => (cur === selected.id ? null : cur))
      })
    return () => {
      cancelled = true
    }
  }, [selected])

  const hasAccounts = accounts.length > 0
  const unreadCount = mail.messages.filter((m) => m.isUnread).length

  return (
    <Stack sx={{ height: '100%' }}>
      <PageHeader
        title="メール"
        subtitle="接続済みメールアドレスの受信トレイを集約表示します（データはメモリ上のみ保持）"
        actions={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            {hasAccounts && (
              <Button
                size="sm"
                variant="primary"
                onClick={() =>
                  setCompose({
                    accountId: accounts[0].id,
                    to: '',
                    cc: '',
                    subject: '',
                    body: ''
                  })
                }
              >
                <PenSquare size={16} />
                新規作成
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => actions.refreshMail(queryInput.trim() || undefined)}
              loading={mail.loading}
            >
              <RefreshCw size={16} />
              更新
            </Button>
          </Stack>
        }
      >
        <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', alignItems: 'center', rowGap: 1 }}>
          <Segmented<MailFilter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'すべて', count: mail.messages.length },
              { value: 'unread', label: '未読', count: unreadCount },
              { value: 'starred', label: 'スター付き' }
            ]}
          />
          {accounts.length > 1 && (
            <TextField
              select
              size="small"
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              sx={{ minWidth: 200 }}
            >
              <MenuItem value="all">すべてのアカウント ({accounts.length})</MenuItem>
              {accounts.map((acc) => (
                <MenuItem key={acc.id} value={acc.id}>
                  {acc.label ? `${acc.label} (${acc.email})` : acc.email}
                </MenuItem>
              ))}
            </TextField>
          )}
          <Box
            component="form"
            sx={{ minWidth: 224, flex: 1 }}
            onSubmit={(e) => {
              e.preventDefault()
              actions.refreshMail(queryInput.trim() || undefined)
            }}
          >
            <TextField
              fullWidth
              size="small"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="件名・送信者・本文を検索（Enter でサーバー検索）"
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
          </Box>
        </Stack>
      </PageHeader>

      {mail.error && (
        <Box sx={{ px: 3, pt: 2 }}>
          <ErrorNotice error={mail.error} onOpenSettings={() => navigate(routes.settings())} />
        </Box>
      )}

      {!hasAccounts && !settings.demoActive ? (
        <Box sx={{ flex: 1, p: 3 }}>
          <EmptyState
            icon={<Mail size={24} />}
            title="メールアカウントが未接続です"
            description="設定画面から Google (Gmail) アカウントを接続してください。複数のメールアドレスを追加できます。"
            action={
              <Button variant="primary" onClick={() => navigate(routes.settings())}>
                設定を開く
              </Button>
            }
          />
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            minHeight: 0,
            flex: 1,
            gridTemplateColumns: { xs: '1fr', lg: '360px minmax(0, 1fr)' }
          }}
        >
          <Box sx={(theme) => ({ overflowY: 'auto', borderRight: `1px solid ${theme.palette.divider}` })}>
            {mail.loading && mail.messages.length === 0 ? (
              <Box sx={{ p: 2 }}>
                <SkeletonList rows={6} />
              </Box>
            ) : filtered.length === 0 ? (
              <Box sx={{ p: 3 }}>
                <EmptyState icon={<Mail size={24} />} title="該当するメールはありません" />
              </Box>
            ) : (
              <Stack divider={<Divider />}>
                {filtered.map((m) => {
                  const isSelected = selected?.id === m.id
                  return (
                    <ListItemButton
                      key={m.id}
                      selected={isSelected}
                      onClick={() => setSelectedId(m.id)}
                      sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 0.5, px: 2, py: 2 }}
                    >
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                        <Stack direction="row" spacing={1} sx={{ minWidth: 0, alignItems: 'center' }}>
                          {m.isUnread && (
                            <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0 }} />
                          )}
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: m.isUnread ? 600 : 400,
                              color: m.isUnread ? 'text.primary' : 'text.secondary',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {m.from.name || m.from.email || '(送信者不明)'}
                          </Typography>
                          {m.isStarred && <Star size={12} color="#b86e00" />}
                        </Stack>
                        <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                          {formatMessageTime(m.receivedAt)}
                        </Typography>
                      </Stack>
                      <Typography
                        variant="body1"
                        sx={{
                          fontWeight: m.isUnread ? 600 : 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {m.subject}
                      </Typography>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography
                          variant="caption"
                          color="text.disabled"
                          sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {m.snippet}
                        </Typography>
                        {accounts.length > 1 && <Chip size="small" label={m.accountEmail.split('@')[0]} />}
                      </Stack>
                    </ListItemButton>
                  )
                })}
              </Stack>
            )}
          </Box>

          <Box sx={{ overflowY: 'auto', p: 3 }}>
            {selected ? (
              <Stack spacing={2} sx={{ mx: 'auto', maxWidth: 768 }}>
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
                    <Typography variant="h2" sx={{ fontSize: '16px', fontWeight: 600 }}>
                      {selected.subject}
                    </Typography>
                    <Stack spacing={0.5} sx={{ mt: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        <Box component="span" sx={{ color: 'text.disabled' }}>
                          差出人:{' '}
                        </Box>
                        <Box component="span" sx={{ fontWeight: 500, color: 'text.primary' }}>
                          {selected.from.name ? `${selected.from.name} <${selected.from.email}>` : selected.from.email}
                        </Box>
                      </Typography>
                      {selected.to.length > 0 && (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          <Box component="span" sx={{ color: 'text.disabled' }}>
                            宛先:{' '}
                          </Box>
                          {selected.to.join(', ')}
                        </Typography>
                      )}
                      <Typography variant="body2" color="text.secondary">
                        <Box component="span" sx={{ color: 'text.disabled' }}>
                          受信アカウント:{' '}
                        </Box>
                        {selected.accountEmail} · {formatMessageTime(selected.receivedAt)}
                      </Typography>
                    </Stack>
                  </Box>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                    {hasAccounts && (
                      <Button
                        size="sm"
                        onClick={() =>
                          setCompose({
                            accountId: selected.accountId,
                            to: selected.from.email,
                            cc: '',
                            subject: selected.subject.startsWith('Re:') ? selected.subject : `Re: ${selected.subject}`,
                            body: '',
                            threadId: selected.threadId,
                            isReply: true
                          })
                        }
                      >
                        <Reply size={16} />
                        返信
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => void actions.setMailUnread(selected.accountId, selected.externalId, !selected.isUnread)}
                    >
                      <MailOpen size={16} />
                      {selected.isUnread ? '既読にする' : '未読にする'}
                    </Button>
                    <Button size="sm" onClick={() => void actions.archiveMail(selected.accountId, selected.externalId)}>
                      <Archive size={16} />
                      アーカイブ
                    </Button>
                    {selected.webUrl && (
                      <Button size="sm" onClick={() => openExternal(selected.webUrl!)}>
                        <ExternalLink size={16} />
                        Gmail で開く
                      </Button>
                    )}
                  </Stack>
                </Stack>

                {loadingBodyId === selected.id && selected.bodyText === undefined ? (
                  <SkeletonList rows={4} />
                ) : (
                  <Paper variant="outlined" sx={{ p: 3 }}>
                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                      {selected.bodyText || selected.snippet || '（本文はありません）'}
                    </Typography>
                  </Paper>
                )}
              </Stack>
            ) : (
              <EmptyState icon={<Mail size={24} />} title="メールを選択してください" />
            )}
          </Box>
        </Box>
      )}

      {compose && <ComposeModal accounts={accounts} initial={compose} onClose={() => setCompose(null)} />}
    </Stack>
  )
}
