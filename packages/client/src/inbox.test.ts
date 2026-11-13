import { describe, expect, it } from 'vitest'
import type { InboxItemState, Message } from '@omni-desk/contracts'
import { buildInboxEntries, countByStatus, effectiveStatus } from './inbox'
import { applyInboxStatus } from './store'

const NOW = 1_800_000_000_000
const msg = (id: string): Message => ({
  id,
  nativeId: id,
  source: 'chatwork',
  conversationId: '1',
  conversationName: 'r',
  conversationKind: 'group',
  author: { id: '2', name: 'a' },
  text: '',
  format: 'chatwork',
  createdAt: NOW
})

describe('受信箱の対応状況', () => {
  it('あとでは時刻を過ぎると未対応に戻る', () => {
    const snoozed: InboxItemState = { status: 'snoozed', until: NOW + 1000, updatedAt: NOW, reason: 'manual' }
    expect(effectiveStatus(snoozed, NOW)).toBe('snoozed')
    expect(effectiveStatus(snoozed, NOW + 1000)).toBe('open')
    expect(effectiveStatus(undefined, NOW)).toBe('open')
    expect(effectiveStatus({ status: 'done', updatedAt: NOW, reason: 'replied' }, NOW)).toBe('done')
  })

  it('件数を状態ごとに数える', () => {
    const states = applyInboxStatus({}, ['a'], 'done', NOW)
    const withSnooze = applyInboxStatus(states, ['b'], 'snoozed', NOW, NOW + 60_000)
    const entries = buildInboxEntries([msg('a'), msg('b'), msg('c')], withSnooze, NOW)
    expect(countByStatus(entries)).toEqual({ open: 1, snoozed: 1, done: 1 })
    // 未対応に戻すと記録が消える
    expect(applyInboxStatus(withSnooze, ['a'], 'open', NOW)).not.toHaveProperty('a')
  })
})
