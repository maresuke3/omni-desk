import { describe, expect, it } from 'vitest'
import type { Conversation, Message } from '@omni-desk/contracts'
import { formatChatworkReply } from './service'
import {
  computeChatworkStatus,
  mergeMentions,
  planRoomFetches,
  repliedMessageIds,
  signatureOf,
  unreadMessageIds,
  type RoomSignature
} from './sync'

const NOW = 1_800_000_000_000

const room = (id: string, over: Partial<Conversation> = {}): Conversation => ({
  id,
  source: 'chatwork',
  name: `room ${id}`,
  kind: 'group',
  unreadCount: 0,
  mentionCount: 0,
  messageCount: 10,
  myTaskCount: 0,
  lastActivityAt: NOW - 60_000,
  ...over
})

const sigs = (rooms: Conversation[]): Map<string, RoomSignature> => new Map(rooms.map((r) => [r.id, signatureOf(r)]))

describe('planRoomFetches', () => {
  it('自分宛ての未読が増えたルームは mention、それ以外の変化は最低優先度の scan にする', () => {
    const before = [room('1'), room('2'), room('3')]
    const after = [
      room('1', { mentionCount: 1, unreadCount: 1, messageCount: 11, lastActivityAt: NOW }),
      room('2', { unreadCount: 3, messageCount: 13, lastActivityAt: NOW }), // 自分宛てではない（または既に読まれた）変化
      room('3')
    ]
    const plan = planRoomFetches(sigs(before), after, { watched: null, catchUp: false, now: NOW })
    expect(plan.fetches).toEqual([
      { roomId: '1', reason: 'mention' },
      { roomId: '2', reason: 'scan' }
    ])
    expect(plan.stale).toEqual(['2'])
    expect(plan.tasksChanged).toBe(false)
  })

  it('DM は未読が増えたら自分宛てとして取得する', () => {
    const before = [room('9', { kind: 'dm' })]
    const after = [room('9', { kind: 'dm', unreadCount: 1, messageCount: 11, lastActivityAt: NOW })]
    expect(planRoomFetches(sigs(before), after, { watched: null, catchUp: false, now: NOW }).fetches).toEqual([
      { roomId: '9', reason: 'mention' }
    ])
  })

  it('開いているルームの変化は view で取得する', () => {
    const before = [room('5')]
    const after = [room('5', { messageCount: 11, lastActivityAt: NOW })]
    expect(planRoomFetches(sigs(before), after, { watched: '5', catchUp: false, now: NOW }).fetches).toEqual([
      { roomId: '5', reason: 'view' }
    ])
  })

  it('追いつき中は閉じている間に変化したルームを backfill し、未読の自分宛ては mention にする', () => {
    const before = [room('1'), room('2'), room('3')]
    const after = [
      room('1', { messageCount: 30, lastActivityAt: NOW }),
      room('2', { mentionCount: 1 }), // 閉じる前から未読の自分宛て
      room('3')
    ]
    const plan = planRoomFetches(sigs(before), after, { watched: null, catchUp: true, now: NOW })
    expect(plan.fetches).toEqual([
      { roomId: '1', reason: 'backfill' },
      { roomId: '2', reason: 'mention' }
    ])
  })

  it('初回起動は自分宛ての未読と直近 3 日に動いたルームだけを対象にする', () => {
    const rooms = [
      room('1', { mentionCount: 2 }),
      room('2', { lastActivityAt: NOW - 3 * 24 * 3600_000 }),
      room('3', { lastActivityAt: NOW - 3600_000 }),
      room('4', { kind: 'my', lastActivityAt: NOW })
    ]
    const plan = planRoomFetches(null, rooms, { watched: null, catchUp: true, now: NOW })
    expect(plan.fetches.map((f) => `${f.roomId}:${f.reason}`).sort()).toEqual(['1:mention', '3:backfill'])
    expect(plan.tasksChanged).toBe(true)
  })

  it('自分のタスク数の合計が変わったらタスクを取り直す', () => {
    const before = [room('1', { myTaskCount: 1 })]
    const after = [room('1', { myTaskCount: 2 })]
    expect(planRoomFetches(sigs(before), after, { watched: null, catchUp: false, now: NOW }).tasksChanged).toBe(true)
  })
})

describe('mergeMentions', () => {
  const msg = (id: string, createdAt: number, text = 'x'): Message => ({
    id,
    nativeId: id,
    source: 'chatwork',
    conversationId: '1',
    conversationName: 'r',
    conversationKind: 'group',
    author: { id: '2', name: 'a' },
    text,
    format: 'chatwork',
    createdAt
  })

  it('同じ ID は新しい内容で置き換え、期限切れと上限超過を落とす', () => {
    const merged = mergeMentions(
      [msg('a', NOW - 1000, 'old'), msg('old', NOW - 20 * 86_400_000)],
      [msg('a', NOW - 1000, 'edited'), msg('b', NOW), msg('c', NOW - 500)],
      { now: NOW, maxAgeMs: 14 * 86_400_000, maxItems: 2 }
    )
    expect(merged.map((m) => m.id)).toEqual(['b', 'c'])
    const all = mergeMentions([msg('a', NOW - 1000, 'old')], [msg('a', NOW - 1000, 'edited')], {
      now: NOW,
      maxAgeMs: 86_400_000,
      maxItems: 10
    })
    expect(all[0].text).toBe('edited')
  })
})

describe('computeChatworkStatus', () => {
  it('ルーム一覧から件数を集計する', () => {
    expect(
      computeChatworkStatus([room('1', { unreadCount: 3, mentionCount: 1, myTaskCount: 2 }), room('2', { unreadCount: 1 })])
    ).toEqual({ unreadRoomCount: 2, mentionRoomCount: 1, taskRoomCount: 1, unreadCount: 4, mentionCount: 1, taskCount: 2 })
  })
})

describe('formatChatworkReply', () => {
  it('Chatwork の返信タグを付ける', () => {
    expect(formatChatworkReply('123', { messageId: '456', authorId: '789', authorName: '山田' }, '承知しました')).toBe(
      '[rp aid=789 to=123-456]山田さん\n承知しました'
    )
  })

  it('不正な返信先は拒否する', () => {
    expect(() => formatChatworkReply('123', { messageId: 'x', authorId: '789', authorName: 'a' }, 'b')).toThrow()
  })
})

describe('既読・返信の検出', () => {
  const m = (id: string, author: string, text = ''): Message => ({
    id: `1:${id}`,
    nativeId: id,
    source: 'chatwork',
    conversationId: '1',
    conversationName: 'r',
    conversationKind: 'group',
    author: { id: author, name: author },
    text,
    format: 'chatwork',
    createdAt: Number(id)
  })

  it('新しい方から未読数ぶん（自分の投稿を除く）を未読とみなす', () => {
    const list = [m('1', '2'), m('2', '2'), m('3', 'me'), m('4', '2')]
    expect([...unreadMessageIds(list, 2, 'me')]).toEqual(['1:4', '1:2'])
    expect(unreadMessageIds(list, 0, 'me').size).toBe(0)
  })

  it('自分の投稿の返信タグから返信済みのメッセージを取り出す', () => {
    const list = [
      m('5', 'me', '[rp aid=2 to=1-3]山田さん\n対応します'),
      m('6', '2', '[rp aid=9 to=1-4]他人の返信'),
      m('7', 'me', '[返信 aid=2 to=8-10]別ルームへの返信')
    ]
    expect(repliedMessageIds(list, 'me')).toEqual(['1:3', '8:10'])
  })
})
