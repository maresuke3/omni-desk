import type { MailAddress, MailMessage, MailSendInput } from '@omni-desk/contracts'

export interface RawGmailHeader {
  name?: string
  value?: string
}

export interface RawGmailPart {
  mimeType?: string
  body?: { data?: string; size?: number }
  parts?: RawGmailPart[]
}

export interface RawGmailMessage {
  id: string
  threadId?: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string
  payload?: RawGmailPart & {
    headers?: RawGmailHeader[]
  }
}

export function decodeBase64UrlUtf8(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/')
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(normalized + pad, 'base64').toString('utf8')
}

export function encodeBase64UrlUtf8(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url')
}

export function parseMailAddress(raw?: string): MailAddress {
  if (!raw) return { email: '' }
  const trimmed = raw.trim()
  const match = trimmed.match(/^(?:"?([^"]*?)"?\s*)?<([^>]+)>$/)
  if (match) {
    const name = match[1]?.trim() || undefined
    const email = match[2].trim()
    return { name, email }
  }
  return { email: trimmed }
}

export function parseAddressList(raw?: string): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function stripHtmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function findPartBody(part: RawGmailPart | undefined, mimeType: string): string | undefined {
  if (!part) return undefined
  if (part.mimeType?.toLowerCase() === mimeType && part.body?.data) {
    return decodeBase64UrlUtf8(part.body.data)
  }
  if (part.parts) {
    for (const child of part.parts) {
      const found = findPartBody(child, mimeType)
      if (found) return found
    }
  }
  return undefined
}

export function extractBodyText(payload?: RawGmailPart): string | undefined {
  if (!payload) return undefined
  const plain = findPartBody(payload, 'text/plain')
  if (plain) return plain.trim()
  const html = findPartBody(payload, 'text/html')
  if (html) return stripHtmlToText(html)
  if (payload.body?.data) {
    return decodeBase64UrlUtf8(payload.body.data).trim()
  }
  return undefined
}

export function normalizeGmailMessage(
  raw: RawGmailMessage,
  account: { id: string; email: string }
): MailMessage {
  const headers = new Map<string, string>()
  for (const h of raw.payload?.headers ?? []) {
    if (h.name && h.value) headers.set(h.name.toLowerCase(), h.value)
  }

  const subject = headers.get('subject')?.trim() || '(件名なし)'
  const from = parseMailAddress(headers.get('from'))
  const to = parseAddressList(headers.get('to'))
  const cc = parseAddressList(headers.get('cc'))
  const receivedAt = raw.internalDate ? Number(raw.internalDate) : Date.now()
  const labels = raw.labelIds ?? []
  const bodyText = extractBodyText(raw.payload)

  return {
    id: `${account.id}:${raw.id}`,
    externalId: raw.id,
    accountId: account.id,
    accountEmail: account.email,
    provider: 'google',
    threadId: raw.threadId,
    subject,
    from,
    to,
    cc: cc.length > 0 ? cc : undefined,
    snippet: decodeHtmlEntities(raw.snippet ?? '').trim(),
    bodyText,
    receivedAt: Number.isFinite(receivedAt) ? receivedAt : Date.now(),
    isUnread: labels.includes('UNREAD'),
    isStarred: labels.includes('STARRED'),
    labels,
    webUrl: `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(account.email)}#inbox/${raw.id}`
  }
}

function encodeMimeHeader(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

export function buildRawMimeMessage(input: MailSendInput, fromEmail?: string): string {
  const lines: string[] = []
  if (fromEmail) lines.push(`From: ${fromEmail}`)
  lines.push(`To: ${input.to.trim()}`)
  if (input.cc?.trim()) lines.push(`Cc: ${input.cc.trim()}`)
  lines.push(`Subject: ${encodeMimeHeader(input.subject.trim())}`)
  if (input.inReplyTo?.trim()) {
    lines.push(`In-Reply-To: ${input.inReplyTo.trim()}`)
    lines.push(`References: ${input.inReplyTo.trim()}`)
  }
  lines.push('MIME-Version: 1.0')
  lines.push('Content-Type: text/plain; charset="UTF-8"')
  lines.push('Content-Transfer-Encoding: base64')
  lines.push('')
  lines.push(Buffer.from(input.body, 'utf8').toString('base64'))
  return encodeBase64UrlUtf8(lines.join('\r\n'))
}
