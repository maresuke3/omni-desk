import { describe, expect, it } from 'vitest'
import type { Message, Source } from '@omni-desk/contracts'
import { excludeBlockedSenders, isSenderBlocked, senderOf, toBlockedSender } from './blocked-senders'

const msg = (id: string, source: Source, authorId: string, name = authorId): Message => ({
  id,
  nativeId: id,
  source,
  conversationId: 'c1',
  conversationName: 'general',
  conversationKind: 'channel',
  author: { id: authorId, name },
  text: '',
  format: 'plain',
  createdAt: 0
})

const inbox = [
  msg('1', 'slack', 'U0SATO', '佐藤'),
  msg('2', 'chatwork', '2000001', '小林'),
  msg('3', 'slack', 'B0BOT', 'Deploy Bot'),
  msg('4', 'slack', 'U0TANAKA', '田中'),
  msg('5', 'slack', 'U0SATO', '佐藤')
]

describe('excludeBlockedSenders', () => {
  it('非表示リストが空・未定義なら全件をそのまま返す', () => {
    expect(excludeBlockedSenders(inbox, []).map((m) => m.id)).toEqual(['1', '2', '3', '4', '5'])
    expect(excludeBlockedSenders(inbox, undefined).map((m) => m.id)).toEqual(['1', '2', '3', '4', '5'])
  })

  it('同じ送信者のメッセージをすべて除き、並び順は保つ', () => {
    const result = excludeBlockedSenders(inbox, [{ source: 'slack', senderId: 'U0SATO' }])
    expect(result.map((m) => m.id)).toEqual(['2', '3', '4'])
  })

  it('Bot は bot_id（author.id）で除外できる', () => {
    const result = excludeBlockedSenders(inbox, [{ source: 'slack', senderId: 'B0BOT' }])
    expect(result.map((m) => m.id)).toEqual(['1', '2', '4', '5'])
  })

  it('サービスが違えば同じ ID でも除外しない', () => {
    const mixed = [msg('a', 'slack', '2000001'), msg('b', 'chatwork', '2000001')]
    const result = excludeBlockedSenders(mixed, [{ source: 'chatwork', senderId: '2000001' }])
    expect(result.map((m) => m.id)).toEqual(['a'])
  })

  it('複数のサービスの送信者をまとめて除外できる', () => {
    const result = excludeBlockedSenders(inbox, [
      { source: 'slack', senderId: 'U0TANAKA' },
      { source: 'chatwork', senderId: '2000001' }
    ])
    expect(result.map((m) => m.id)).toEqual(['1', '3', '5'])
  })

  it('元の配列を書き換えない', () => {
    const before = inbox.map((m) => m.id)
    excludeBlockedSenders(inbox, [{ source: 'slack', senderId: 'U0SATO' }])
    expect(inbox.map((m) => m.id)).toEqual(before)
  })
})

describe('isSenderBlocked', () => {
  const blocked = [{ source: 'chatwork' as const, senderId: '2000001', name: '小林' }]

  it('source と senderId の両方が一致したときだけ true', () => {
    expect(isSenderBlocked(blocked, { source: 'chatwork', senderId: '2000001' })).toBe(true)
    expect(isSenderBlocked(blocked, { source: 'slack', senderId: '2000001' })).toBe(false)
    expect(isSenderBlocked(blocked, { source: 'chatwork', senderId: '2000002' })).toBe(false)
    expect(isSenderBlocked(undefined, { source: 'chatwork', senderId: '2000001' })).toBe(false)
  })
})

describe('senderOf / toBlockedSender', () => {
  it('メッセージの送信者から登録用の値を作る', () => {
    const m = msg('1', 'slack', 'U0SATO', '佐藤 美咲')
    expect(senderOf(m)).toEqual({ source: 'slack', senderId: 'U0SATO' })
    expect(toBlockedSender(m)).toEqual({ source: 'slack', senderId: 'U0SATO', name: '佐藤 美咲' })
  })
})
