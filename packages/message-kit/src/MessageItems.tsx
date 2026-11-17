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
import { Avatar, Box, Chip, IconButton, Paper, Stack, Typography } from '@omni-desk/ui'
import { Emoji, RichText } from './RichText'
import { formatMessageTime } from './time'

export function ConversationKindIcon({ kind }: { kind: ConversationKind; className?: string }) {
  if (kind === 'private') return <Lock size={16} />
  if (kind === 'dm') return <User size={16} />
  if (kind === 'group') return <Users size={16} />
  if (kind === 'my') return <AtSign size={16} />
  return <Hash size={16} />
}

/** 添付ファイル・リアクション・スレッドの返信数 */
export function MessageExtras({ message }: { message: Message }) {
  const emoji = useSlackEmoji()
  const hasExtras = message.reactions?.length || message.files?.length || message.replyCount
  if (!hasExtras) return null
  return (
    <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', alignItems: 'center', rowGap: 1 }}>
      {message.files?.map((f, i) => (
        <Chip
          key={`f${i}`}
          size="small"
          variant="outlined"
          icon={<Paperclip size={12} />}
          label={f.name}
          sx={{ fontSize: '12px', color: 'text.secondary' }}
        />
      ))}
      {message.reactions?.map((r) => (
        <Chip
          key={r.name}
          size="small"
          variant="outlined"
          label={
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <Emoji name={r.name} map={emoji} />
              <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
                {r.count}
              </Box>
            </Stack>
          }
          sx={{ borderRadius: 999, fontSize: '12px' }}
        />
      ))}
      {!!message.replyCount && (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: 'primary.main', fontSize: '12px', fontWeight: 500 }}>
          <MessageCircle size={12} />
          <span>{message.replyCount}件の返信</span>
        </Stack>
      )}
    </Stack>
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
    >
      {hidden ? <Eye size={16} /> : <EyeOff size={16} />}
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
    <Stack
      direction="row"
      spacing={2}
      sx={(theme) => ({
        position: 'relative',
        px: 3,
        py: compact ? 0.5 : 1,
        transition: 'background-color 120ms ease',
        bgcolor: message.isMention
          ? theme.palette.mode === 'dark'
            ? 'rgba(240, 169, 59, 0.1)'
            : 'rgba(255, 246, 214, 0.5)'
          : 'transparent',
        boxShadow: message.isMention ? `inset 3px 0 0 ${theme.palette.warning.main}` : 'none',
        '&:hover': {
          bgcolor: message.isMention
            ? theme.palette.mode === 'dark'
              ? 'rgba(240, 169, 59, 0.16)'
              : 'rgba(255, 246, 214, 0.8)'
            : theme.palette.action.hover
        },
        '&:hover .msg-actions': {
          display: 'flex'
        },
        '&:hover .msg-compact-time': {
          opacity: 1
        }
      })}
    >
      <Box sx={{ width: 32, flexShrink: 0 }}>
        {compact ? (
          <Typography
            className="msg-compact-time"
            variant="caption"
            color="text.disabled"
            sx={{ display: 'block', pt: 0.5, textAlign: 'right', opacity: 0, transition: 'opacity 120ms' }}
          >
            {new Date(message.createdAt).toLocaleTimeString('ja-JP', { hour: 'numeric', minute: '2-digit' })}
          </Typography>
        ) : (
          <Avatar name={message.author.name} url={message.author.avatarUrl} size={32} />
        )}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1, pb: 0.5 }}>
        {!compact && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {message.author.name}
            </Typography>
            <Typography variant="caption" color="text.disabled">
              {formatMessageTime(message.createdAt)}
            </Typography>
            {message.editedAt && (
              <Typography variant="caption" color="text.disabled">
                （編集済み）
              </Typography>
            )}
            {message.isUnread && (
              <Box
                component="span"
                sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main', alignSelf: 'center' }}
              />
            )}
          </Stack>
        )}
        <RichText text={message.text} format={message.format} />
        <MessageExtras message={message} />
      </Box>
      {(!own || message.permalink) && (
        <Paper
          variant="outlined"
          className="msg-actions"
          sx={{
            position: 'absolute',
            top: 8,
            right: 16,
            display: 'none',
            alignItems: 'center',
            borderRadius: 1,
            boxShadow: 1
          }}
        >
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
              <ArrowUpRight size={16} />
            </IconButton>
          )}
        </Paper>
      )}
    </Stack>
  )
}
