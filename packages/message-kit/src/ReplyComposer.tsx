import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CircleAlert, CornerDownRight, SendHorizontal, X } from 'lucide-react'
import type { Message, ReplyTarget, SendMessageInput } from '@omni-desk/contracts'
import { actions, isMac, useComposer } from '@omni-desk/client'
import { Box, Button, IconButton, Paper, Stack, TextField, Typography } from '@omni-desk/ui'

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
    <Paper
      variant="outlined"
      sx={(theme) => ({
        borderRadius: 1.5,
        borderColor: outbox?.status === 'failed' ? theme.palette.error.main : theme.palette.divider,
        boxShadow: variant === 'inline' ? '0 1px 2px rgba(16, 24, 40, 0.06)' : 'none',
        '&:focus-within': {
          borderColor: theme.palette.primary.main
        }
      })}
    >
      {header && (
        <Stack
          direction="row"
          spacing={1}
          sx={(theme) => ({
            alignItems: 'center',
            borderBottom: `1px solid ${theme.palette.divider}`,
            px: 2,
            py: 1
          })}
        >
          <CornerDownRight size={16} />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {header}
          </Typography>
          {onCancel && (
            <IconButton label="閉じる" onClick={onCancel}>
              <X size={16} />
            </IconButton>
          )}
        </Stack>
      )}
      <Box sx={{ px: 2, pt: 1 }}>
        <TextField
          inputRef={ref}
          multiline
          minRows={1}
          maxRows={6}
          fullWidth
          variant="standard"
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
          slotProps={{
            input: {
              disableUnderline: true,
              sx: { fontSize: '16px', lineHeight: 1.5, py: 0.5 }
            }
          }}
        />
      </Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 2, pb: 1, pt: 1 }}>
        {outbox?.status === 'failed' ? (
          <Stack direction="row" spacing={0.5} sx={{ minWidth: 0, flex: 1, alignItems: 'center', color: 'error.main' }}>
            <CircleAlert size={16} />
            <Typography
              variant="caption"
              sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              送信できませんでした：{outbox.error}
            </Typography>
          </Stack>
        ) : justSent ? (
          <Typography variant="caption" color="success.main" sx={{ flex: 1 }}>
            送信しました
          </Typography>
        ) : (
          <Typography variant="caption" color="text.disabled" sx={{ flex: 1 }}>
            {shortcutLabel()}
          </Typography>
        )}
        <Button size="sm" variant="primary" loading={sending} disabled={!text.trim()} onClick={() => void submit()}>
          <SendHorizontal size={16} />
          {outbox?.status === 'failed' ? '再送信' : '送信'}
        </Button>
      </Stack>
    </Paper>
  )
}
