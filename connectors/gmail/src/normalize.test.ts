import { describe, expect, it } from 'vitest'
import {
  buildRawMimeMessage,
  decodeBase64UrlUtf8,
  encodeBase64UrlUtf8,
  normalizeGmailMessage,
  parseMailAddress
} from './normalize'

describe('gmail normalize', () => {
  it('parses sender name and email', () => {
    expect(parseMailAddress('"田中 太郎" <tanaka@example.com>')).toEqual({
      name: '田中 太郎',
      email: 'tanaka@example.com'
    })
    expect(parseMailAddress('noreply@example.com')).toEqual({ email: 'noreply@example.com' })
  })

  it('normalizes multipart Gmail message with UTF-8 body', () => {
    const raw = {
      id: 'msg-1',
      threadId: 'thr-1',
      labelIds: ['INBOX', 'UNREAD', 'STARRED'],
      snippet: '明日の打ち合わせについて',
      internalDate: '1700000000000',
      payload: {
        mimeType: 'multipart/alternative',
        headers: [
          { name: 'Subject', value: '定例MTGのご案内' },
          { name: 'From', value: '佐藤 <sato@example.com>' },
          { name: 'To', value: 'me@example.com, team@example.com' }
        ],
        parts: [
          {
            mimeType: 'text/plain',
            body: { data: encodeBase64UrlUtf8('こんにちは。\n明日の10時からよろしくお願いします。') }
          }
        ]
      }
    }

    const msg = normalizeGmailMessage(raw, { id: 'google:me@example.com', email: 'me@example.com' })
    expect(msg.id).toBe('google:me@example.com:msg-1')
    expect(msg.externalId).toBe('msg-1')
    expect(msg.subject).toBe('定例MTGのご案内')
    expect(msg.from).toEqual({ name: '佐藤', email: 'sato@example.com' })
    expect(msg.to).toEqual(['me@example.com', 'team@example.com'])
    expect(msg.isUnread).toBe(true)
    expect(msg.isStarred).toBe(true)
    expect(msg.bodyText).toBe('こんにちは。\n明日の10時からよろしくお願いします。')
  })

  it('builds valid base64url MIME payload for Japanese subject and body', () => {
    const encoded = buildRawMimeMessage(
      {
        accountId: 'google:me@example.com',
        to: 'dest@example.com',
        subject: 'テスト件名',
        body: '本文テスト'
      },
      'me@example.com'
    )
    const decoded = decodeBase64UrlUtf8(encoded)
    expect(decoded).toContain('To: dest@example.com')
    expect(decoded).toContain('From: me@example.com')
    expect(decoded).toContain('Subject: =?UTF-8?B?')
    expect(decoded).toContain(Buffer.from('本文テスト', 'utf8').toString('base64'))
  })
})
