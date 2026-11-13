import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlarmClock, CheckCheck, CircleCheck, Inbox, Info, Keyboard, Search, X } from 'lucide-react'
import { routes, type InboxStatus, type Message } from '@omni-desk/contracts'
import type { FeatureContext } from '@omni-desk/contracts/feature'
import {
  actions,
  useAppStore,
  useInbox,
  useNow,
  useSlackEmoji,
  type InboxPeriod,
  type SourceFilter
} from '@omni-desk/client'
import { formatDayHeading, previewText, startOfDay } from '@omni-desk/message-kit'
import { Button, cn, EmptyState, ErrorNotice, IconButton, PageHeader, Segmented, SkeletonList } from '@omni-desk/ui'
import { filterInbox, isFiltering, type InboxFilter } from './filter'
import { InboxRow } from './InboxRow'
import { Toast } from './Toast'
import { useInboxKeyboard } from './useInboxKeyboard'

const TABS: InboxStatus[] = ['open', 'snoozed', 'done']
const PAGE = 150

const SHORTCUTS: [string, string][] = [
  ['J / K', '次・前のメッセージ'],
  ['E', '対応済みにする'],
  ['U', '未対応に戻す'],
  ['S', 'あとで（1〜4 で時刻を選ぶ）'],
  ['R', '返信する（⌘ Enter で送信）'],
  ['O / Enter', '会話を開く'],
  ['Z', '直前の操作を元に戻す'],
  ['/', '検索'],
  ['1 / 2 / 3', '未対応・あとで・対応済み'],
  ['Esc', '閉じる']
]

