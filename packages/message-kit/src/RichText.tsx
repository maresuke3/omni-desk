import { Fragment, useMemo, type ReactNode } from 'react'
import { CircleCheck, Paperclip, Quote } from 'lucide-react'
import type { SlackEmojiMap, TextFormat } from '@omni-desk/contracts'
import { parseChatwork, replaceEmoticons, type CwNode } from './chatwork-markup'
import { Box, Chip, Divider, Paper, Stack, Typography } from '@omni-desk/ui'
import { resolveEmoji } from './emoji'
import { openExternal, useAppStore, useSlackEmoji } from '@omni-desk/client'
import { parseSlack, type SlackBlock, type SlackInline } from './slack-markup'
import { formatMessageTime } from './time'

export function RichText({ text, format, className }: { text: string; format: TextFormat; className?: string }) {
  const identity = useAppStore((s) => s.settings?.identity)
  const emoji = useSlackEmoji()
  const content = useMemo(() => {
    if (format === 'slack') return renderSlack(parseSlack(text, identity?.slackUserId), emoji)
    if (format === 'chatwork') return renderChatwork(parseChatwork(text, identity?.chatworkAccountId))
    return <Linkified text={text} />
  }, [text, format, identity?.slackUserId, identity?.chatworkAccountId, emoji])
  return (
    <Box
      data-selectable
      className={className}
      sx={(theme) => ({
        userSelect: 'text',
        wordBreak: 'break-word',
        fontSize: '16px',
        lineHeight: 1.5,
        '& a': {
          color: theme.palette.primary.main,
          textDecoration: 'underline',
          textUnderlineOffset: '2px'
        },
        '& code': {
          fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
          fontSize: '0.88em',
          bgcolor: theme.palette.mode === 'dark' ? '#12151a' : '#f6f7f9',
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: '4px',
          px: '4px',
          py: '2px'
        },
        '& pre': {
          fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
          fontSize: '12px',
          bgcolor: theme.palette.mode === 'dark' ? '#12151a' : '#f6f7f9',
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 1,
          p: 1.5,
          my: 1,
          overflowX: 'auto',
          whiteSpace: 'pre-wrap'
        },
        '& blockquote': {
          borderLeft: `3px solid ${theme.palette.divider}`,
          pl: 1.5,
          my: 1,
          color: theme.palette.text.secondary
        },
        '& .emoji-img': {
          display: 'inline-block',
          width: 16,
          height: 16,
          verticalAlign: '-0.2em'
        }
      })}
    >
      {content}
    </Box>
  )
}

// ------------------------------------------------------------ common

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (href.startsWith('https://')) openExternal(href)
      }}
      title={href}
    >
      {children}
    </a>
  )
}

const URL_RE = /https?:\/\/[^\s<>"'）」』】]+/g

function Linkified({ text, transform }: { text: string; transform?: (s: string) => string }) {
  const parts: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const index = m.index ?? 0
    if (index > last) parts.push(transform ? transform(text.slice(last, index)) : text.slice(last, index))
    parts.push(
      <ExternalLink key={index} href={m[0]}>
        {m[0]}
      </ExternalLink>
    )
    last = index + m[0].length
  }
  if (last < text.length) parts.push(transform ? transform(text.slice(last)) : text.slice(last))
  return <Box component="span" sx={{ whiteSpace: 'pre-wrap' }}>{parts}</Box>
}

function MentionChip({ label, self, tone = 'accent' }: { label: ReactNode; self?: boolean; tone?: 'accent' | 'muted' }) {
  return (
    <Box
      component="span"
      sx={(theme) => ({
        mx: '2px',
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: '4px',
        px: '4px',
        py: '2px',
        fontSize: '0.9em',
        fontWeight: 500,
        lineHeight: 1.2,
        bgcolor: self
          ? theme.palette.mode === 'dark'
            ? 'rgba(240, 169, 59, 0.2)'
            : '#fff6d6'
          : tone === 'accent'
            ? theme.palette.action.selected
            : theme.palette.action.hover,
        color: self
          ? theme.palette.warning.main
          : tone === 'accent'
            ? theme.palette.primary.main
            : theme.palette.text.secondary
      })}
    >
      {label}
    </Box>
  )
}

// ------------------------------------------------------------ slack

