import { ArrowUpRight, AtSign, Eye, EyeOff, Hash, Lock, MessageCircle, Paperclip, User, Users } from 'lucide-react'
import type { ConversationKind, Message } from '@omni-desk/contracts'
import {
  actions,
  isSenderBlocked,
  openExternal,
  senderOf,
  toBlockedSender,
  useAppStore,
  useAsyncAction,
  useSlackEmoji
} from '@omni-desk/client'
import { Avatar, cn, IconButton } from '@omni-desk/ui'
import { Emoji, RichText } from './RichText'
import { formatMessageTime } from './time'

export function ConversationKindIcon({ kind, className }: { kind: ConversationKind; className?: string }) {
  const cls = cn('size-3.5 shrink-0', className)
  if (kind === 'private') return <Lock className={cls} />
  if (kind === 'dm') return <User className={cls} />
  if (kind === 'group') return <Users className={cls} />
  if (kind === 'my') return <AtSign className={cls} />
  return <Hash className={cls} />
}

/** 添付ファイル・リアクション・スレッドの返信数 */
export function MessageExtras({ message }: { message: Message }) {
  const emoji = useSlackEmoji()
  const hasExtras = message.reactions?.length || message.files?.length || message.replyCount
  if (!hasExtras) return null
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {message.files?.map((f, i) => (
        <span
          key={`f${i}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-sunken px-2 py-0.5 text-[12px] text-fg-muted"
        >
          <Paperclip className="size-3.5" />
          {f.name}
        </span>
      ))}
      {message.reactions?.map((r) => (
        <span
          key={r.name}
          className="inline-flex h-6 items-center gap-1 rounded-full border border-line bg-sunken px-2 text-[12px]"
        >
          <Emoji name={r.name} map={emoji} />
          <span className="tabular-nums text-fg-muted">{r.count}</span>
        </span>
      ))}
      {!!message.replyCount && (
        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-accent-text">
          <MessageCircle className="size-3.5" />
          {message.replyCount}件の返信
        </span>
      )}
    </div>
  )
}

/** 自分の投稿か（自分の投稿には非表示・返信の操作を出さない） */
export function useIsOwn(message: Message): boolean {
  return useAppStore((s) => {
    const identity = s.settings?.identity
    const myId = message.source === 'slack' ? identity?.slackUserId : identity?.chatworkAccountId
    return message.author.id === myId
  })
}

/** 送信者を受信箱で非表示にする（登録済みなら解除する）ボタン */
export function HideSenderButton({ message }: { message: Message }) {
  const hidden = useAppStore((s) => isSenderBlocked(s.settings?.blockedSenders, senderOf(message)))
  const toggle = useAsyncAction(() =>
    hidden ? actions.unblockSender(senderOf(message)) : actions.blockSender(toBlockedSender(message))
  )
  const label = hidden ? '受信箱での非表示を解除' : 'この送信者を受信箱で非表示'
  return (
    <IconButton
      label={toggle.error ? `${label}（失敗しました：${toggle.error.message}）` : label}
      onClick={() => void toggle.run()}
      disabled={toggle.pending}
      className={cn(toggle.error && 'text-danger')}
    >
      {hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
    </IconButton>
  )
}

/**
 * 会話ビュー用のチャット表示。同じ人の連投はまとめる。
 * 非表示にした送信者でもここでは通常どおり表示する（ホバー操作で受信箱からの除外だけを切り替える）。
 */
export function ChatMessage({ message, compact }: { message: Message; compact: boolean }) {
  const own = useIsOwn(message)
  return (
    <div
      className={cn(
        'group relative flex gap-3 px-6 transition-colors hover:bg-hover/60',
        compact ? 'py-0.5' : 'pt-2.5 pb-0.5',
        message.isMention && 'bg-mention/50 hover:bg-mention/70 shadow-[inset_3px_0_0_var(--color-warning)]'
      )}
    >
      <div className="w-9 shrink-0">
        {compact ? (
          <span className="block pt-0.5 text-right text-[10px] text-fg-subtle opacity-0 group-hover:opacity-100">
            {new Date(message.createdAt).toLocaleTimeString('ja-JP', { hour: 'numeric', minute: '2-digit' })}
          </span>
        ) : (
          <Avatar name={message.author.name} url={message.author.avatarUrl} size={36} />
        )}
      </div>
      <div className="min-w-0 flex-1 pb-1">
        {!compact && (
          <div className="flex items-baseline gap-2">
            <span className="font-semibold">{message.author.name}</span>
            <span className="text-[11.5px] text-fg-subtle">{formatMessageTime(message.createdAt)}</span>
            {message.editedAt && <span className="text-[11px] text-fg-subtle">（編集済み）</span>}
            {message.isUnread && <span className="size-1.5 self-center rounded-full bg-accent" />}
          </div>
        )}
        <RichText text={message.text} format={message.format} className="leading-relaxed" />
        <MessageExtras message={message} />
      </div>
      {(!own || message.permalink) && (
        <div className="absolute top-1.5 right-4 hidden items-center rounded-md border border-line bg-panel shadow-card group-hover:flex">
          {/*
           * TODO(reply-per-message): メッセージごとの返信（要望があれば実装する）
           * - ここに返信ボタンを置き、押したら会話画面下部の入力欄（features/conversations の ReplyComposer）に返信先をセットする
           * - 返信先は toReplyTarget(message) で作れる。送信は actions.send(key, { ..., replyTo }) で対応済み
           * - Chatwork は返信タグ付き、Slack はスレッドへの返信になる（connectors/slack/src/sync.ts の resolveThreadTs）
           * - 入力欄に「返信先」を表示するため、ui に会話ごとの返信先（例: replyTargets[conversationKey]）を持たせる
           */}
          {!own && <HideSenderButton message={message} />}
          {message.permalink && (
            <IconButton label="元のメッセージを開く" onClick={() => openExternal(message.permalink)}>
              <ArrowUpRight className="size-4" />
            </IconButton>
          )}
        </div>
      )}
    </div>
  )
}
