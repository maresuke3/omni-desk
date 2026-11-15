import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Archive,
  ExternalLink,
  Mail,
  MailOpen,
  PenSquare,
  RefreshCw,
  Reply,
  Search,
  Star,
  X
} from 'lucide-react'
import { actions, openExternal, useMail, useSettings } from '@omni-desk/client'
import { routes, type MailAccountInfo, type MailMessage } from '@omni-desk/contracts'
import type { FeatureContext } from '@omni-desk/contracts/feature'
import { formatMessageTime } from '@omni-desk/message-kit'
import { Button, EmptyState, ErrorNotice, PageHeader, Segmented, SkeletonList, cn } from '@omni-desk/ui'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-xl border border-line bg-panel p-5 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-fg">{form.isReply ? '返信を作成' : '新規メールを作成'}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-fg-subtle hover:bg-hover hover:text-fg">
            <X className="size-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {accounts.length > 0 && (
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-fg-muted">送信元アカウント</label>
              <select
                value={form.accountId}
                onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
                className="h-9 w-full rounded-lg border border-line bg-sunken px-2.5 text-[13px] text-fg outline-none focus:border-accent"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.label ? `${acc.label} (${acc.email})` : acc.email}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-fg-muted">宛先（To）</label>
              <input
                required
                value={form.to}
                onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}
                placeholder="recipient@example.com"
                className="h-9 w-full rounded-lg border border-line bg-sunken px-2.5 text-[13px] text-fg outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-fg-muted">CC（任意）</label>
              <input
                value={form.cc}
                onChange={(e) => setForm((f) => ({ ...f, cc: e.target.value }))}
                placeholder="cc@example.com"
                className="h-9 w-full rounded-lg border border-line bg-sunken px-2.5 text-[13px] text-fg outline-none focus:border-accent"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-fg-muted">件名</label>
            <input
              required
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="件名を入力"
              className="h-9 w-full rounded-lg border border-line bg-sunken px-2.5 text-[13px] text-fg outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-fg-muted">本文</label>
            <textarea
              required
              rows={7}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="メッセージを入力..."
              className="w-full rounded-lg border border-line bg-sunken p-2.5 text-[13px] leading-relaxed text-fg outline-none focus:border-accent"
            />
          </div>
          {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
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
          </div>
        </form>
      </div>
    </div>
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
    <div className="flex h-full flex-col">
      <PageHeader
        title="メール"
        subtitle="接続済みメールアドレスの受信トレイを集約表示します（データはメモリ上のみ保持）"
        actions={
          <div className="flex items-center gap-2">
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
                <PenSquare className="size-3.5" />
                新規作成
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => actions.refreshMail(queryInput.trim() || undefined)}
              loading={mail.loading}
            >
              <RefreshCw className="size-3.5" />
              更新
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2.5">
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
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="h-8 rounded-lg border border-line bg-panel px-2.5 text-[12.5px] text-fg outline-none focus:border-accent"
            >
              <option value="all">すべてのアカウント ({accounts.length})</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.label ? `${acc.label} (${acc.email})` : acc.email}
                </option>
              ))}
            </select>
          )}
          <form
            className="flex h-8 min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 text-fg-subtle focus-within:border-accent"
            onSubmit={(e) => {
              e.preventDefault()
              actions.refreshMail(queryInput.trim() || undefined)
            }}
          >
            <Search className="size-3.5 shrink-0" />
            <input
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="件名・送信者・本文を検索（Enter でサーバー検索）"
              className="w-full bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-subtle"
            />
          </form>
        </div>
      </PageHeader>

      {mail.error && (
        <div className="px-7 pt-4">
          <ErrorNotice error={mail.error} onOpenSettings={() => navigate(routes.settings())} />
        </div>
      )}

      {!hasAccounts && !settings.demoActive ? (
        <div className="flex-1 p-7">
          <EmptyState
            icon={<Mail className="size-6" />}
            title="メールアカウントが未接続です"
            description="設定画面から Google (Gmail) アカウントを接続してください。複数のメールアドレスを追加できます。"
            action={
              <Button variant="primary" onClick={() => navigate(routes.settings())}>
                設定を開く
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
          {/* 左：メール一覧 */}
          <div className="thin-scroll overflow-y-auto border-r border-line">
            {mail.loading && mail.messages.length === 0 ? (
              <div className="p-4">
                <SkeletonList rows={6} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6">
                <EmptyState icon={<Mail className="size-5" />} title="該当するメールはありません" />
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {filtered.map((m) => {
                  const isSelected = selected?.id === m.id
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(m.id)}
                        className={cn(
                          'flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-hover/60',
                          isSelected && 'bg-accent/10'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            {m.isUnread && <span className="size-2 shrink-0 rounded-full bg-accent" />}
                            <span className={cn('truncate text-[12.5px]', m.isUnread ? 'font-semibold text-fg' : 'text-fg-muted')}>
                              {m.from.name || m.from.email || '(送信者不明)'}
                            </span>
                            {m.isStarred && <Star className="size-3 shrink-0 fill-warning text-warning" />}
                          </div>
                          <span className="shrink-0 text-[11px] text-fg-subtle tabular-nums">
                            {formatMessageTime(m.receivedAt)}
                          </span>
                        </div>
                        <p className={cn('truncate text-[13px]', m.isUnread ? 'font-semibold text-fg' : 'font-medium text-fg')}>
                          {m.subject}
                        </p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="line-clamp-1 text-[11.5px] text-fg-subtle">{m.snippet}</p>
                          {accounts.length > 1 && (
                            <span className="shrink-0 rounded bg-sunken px-1.5 py-px text-[10px] text-fg-muted">
                              {m.accountEmail.split('@')[0]}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* 右：メール本文プレビュー */}
          <div className="thin-scroll overflow-y-auto p-6">
            {selected ? (
              <div className="mx-auto max-w-3xl space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[17px] font-semibold text-fg">{selected.subject}</h2>
                    <div className="mt-2 space-y-0.5 text-[12px] text-fg-muted">
                      <p>
                        <span className="text-fg-subtle">差出人: </span>
                        <span className="font-medium text-fg">
                          {selected.from.name ? `${selected.from.name} <${selected.from.email}>` : selected.from.email}
                        </span>
                      </p>
                      {selected.to.length > 0 && (
                        <p className="truncate">
                          <span className="text-fg-subtle">宛先: </span>
                          {selected.to.join(', ')}
                        </p>
                      )}
                      <p>
                        <span className="text-fg-subtle">受信アカウント: </span>
                        {selected.accountEmail} · {formatMessageTime(selected.receivedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
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
                        <Reply className="size-3.5" />
                        返信
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => void actions.setMailUnread(selected.accountId, selected.externalId, !selected.isUnread)}
                    >
                      <MailOpen className="size-3.5" />
                      {selected.isUnread ? '既読にする' : '未読にする'}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void actions.archiveMail(selected.accountId, selected.externalId)}
                    >
                      <Archive className="size-3.5" />
                      アーカイブ
                    </Button>
                    {selected.webUrl && (
                      <Button size="sm" onClick={() => openExternal(selected.webUrl!)}>
                        <ExternalLink className="size-3.5" />
                        Gmail で開く
                      </Button>
                    )}
                  </div>
                </div>

                {loadingBodyId === selected.id && selected.bodyText === undefined ? (
                  <SkeletonList rows={4} />
                ) : (
                  <div className="whitespace-pre-wrap rounded-xl border border-line bg-panel p-5 text-[13.5px] leading-relaxed text-fg">
                    {selected.bodyText || selected.snippet || '（本文はありません）'}
                  </div>
                )}
              </div>
            ) : (
              <EmptyState icon={<Mail className="size-6" />} title="メールを選択してください" />
            )}
          </div>
        </div>
      )}

      {compose && <ComposeModal accounts={accounts} initial={compose} onClose={() => setCompose(null)} />}
    </div>
  )
}