function renderSlack(blocks: SlackBlock[], emoji?: SlackEmojiMap): ReactNode {
  return blocks.map((b, i) => {
    if (b.t === 'pre') return <pre key={i}>{b.v}</pre>
    if (b.t === 'quote') return <blockquote key={i}>{renderSlackInline(b.c, emoji)}</blockquote>
    return (
      <Box component="p" key={i} sx={{ m: 0, '& + p': { mt: 1 } }}>
        {renderSlackInline(b.c, emoji)}
      </Box>
    )
  })
}

function renderSlackInline(nodes: SlackInline[], emoji?: SlackEmojiMap): ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text':
        return <Fragment key={i}>{n.v}</Fragment>
      case 'br':
        return <br key={i} />
      case 'bold':
        return <strong key={i}>{renderSlackInline(n.c, emoji)}</strong>
      case 'italic':
        return <em key={i}>{renderSlackInline(n.c, emoji)}</em>
      case 'strike':
        return <s key={i}>{renderSlackInline(n.c, emoji)}</s>
      case 'code':
        return <code key={i}>{n.v}</code>
      case 'link':
        return (
          <ExternalLink key={i} href={n.href}>
            {n.label}
          </ExternalLink>
        )
      case 'mention':
        return <MentionChip key={i} label={n.label} self={n.self} tone={n.kind === 'channel' ? 'muted' : 'accent'} />
      case 'emoji':
        return <Emoji key={i} name={n.name} map={emoji} />
    }
  })
}

export function Emoji({ name, map }: { name: string; map?: SlackEmojiMap }) {
  const resolved = resolveEmoji(name, map)
  if (!resolved) {
    return (
      <Box component="span" sx={{ color: 'text.disabled' }}>
        :{name}:
      </Box>
    )
  }
  if (resolved.kind === 'image') {
    return <img className="emoji-img" src={resolved.url} alt={`:${name}:`} title={`:${name}:`} draggable={false} />
  }
  return <span title={`:${name}:`}>{resolved.value}</span>
}

// ------------------------------------------------------------ chatwork

function renderChatwork(nodes: CwNode[]): ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text':
        return <Linkified key={i} text={n.v} transform={replaceEmoticons} />
      case 'to':
        return <MentionChip key={i} label="To" self={n.self} />
      case 'reply':
        return <MentionChip key={i} label="返信" self={n.self} />
      case 'toall':
        return <MentionChip key={i} label="To 全員" self />
      case 'person':
        return null
      case 'hr':
        return <Divider key={i} sx={{ my: 1 }} />
      case 'code':
        return <pre key={i}>{n.v}</pre>
      case 'title':
        return (
          <Typography key={i} variant="body1" sx={{ mb: 1, fontWeight: 600 }}>
            {renderChatwork(n.c)}
          </Typography>
        )
      case 'info':
        return (
          <Paper
            key={i}
            variant="outlined"
            sx={(theme) => ({
              my: 1,
              px: 2,
              py: 1,
              bgcolor: theme.palette.mode === 'dark' ? '#12151a' : '#f6f7f9'
            })}
          >
            {renderChatwork(n.c)}
          </Paper>
        )
      case 'quote':
        return (
          <blockquote key={i}>
            <Stack direction="row" spacing={0.5} sx={{ mb: 0.5, alignItems: 'center', color: 'text.disabled', fontSize: '12px' }}>
              <Quote size={12} />
              <span>引用{n.time ? ` · ${formatMessageTime(n.time)}` : ''}</span>
            </Stack>
            {renderChatwork(n.c)}
          </blockquote>
        )
      case 'task':
        return (
          <Paper
            key={i}
            variant="outlined"
            sx={(theme) => ({
              my: 1,
              px: 2,
              py: 1,
              display: 'flex',
              gap: 1,
              bgcolor: theme.palette.mode === 'dark' ? '#12151a' : '#f6f7f9'
            })}
          >
            <CircleCheck size={16} />
            <Box sx={{ minWidth: 0 }}>{renderChatwork(n.c)}</Box>
          </Paper>
        )
      case 'file':
        return (
          <Chip
            key={i}
            size="small"
            variant="outlined"
            icon={<Paperclip size={12} />}
            label={n.name}
            sx={{ my: 0.5, mr: 0.5, fontSize: '12px', color: 'text.secondary' }}
          />
        )
    }
  })
}