function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute top-full right-0 z-40 mt-2 w-72 rounded-xl border border-line bg-panel p-3 shadow-pop">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12.5px] font-semibold">キーボード操作</p>
        <IconButton label="閉じる" onClick={onClose} className="size-6">
          <X className="size-3.5" />
        </IconButton>
      </div>
      <dl className="space-y-1">
        {SHORTCUTS.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between text-[12px]">
            <dt className="text-fg-muted">{label}</dt>
            <dd>
              <kbd className="rounded border border-line bg-sunken px-1.5 py-px text-[11px] text-fg-muted">{key}</kbd>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/**
 * 受信箱。自分宛てメッセージを「未対応 / あとで / 対応済み」で仕分ける。
 * 状態の正はメインプロセス（PC に保存）。操作は先に画面へ反映し、元に戻すこともできる。
 */
export function InboxView({ navigate }: FeatureContext) {
  const inbox = useInbox()
  const now = useNow(30_000)
  const emoji = useSlackEmoji()
  const ui = useAppStore((s) => s.ui)
  const slackAuth = useAppStore((s) => s.settings?.slack?.authType)
  const [helpOpen, setHelpOpen] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const searchRef = useRef<HTMLInputElement>(null)

  const filter: InboxFilter = { status: ui.inboxStatus, source: ui.inboxFilter, period: ui.inboxPeriod, query: ui.inboxQuery }
  const toText = useCallback((m: Message) => previewText(m, emoji), [emoji])
  const list = useMemo(
    () => filterInbox(inbox.entries, filter, now, toText),
    // filter はプリミティブの組なので個別に依存させる
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inbox.entries, filter.status, filter.source, filter.period, filter.query, now, toText]
  )
  const visible = useMemo(() => list.slice(0, limit), [list, limit])
  const selectedId = ui.inboxSelected
  const selectedIndex = visible.findIndex((e) => e.message.id === selectedId)

  // 選択中の項目が一覧から消えたら（対応済みにした等）、同じ位置の項目を選ぶ
  const lastIndex = useRef(0)
  useEffect(() => {
    if (selectedIndex >= 0) {
      lastIndex.current = selectedIndex
      return
    }
    const fallback = visible[Math.min(lastIndex.current, visible.length - 1)]?.message.id ?? null
    if (fallback !== selectedId) actions.setUi({ inboxSelected: fallback })
  }, [selectedIndex, selectedId, visible])

  // タブや絞り込みを変えたら表示件数を戻す
  useEffect(() => setLimit(PAGE), [filter.status, filter.source, filter.period, filter.query])

  const selected = selectedIndex >= 0 ? visible[selectedIndex] : undefined
  const select = useCallback((id: string) => {
    actions.setUi({ inboxSelected: id, inboxSnoozeFor: null })
    actions.closeReply()
  }, [])
  const move = (delta: number): void => {
    const target = visible[Math.max(0, Math.min(visible.length - 1, (selectedIndex < 0 ? -1 : selectedIndex) + delta))]
    if (target) select(target.message.id)
  }
  const openConversation = useCallback(
    (m: Message) => navigate(routes.conversations(m.source, m.conversationId)),
    [navigate]
  )

  useInboxKeyboard({
    next: () => move(1),
    prev: () => move(-1),
    done: () => {
      if (!selected) return
      if (selected.status === 'done') void actions.setInboxStatus([selected.message], 'open', undefined, '未対応に戻しました')
      else void actions.setInboxStatus([selected.message], 'done', undefined, '対応済みにしました')
    },
    reopen: () => selected && selected.status !== 'open' && void actions.setInboxStatus([selected.message], 'open', undefined, '未対応に戻しました'),
    snooze: () => selected && actions.setUi({ inboxSnoozeFor: selected.message.id }),
    reply: () => selected && actions.openReply(selected.message.id),
    open: () => selected && openConversation(selected.message),
    undo: () => void actions.undoInbox(),
    focusSearch: () => searchRef.current?.focus(),
    switchTab: (i) => actions.setUi({ inboxStatus: TABS[i] }),
    toggleHelp: () => setHelpOpen((v) => !v),
    escape: () => {
      setHelpOpen(false)
      actions.setUi({ inboxSnoozeFor: null })
      actions.closeReply()
    }
  })

  const groups = useMemo(() => {
    // 未対応・対応済みは日付ごとに見出しを付ける（あとでは解除が近い順なので付けない）
    if (filter.status === 'snoozed') return [{ key: 'all', label: null as string | null, items: visible }]
    const out: { key: string; label: string | null; items: typeof visible }[] = []
    for (const e of visible) {
      const day = startOfDay(filter.status === 'done' ? (e.state?.updatedAt ?? e.message.createdAt) : e.message.createdAt)
      const last = out[out.length - 1]
      if (last?.key === String(day)) last.items.push(e)
      else out.push({ key: String(day), label: formatDayHeading(day, now), items: [e] })
    }
    return out
  }, [visible, filter.status, now])

  const filtering = isFiltering(filter)
  const errors = inbox.sources.filter((s) => s.error && (filter.source === 'all' || filter.source === s.source))

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="受信箱"
        subtitle="あなた宛てのメッセージを、未対応・あとで・対応済みで仕分けます"
        actions={
          <div className="relative">
            <Button size="sm" variant="ghost" onClick={() => setHelpOpen((v) => !v)}>
              <Keyboard className="size-3.5" />
              ショートカット
            </Button>
            {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <Segmented<InboxStatus>
            value={ui.inboxStatus}
            onChange={(inboxStatus) => actions.setUi({ inboxStatus })}
            options={[
              { value: 'open', label: <><Inbox className="size-3.5" />未対応</>, count: inbox.counts.open },
              { value: 'snoozed', label: <><AlarmClock className="size-3.5" />あとで</>, count: inbox.counts.snoozed },
              { value: 'done', label: <><CircleCheck className="size-3.5" />対応済み</>, count: inbox.counts.done }
            ]}
          />
          <label className="flex h-8 min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 text-fg-subtle focus-within:border-accent">
            <Search className="size-3.5 shrink-0" />
            <input
              ref={searchRef}
              value={ui.inboxQuery}
              onChange={(e) => actions.setUi({ inboxQuery: e.target.value })}
              placeholder="送信者・ルーム・本文で検索"
              className="w-full bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-subtle"
            />
            {ui.inboxQuery ? (
              <button onClick={() => actions.setUi({ inboxQuery: '' })} className="text-fg-subtle hover:text-fg" title="検索をクリア">
                <X className="size-3.5" />
              </button>
            ) : (
              <kbd className="rounded border border-line bg-sunken px-1 text-[10px]">/</kbd>
            )}
          </label>
          <Segmented<SourceFilter>
            size="sm"
            value={ui.inboxFilter}
            onChange={(inboxFilter) => actions.setUi({ inboxFilter })}
            options={[
              { value: 'all', label: 'すべて' },
              { value: 'slack', label: 'Slack' },
              { value: 'chatwork', label: 'Chatwork' }
            ]}
          />
          <select
            value={ui.inboxPeriod}
            onChange={(e) => actions.setUi({ inboxPeriod: e.target.value as InboxPeriod })}
            className="h-8 rounded-lg border border-line bg-panel px-2 text-[12.5px] outline-none focus:border-accent"
          >
            <option value="all">全期間</option>
            <option value="today">今日</option>
            <option value="7d">7 日以内</option>
            <option value="30d">30 日以内</option>
          </select>
        </div>
      </PageHeader>

      <div className="thin-scroll relative flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[920px] px-6 py-4">
          {errors.length > 0 && (
            <div className="mb-3 space-y-2">
              {errors.map((s) => (
                <ErrorNotice key={s.source} error={s.error!} source={s.source} onRetry={s.refetch} onOpenSettings={() => navigate(routes.settings())} />
              ))}
            </div>
          )}
          {slackAuth === 'user' && filter.source !== 'chatwork' && (
            <p className="mb-3 flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
              <Info className="size-3.5" />
              Slack はユーザートークン方式のため、メンションのみ表示しています（DM と既読状態はブラウザセッション方式で取得できます）
            </p>
          )}

          {/* 一覧の上の情報行：件数と一括操作 */}
          {list.length > 0 && (
            <div className="mb-2 flex items-center justify-between px-1 text-[12px] text-fg-subtle">
              <span>
                {filtering ? `${list.length} 件が一致` : `${list.length} 件`}
                {inbox.hiddenCount > 0 && ` · 非表示の送信者 ${inbox.hiddenCount} 件を除く`}
              </span>
              {filter.status === 'open' && list.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void actions.setInboxStatus(
                      list.map((e) => e.message),
                      'done',
                      undefined,
                      `${list.length} 件を対応済みにしました`
                    )
                  }
                >
                  <CheckCheck className="size-3.5" />
                  {filtering ? '一致した' : '表示中の'} {list.length} 件を対応済みに
                </Button>
              )}
            </div>
          )}

          {inbox.isLoading && inbox.entries.length === 0 ? (
            <div className="card p-4">
              <SkeletonList rows={6} />
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              icon={filter.status === 'done' ? <CircleCheck className="size-5" /> : filter.status === 'snoozed' ? <AlarmClock className="size-5" /> : <Inbox className="size-5" />}
              title={
                filtering
                  ? '条件に一致するメッセージはありません'
                  : filter.status === 'open'
                    ? '未対応のメッセージはありません'
                    : filter.status === 'snoozed'
                      ? 'あとでにしたメッセージはありません'
                      : '対応済みのメッセージはありません'
              }
              description={!filtering && filter.status === 'open' ? 'お疲れさまでした！新しい自分宛てが届くとここに表示されます。' : undefined}
              action={
                filtering ? (
                  <Button onClick={() => actions.setUi({ inboxQuery: '', inboxFilter: 'all', inboxPeriod: 'all' })}>条件をクリア</Button>
                ) : undefined
              }
            />
          ) : (
            <div className="card overflow-hidden">
              {groups.map((g) => (
                <section key={g.key}>
                  {g.label && (
                    <h3 className="sticky top-0 z-10 border-b border-line bg-sunken/95 px-5 py-1 text-[11.5px] font-semibold text-fg-muted backdrop-blur">
                      {filter.status === 'done' ? `${g.label}に対応` : g.label}
                    </h3>
                  )}
                  {g.items.map((e) => (
                    <InboxRow
                      key={e.message.id}
                      entry={e}
                      now={now}
                      selected={e.message.id === selectedId}
                      onSelect={select}
                      onOpenConversation={openConversation}
                    />
                  ))}
                </section>
              ))}
              {list.length > visible.length && (
                <button
                  onClick={() => setLimit((n) => n + PAGE)}
                  className="w-full py-3 text-[12.5px] font-medium text-accent-text hover:bg-hover"
                >
                  さらに表示（残り {list.length - visible.length} 件）
                </button>
              )}
            </div>
          )}
          <p className={cn('py-4 text-center text-[11px] text-fg-subtle', list.length === 0 && 'hidden')}>
            J / K で移動、E で対応済み、S であとで、R で返信。<button className="underline" onClick={() => setHelpOpen(true)}>すべての操作</button>
          </p>
        </div>
      </div>
      <Toast />
    </div>
  )
}
