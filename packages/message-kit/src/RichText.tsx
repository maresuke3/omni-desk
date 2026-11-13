import { Fragment, useMemo, type ReactNode } from 'react'
import { CircleCheck, Paperclip, Quote } from 'lucide-react'
import type { SlackEmojiMap, TextFormat } from '@omni-desk/contracts'
import { parseChatwork, replaceEmoticons, type CwNode } from './chatwork-markup'
import { cn } from '@omni-desk/ui'
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
  return <div className={cn('rich selectable', className)}>{content}</div>
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
  return <span className="whitespace-pre-wrap">{parts}</span>
}

function MentionChip({ label, self, tone = 'accent' }: { label: ReactNode; self?: boolean; tone?: 'accent' | 'muted' }) {
  return (
    <span
      className={cn(
        'mx-px inline-flex items-center rounded px-1 py-px text-[0.92em] font-medium leading-tight',
        self ? 'bg-mention text-mention-fg' : tone === 'accent' ? 'bg-accent-soft text-accent-text' : 'bg-hover text-fg-muted'
      )}
    >
      {label}
    </span>
  )
}

// ------------------------------------------------------------ slack

function renderSlack(blocks: SlackBlock[], emoji?: SlackEmojiMap): ReactNode {
  return blocks.map((b, i) => {
    if (b.t === 'pre') return <pre key={i}>{b.v}</pre>
    if (b.t === 'quote') return <blockquote key={i}>{renderSlackInline(b.c, emoji)}</blockquote>
    return (
      <p key={i} className="my-0 [&+p]:mt-1.5">
        {renderSlackInline(b.c, emoji)}
      </p>
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
        return <strong key={i} className="font-semibold">{renderSlackInline(n.c, emoji)}</strong>
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
  if (!resolved) return <span className="text-fg-subtle">:{name}:</span>
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
        return <hr key={i} className="my-2 border-line" />
      case 'code':
        return <pre key={i}>{n.v}</pre>
      case 'title':
        return (
          <div key={i} className="mb-1 font-semibold text-fg">
            {renderChatwork(n.c)}
          </div>
        )
      case 'info':
        return (
          <div key={i} className="my-1.5 rounded-lg border border-line bg-sunken px-3 py-2">
            {renderChatwork(n.c)}
          </div>
        )
      case 'quote':
        return (
          <blockquote key={i}>
            <div className="mb-0.5 flex items-center gap-1 text-[11px] text-fg-subtle">
              <Quote className="size-3" />
              引用{n.time ? ` · ${formatMessageTime(n.time)}` : ''}
            </div>
            {renderChatwork(n.c)}
          </blockquote>
        )
      case 'task':
        return (
          <div key={i} className="my-1.5 flex gap-2 rounded-lg border border-line bg-sunken px-3 py-2">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
            <div className="min-w-0">{renderChatwork(n.c)}</div>
          </div>
        )
      case 'file':
        return (
          <span
            key={i}
            className="my-0.5 mr-1 inline-flex items-center gap-1.5 rounded-md border border-line bg-sunken px-2 py-1 text-[12px] text-fg-muted"
          >
            <Paperclip className="size-3.5" />
            {n.name}
          </span>
        )
    }
  })
}
