/**
 * Slack mrkdwn → 簡易 AST。描画は components/RichText.tsx で行う。
 * https://docs.slack.dev/messaging/formatting-message-text/
 */

export type SlackInline =
  | { t: 'text'; v: string }
  | { t: 'br' }
  | { t: 'bold' | 'italic' | 'strike'; c: SlackInline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; label: string }
  | { t: 'mention'; kind: 'user' | 'channel' | 'broadcast' | 'group'; label: string; self?: boolean }
  | { t: 'emoji'; name: string }

export type SlackBlock =
  | { t: 'para'; c: SlackInline[] }
  | { t: 'quote'; c: SlackInline[] }
  | { t: 'pre'; v: string }

export function decodeEntities(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

export function parseSlack(text: string, selfId?: string): SlackBlock[] {
  const blocks: SlackBlock[] = []
  const segments = text.split('```')
  segments.forEach((segment, i) => {
    if (i % 2 === 1 && i < segments.length - 1) {
      blocks.push({ t: 'pre', v: decodeEntities(segment.replace(/^\n/, '').replace(/\n$/, '')) })
      return
    }
    // 閉じていない ``` はそのまま本文として扱う
    const body = i % 2 === 1 ? '```' + segment : segment
    let para: string[] = []
    let quote: string[] = []
    const flushPara = (): void => {
      if (para.length && para.some((l) => l.trim())) {
        blocks.push({ t: 'para', c: parseInlineLines(trimBlankEdges(para), selfId) })
      }
      para = []
    }
    const flushQuote = (): void => {
      if (quote.length) blocks.push({ t: 'quote', c: parseInlineLines(quote, selfId) })
      quote = []
    }
    for (const line of body.split('\n')) {
      const m = /^(?:&gt;|>)\s?(.*)$/.exec(line)
      if (m) {
        flushPara()
        quote.push(m[1])
      } else {
        flushQuote()
        para.push(line)
      }
    }
    flushPara()
    flushQuote()
  })
  return blocks
}

function trimBlankEdges(lines: string[]): string[] {
  let start = 0
  let end = lines.length
  while (start < end && !lines[start].trim()) start++
  while (end > start && !lines[end - 1].trim()) end--
  return lines.slice(start, end)
}

function parseInlineLines(lines: string[], selfId?: string): SlackInline[] {
  const out: SlackInline[] = []
  lines.forEach((line, i) => {
    if (i > 0) out.push({ t: 'br' })
    out.push(...parseInline(line, selfId))
  })
  return out
}

// 英数字に隣接する記号は装飾として扱わない（snake_case などを誤検出しないため）
const INLINE_RE =
  /<([^<>\n]+)>|`([^`\n]+)`|(?<![A-Za-z0-9*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![A-Za-z0-9*])|(?<![A-Za-z0-9_])_(?=\S)([^_\n]+?)(?<=\S)_(?![A-Za-z0-9_])|(?<![A-Za-z0-9~])~(?=\S)([^~\n]+?)(?<=\S)~(?![A-Za-z0-9~])|:([a-z0-9_+\-']+)(?:::skin-tone-\d)?:/gi

export function parseInline(src: string, selfId?: string): SlackInline[] {
  const out: SlackInline[] = []
  let last = 0
  const pushText = (s: string): void => {
    if (!s) return
    const prev = out[out.length - 1]
    if (prev?.t === 'text') prev.v += decodeEntities(s)
    else out.push({ t: 'text', v: decodeEntities(s) })
  }
  for (const m of src.matchAll(INLINE_RE)) {
    const index = m.index ?? 0
    pushText(src.slice(last, index))
    last = index + m[0].length
    const [, entity, code, bold, italic, strike, emoji] = m
    if (entity !== undefined) out.push(parseEntity(entity, selfId))
    else if (code !== undefined) out.push({ t: 'code', v: decodeEntities(code) })
    else if (bold !== undefined) out.push({ t: 'bold', c: parseInline(bold, selfId) })
    else if (italic !== undefined) out.push({ t: 'italic', c: parseInline(italic, selfId) })
    else if (strike !== undefined) out.push({ t: 'strike', c: parseInline(strike, selfId) })
    else if (emoji !== undefined) out.push({ t: 'emoji', name: emoji.toLowerCase() })
  }
  pushText(src.slice(last))
  return out
}

function parseEntity(body: string, selfId?: string): SlackInline {
  const [target, ...rest] = body.split('|')
  const label = rest.length ? decodeEntities(rest.join('|')) : undefined

  if (target.startsWith('@')) {
    const id = target.slice(1)
    return { t: 'mention', kind: 'user', label: `@${label ?? id}`, self: id === selfId }
  }
  if (target.startsWith('#')) {
    return { t: 'mention', kind: 'channel', label: `#${label ?? target.slice(1)}` }
  }
  if (target.startsWith('!')) {
    const cmd = target.slice(1)
    if (['here', 'channel', 'everyone'].includes(cmd)) {
      return { t: 'mention', kind: 'broadcast', label: `@${cmd}`, self: true }
    }
    if (cmd.startsWith('subteam^')) {
      return { t: 'mention', kind: 'group', label: label ?? '@グループ' }
    }
    if (cmd.startsWith('date^')) return { t: 'text', v: label ?? '' }
    return { t: 'text', v: label ?? cmd }
  }
  const href = decodeEntities(target)
  if (/^(https?:|mailto:)/i.test(href)) return { t: 'link', href, label: label ?? href }
  return { t: 'text', v: label ?? href }
}

/** 一覧表示用のプレーンテキスト */
export function slackToPlain(text: string): string {
  return decodeEntities(
    text
      .replace(/```/g, '')
      .replace(/<([^<>|]+)\|([^<>]+)>/g, (_, target: string, label: string) =>
        target.startsWith('@') || target.startsWith('#') ? `${target[0]}${label}` : label
      )
      .replace(/<!(here|channel|everyone)>/g, '@$1')
      .replace(/<([^<>]+)>/g, '$1')
  )
}
