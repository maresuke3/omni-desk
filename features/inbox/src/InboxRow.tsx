import { memo, useEffect, useMemo, useRef } from 'react'
import { AlarmClock, ArrowUpRight, CircleCheck, MessagesSquare, Reply, RotateCcw } from 'lucide-react'
import { actions, openExternal, useAppStore, useSlackEmoji, type InboxEntry } from '@omni-desk/client'
import type { Message } from '@omni-desk/contracts'
import {
  ConversationKindIcon,
  formatShortTime,
  HideSenderButton,
  MessageExtras,
  previewText,
  replyLabel,
  ReplyComposer,
  RichText,
  toReplyTarget
} from '@omni-desk/message-kit'
import { Avatar, Button, cn, SourceMark } from '@omni-desk/ui'
import { SnoozeMenu } from './SnoozeMenu'
import { formatUntil } from './snooze'

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="ml-1 rounded border border-line bg-sunken px-1 font-sans text-[10px] font-medium text-fg-subtle">{children}</kbd>
  )
}

function StatusBadge({ entry, now }: { entry: InboxEntry; now: number }) {
  if (entry.status === 'snoozed' && entry.state?.until) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-warning-soft px-1.5 py-px text-[11px] font-medium text-warning">
        <AlarmClock className="size-3" />
        {formatUntil(entry.state.until, now)} まで
      </span>
    )
  }
  if (entry.status === 'done') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-success-soft px-1.5 py-px text-[11px] font-medium text-success">
        <CircleCheck className="size-3" />
        {entry.state?.reason === 'replied' ? '返信済み' : '対応済み'}
      </span>
    )
  }
  return null
}

/**
 * 受信箱の 1 行。普段は 1 行のプレビューだけを描画し（件数が多くても軽く保つ）、
 * 選択中の行だけ本文・操作・返信欄を展開する。
 */
export const InboxRow = memo(function InboxRow({
  entry,
  selected,
  now,
  onSelect,
  onOpenConversation
}: {
  entry: InboxEntry
  selected: boolean
  now: number
  onSelect: (id: string) => void
  onOpenConversation: (m: Message) => void
}) {
  const { message } = entry
  const emoji = useSlackEmoji()
  const replying = useAppStore((s) => s.activeReply === message.id)
  const snoozeOpen = useAppStore((s) => s.ui.inboxSnoozeFor === message.id)
  const preview = useMemo(() => previewText(message, emoji), [message, emoji])
  const ref = useRef<HTMLDivElement>(null)

  // キーボードで選択が移ったら見える位置までスクロールする
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const setStatus = (status: 'open' | 'done'): void => {
    void actions.setInboxStatus([message], status, undefined, status === 'done' ? '対応済みにしました' : '未対応に戻しました')
  }

  return (
    <div
      ref={ref}
      data-inbox-row={message.id}
      onClick={() => !selected && onSelect(message.id)}
      className={cn(
        'group relative border-b border-line transition-colors',
        // 選択していない行は画面外の描画を省く（件数が多いときの軽量化）。展開中の行には付けない（中身が切れるため）
        selected ? 'bg-panel shadow-[inset_3px_0_0_var(--color-accent)]' : 'cursor-default [content-visibility:auto] [contain-intrinsic-size:auto_64px] hover:bg-hover/60'
      )}
    >
      <div className="flex items-start gap-3 px-5 py-2.5">
        <span className={cn('mt-3 size-1.5 shrink-0 rounded-full', message.isUnread ? 'bg-accent' : 'bg-transparent')} title={message.isUnread ? '未読' : undefined} />
        <Avatar name={message.author.name} url={message.author.avatarUrl} size={30} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('truncate text-[13px]', message.isUnread ? 'font-bold' : 'font-semibold')}>{message.author.name}</span>
            <span className="flex min-w-0 items-center gap-1 text-[11.5px] text-fg-subtle">
              <SourceMark source={message.source} size="xs" />
              <ConversationKindIcon kind={message.conversationKind} className="size-3" />
              <span className="truncate">{message.conversationName}</span>
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-2">
              <StatusBadge entry={entry} now={now} />
              <span className="text-[11.5px] text-fg-subtle tabular-nums">{formatShortTime(message.createdAt, now)}</span>
            </span>
          </div>
          {!selected && <p className="mt-0.5 truncate text-[12.5px] text-fg-muted">{preview}</p>}

          {selected && (
            <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
              <RichText text={message.text} format={message.format} className="text-[13px] leading-relaxed" />
              <MessageExtras message={message} />

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {entry.status === 'done' ? (
                  <Button size="sm" onClick={() => setStatus('open')}>
                    <RotateCcw className="size-3.5" />
                    未対応に戻す
                    <Kbd>U</Kbd>
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => setStatus('done')}>
                    <CircleCheck className="size-3.5" />
                    対応済み
                    <Kbd>E</Kbd>
                  </Button>
                )}
                <Button
                  size="sm"
                  className={cn(snoozeOpen && 'border-accent text-accent-text')}
                  onClick={() => actions.setUi({ inboxSnoozeFor: snoozeOpen ? null : message.id })}
                >
                  <AlarmClock className="size-3.5" />
                  {entry.status === 'snoozed' ? 'あとでを変更' : 'あとで'}
                  <Kbd>S</Kbd>
                </Button>
                <Button size="sm" onClick={() => actions.openReply(message.id)}>
                  <Reply className="size-3.5" />
                  {replyLabel(message)}
                  <Kbd>R</Kbd>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onOpenConversation(message)}>
                  <MessagesSquare className="size-3.5" />
                  会話を開く
                  <Kbd>O</Kbd>
                </Button>
                <span className="ml-auto flex items-center gap-0.5">
                  <HideSenderButton message={message} />
                  {message.permalink && (
                    <Button size="sm" variant="ghost" onClick={() => openExternal(message.permalink)} title="元のメッセージを開く">
                      <ArrowUpRight className="size-3.5" />
                    </Button>
                  )}
                </span>
              </div>

              {snoozeOpen && <SnoozeMenu message={message} now={now} />}

              {replying && (
                <div className="mt-3">
                  <ReplyComposer
                    composerKey={`reply:${message.id}`}
                    target={{ source: message.source, conversationId: message.conversationId, replyTo: toReplyTarget(message) }}
                    header={
                      <>
                        <b className="font-semibold text-fg">{message.author.name}</b> さんへ{replyLabel(message)}
                        <span className="text-fg-subtle">（送信すると対応済みになります）</span>
                      </>
                    }
                    placeholder="返信を入力"
                    autoFocus
                    onSent={actions.closeReply}
                    onCancel={actions.closeReply}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
