import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { CircleAlert, CornerDownRight, SendHorizontal, X } from 'lucide-react'
import type { Message, ReplyTarget, SendMessageInput } from '@omni-desk/contracts'
import { actions, isMac, useComposer } from '@omni-desk/client'
import { Button, cn, IconButton } from '@omni-desk/ui'

/** メッセージから返信先を作る（Chatwork は返信タグ、Slack はスレッドの指定に使う） */
export function toReplyTarget(message: Message): ReplyTarget {
  return {
    messageId: message.nativeId,
    authorId: message.author.id,
    authorName: message.author.name,
    threadId: message.threadId
  }
}

/** 返信の表示名（Slack のチャンネルではスレッドへの返信になる） */
export function replyLabel(message: Message): string {
  if (message.source === 'slack' && message.conversationKind !== 'dm' && message.conversationKind !== 'group') {
    return 'スレッドに返信'
  }
  return '返信'
}

const shortcutLabel = (): string => (isMac() ? '⌘ Enter で送信' : 'Ctrl + Enter で送信')

/**
 * 返信・投稿の入力欄。下書きと送信状態は中央ストア（drafts / outbox）に置くので、
 * 画面を切り替えても下書きは残り、同じ入力欄からの二重送信も防げる。
 *
 * - Enter は改行、⌘/Ctrl + Enter で送信（日本語入力の変換確定中は送信しない）
 */
export function ReplyComposer({
  composerKey,
  target,
  placeholder,
  header,
  autoFocus,
  onSent,
  onCancel,
  variant = 'inline'
}: {
  composerKey: string
  target: Omit<SendMessageInput, 'text'>
  placeholder: string
  /** 入力欄の上に出す補足（返信先など） */
  header?: ReactNode
  autoFocus?: boolean
  onSent?: () => void
  onCancel?: () => void
  variant?: 'inline' | 'footer'
}) {
  const { text, setText, outbox, sentAt } = useComposer(composerKey)
  const ref = useRef<HTMLTextAreaElement>(null)
  const sending = outbox?.status === 'sending'
  const [justSent, setJustSent] = useState(false)

  // 内容に合わせて高さを伸ばす（最大 8 行程度）
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [text])

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    if (!sentAt || Date.now() - sentAt > 3_000) return
    setJustSent(true)
    const timer = setTimeout(() => setJustSent(false), 3_000)
    return () => clearTimeout(timer)
  }, [sentAt])

  const submit = async (): Promise<void> => {
    if (!text.trim() || sending) return
    const ok = await actions.send(composerKey, { ...target, text })
    if (ok) onSent?.()
  }

  return (
    <div
      className={cn(
        'rounded-xl border bg-panel transition-colors focus-within:border-accent',
        outbox?.status === 'failed' ? 'border-danger/40' : 'border-line',
        variant === 'inline' && 'shadow-card'
      )}
    >
      {header && (
        <div className="flex items-center gap-1.5 border-b border-line px-3 py-1.5 text-[11.5px] text-fg-muted">
          <CornerDownRight className="size-3.5 text-fg-subtle" />
          <span className="min-w-0 flex-1 truncate">{header}</span>
          {onCancel && (
            <IconButton label="閉じる" onClick={onCancel} className="size-6">
              <X className="size-3.5" />
            </IconButton>
          )}
        </div>
      )}
      <textarea
        ref={ref}
        rows={1}
        value={text}
        disabled={sending}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && onCancel) onCancel()
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
            e.preventDefault()
            void submit()
          }
        }}
        className="selectable block w-full resize-none bg-transparent px-3.5 py-2.5 text-[13px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle disabled:opacity-60"
      />
      <div className="flex items-center gap-2 px-2.5 pb-2">
        {outbox?.status === 'failed' ? (
          <span className="flex min-w-0 flex-1 items-center gap-1 text-[11.5px] text-danger">
            <CircleAlert className="size-3.5 shrink-0" />
            <span className="truncate">送信できませんでした：{outbox.error}</span>
          </span>
        ) : justSent ? (
          <span className="flex-1 text-[11.5px] text-success">送信しました</span>
        ) : (
          <span className="flex-1 text-[11px] text-fg-subtle">{shortcutLabel()}</span>
        )}
        <Button size="sm" variant="primary" loading={sending} disabled={!text.trim()} onClick={() => void submit()}>
          <SendHorizontal className="size-3.5" />
          {outbox?.status === 'failed' ? '再送信' : '送信'}
        </Button>
      </div>
    </div>
  )
}
