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
import { Avatar, Box, Button, Chip, SourceMark, Stack, Tooltip, Typography } from '@omni-desk/ui'
import { SnoozeMenu } from './SnoozeMenu'
import { formatUntil } from './snooze'

function Kbd({ children }: { children: string }) {
  return (
    <Box
      component="kbd"
      sx={(theme) => ({
        ml: 0.5,
        px: '4px',
        borderRadius: '4px',
        border: `1px solid ${theme.palette.divider}`,
        fontSize: '11px',
        fontFamily: 'inherit',
        color: 'text.secondary'
      })}
    >
      {children}
    </Box>
  )
}

function StatusBadge({ entry, now }: { entry: InboxEntry; now: number }) {
  if (entry.status === 'snoozed' && entry.state?.until) {
    return (
      <Chip
        size="small"
        color="warning"
        variant="outlined"
        icon={<AlarmClock size={12} />}
        label={`${formatUntil(entry.state.until, now)} まで`}
      />
    )
  }
  if (entry.status === 'done') {
    return (
      <Chip
        size="small"
        color="success"
        variant="outlined"
        icon={<CircleCheck size={12} />}
        label={entry.state?.reason === 'replied' ? '返信済み' : '対応済み'}
      />
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

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const setStatus = (status: 'open' | 'done'): void => {
    void actions.setInboxStatus([message], status, undefined, status === 'done' ? '対応済みにしました' : '未対応に戻しました')
  }

  return (
    <Box
      ref={ref}
      data-inbox-row={message.id}
      onClick={() => !selected && onSelect(message.id)}
      sx={(theme) => ({
        position: 'relative',
        borderBottom: `1px solid ${theme.palette.divider}`,
        transition: 'background-color 120ms',
        bgcolor: selected ? theme.palette.background.paper : 'transparent',
        boxShadow: selected ? `inset 3px 0 0 ${theme.palette.primary.main}` : 'none',
        cursor: selected ? 'default' : 'pointer',
        ...(selected
          ? {}
          : {
              contentVisibility: 'auto',
              containIntrinsicSize: 'auto 64px',
              '&:hover': { bgcolor: theme.palette.action.hover }
            })
      })}
    >
      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', px: 3, py: 2 }}>
        <Tooltip title={message.isUnread ? '未読' : ''}>
          <Box
            component="span"
            sx={{
              mt: 1.5,
              width: 8,
              height: 8,
              flexShrink: 0,
              borderRadius: '50%',
              bgcolor: message.isUnread ? 'primary.main' : 'transparent'
            }}
          />
        </Tooltip>
        <Avatar name={message.author.name} url={message.author.avatarUrl} size={32} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography
              variant="body1"
              sx={{
                fontWeight: message.isUnread ? 700 : 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {message.author.name}
            </Typography>
            <Stack direction="row" spacing={0.5} sx={{ minWidth: 0, alignItems: 'center', color: 'text.disabled' }}>
              <SourceMark source={message.source} size="xs" />
              <ConversationKindIcon kind={message.conversationKind} />
              <Typography variant="caption" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {message.conversationName}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ ml: 'auto !important', flexShrink: 0, alignItems: 'center' }}>
              <StatusBadge entry={entry} now={now} />
              <Typography variant="caption" color="text.disabled" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatShortTime(message.createdAt, now)}
              </Typography>
            </Stack>
          </Stack>
          {!selected && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {preview}
            </Typography>
          )}

          {selected && (
            <Box sx={{ mt: 1 }} onClick={(e) => e.stopPropagation()}>
              <RichText text={message.text} format={message.format} />
              <MessageExtras message={message} />

              <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', alignItems: 'center', rowGap: 1 }}>
                {entry.status === 'done' ? (
                  <Button size="sm" onClick={() => setStatus('open')}>
                    <RotateCcw size={16} />
                    未対応に戻す
                    <Kbd>U</Kbd>
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => setStatus('done')}>
                    <CircleCheck size={16} />
                    対応済み
                    <Kbd>E</Kbd>
                  </Button>
                )}
                <Button size="sm" onClick={() => actions.setUi({ inboxSnoozeFor: snoozeOpen ? null : message.id })}>
                  <AlarmClock size={16} />
                  {entry.status === 'snoozed' ? 'あとでを変更' : 'あとで'}
                  <Kbd>S</Kbd>
                </Button>
                <Button size="sm" onClick={() => actions.openReply(message.id)}>
                  <Reply size={16} />
                  {replyLabel(message)}
                  <Kbd>R</Kbd>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onOpenConversation(message)}>
                  <MessagesSquare size={16} />
                  会話を開く
                  <Kbd>O</Kbd>
                </Button>
                <Stack direction="row" spacing={0.5} sx={{ ml: 'auto !important', alignItems: 'center' }}>
                  <HideSenderButton message={message} />
                  {message.permalink && (
                    <Button size="sm" variant="ghost" onClick={() => openExternal(message.permalink)} title="元のメッセージを開く">
                      <ArrowUpRight size={16} />
                    </Button>
                  )}
                </Stack>
              </Stack>

              {snoozeOpen && <SnoozeMenu message={message} now={now} />}

              {replying && (
                <Box sx={{ mt: 2 }}>
                  <ReplyComposer
                    composerKey={`reply:${message.id}`}
                    target={{ source: message.source, conversationId: message.conversationId, replyTo: toReplyTarget(message) }}
                    header={
                      <>
                        <strong>{message.author.name}</strong> さんへ{replyLabel(message)}
                        <span>（送信すると対応済みになります）</span>
                      </>
                    }
                    placeholder="返信を入力"
                    autoFocus
                    onSent={actions.closeReply}
                    onCancel={actions.closeReply}
                  />
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Stack>
    </Box>
  )
})
