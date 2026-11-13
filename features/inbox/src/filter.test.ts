import { describe, expect, it } from 'vitest'
import type { InboxItemState, Message } from '@omni-desk/contracts'
import type { InboxEntry } from '@omni-desk/client'
import { filterInbox, isFiltering, type InboxFilter } from './filter'
import { snoozeOptions } from './snooze'

const NOW = new Date(2026, 10, 13, 10, 0).getTime() // 2026/11/13（金）10:00
const HOUR = 3_600_000

const entry = (id: string, over: Partial<Message> = {}, status: InboxEntry['status'] = 'open', state?: InboxItemState): InboxEntry => ({
  status,
  state,
  message: {
    id,
    nativeId: id,
    source: 'chatwork',
    conversationId: '1',
    conversationName: '【サンプル商事様】定例',
    conversationKind: 'group',
    author: { id: '2', name: '小林 誠' },
    text: `本文 ${id}`,
    format: 'plain',
    createdAt: NOW - HOUR,
    ...over
  }
})

const base: InboxFilter = { status: 'open', source: 'all', period: 'all', query: '' }
const plain = (m: Message) => m.text

describe('filterInbox', () => {
  it('タブ・サービスで絞り込み、未対応は新しい順に並べる', () => {
    const list = [
      entry('a', { createdAt: NOW - 3 * HOUR }),
      entry('b', { source: 'slack' }),
      entry('c', {}, 'done'),
      entry('d', { createdAt: NOW - 2 * HOUR })
    ]
    expect(filterInbox(list, base, NOW, plain).map((e) => e.message.id)).toEqual(['b', 'd', 'a'])
    expect(filterInbox(list, { ...base, source: 'chatwork' }, NOW, plain).map((e) => e.message.id)).toEqual(['d', 'a'])
    expect(filterInbox(list, { ...base, status: 'done' }, NOW, plain).map((e) => e.message.id)).toEqual(['c'])
  })

  it('検索はスペース区切りの AND で、送信者・ルーム名・本文を対象に全角半角を区別しない', () => {
    const list = [entry('a', { text: '見積書を送付します' }), entry('b', { text: '請求書の件', author: { id: '3', name: 'Ｙａｍａｄａ' } })]
    expect(filterInbox(list, { ...base, query: '小林 見積' }, NOW, plain).map((e) => e.message.id)).toEqual(['a'])
    expect(filterInbox(list, { ...base, query: 'yamada' }, NOW, plain).map((e) => e.message.id)).toEqual(['b'])
    expect(filterInbox(list, { ...base, query: 'サンプル商事' }, NOW, plain)).toHaveLength(2)
  })

  it('期間で絞り込む', () => {
    const list = [entry('a', { createdAt: NOW - 2 * 24 * HOUR }), entry('b', { createdAt: NOW - HOUR })]
    expect(filterInbox(list, { ...base, period: 'today' }, NOW, plain).map((e) => e.message.id)).toEqual(['b'])
    expect(filterInbox(list, { ...base, period: '7d' }, NOW, plain)).toHaveLength(2)
  })

  it('あとでは解除が近い順に並べる', () => {
    const s = (until: number): InboxItemState => ({ status: 'snoozed', until, updatedAt: NOW, reason: 'manual' })
    const list = [entry('a', {}, 'snoozed', s(NOW + 5 * HOUR)), entry('b', {}, 'snoozed', s(NOW + HOUR))]
    expect(filterInbox(list, { ...base, status: 'snoozed' }, NOW, plain).map((e) => e.message.id)).toEqual(['b', 'a'])
  })

  it('絞り込み中かどうか', () => {
    expect(isFiltering(base)).toBe(false)
    expect(isFiltering({ ...base, query: ' ' })).toBe(false)
    expect(isFiltering({ ...base, period: 'today' })).toBe(true)
  })
})

describe('snoozeOptions', () => {
  it('金曜 10 時なら、1 時間後・今日の夕方・明日の朝・来週月曜を出す', () => {
    const opts = snoozeOptions(NOW)
    expect(opts.map((o) => o.key)).toEqual(['1h', 'evening', 'tomorrow', 'next-week'])
    expect(new Date(opts[1].until).getHours()).toBe(18)
    expect(new Date(opts[3].until).getDay()).toBe(1)
    expect(new Date(opts[3].until).getDate()).toBe(16)
  })

  it('夕方を過ぎていたら「今日の夕方」は出さない', () => {
    expect(snoozeOptions(new Date(2026, 10, 13, 17, 30).getTime()).map((o) => o.key)).not.toContain('evening')
  })
})
