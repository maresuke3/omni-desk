import { describe, expect, it } from 'vitest'
import { isChatworkMention, normalizeTask } from './service'

describe('chatwork normalize', () => {
  it('自分宛ての判定', () => {
    expect(isChatworkMention('[To:123]山田さん', '123')).toBe(true)
    expect(isChatworkMention('[rp aid=123 to=1-2]山田さん', '123')).toBe(true)
    expect(isChatworkMention('[To:1234]別人', '123')).toBe(false)
    expect(isChatworkMention('[toall]全員へ', '123')).toBe(true)
  })

  it('タスクの期限種別を反映する', () => {
    const base = {
      task_id: 1,
      room: { room_id: 10, name: 'R' },
      assigned_by_account: { account_id: 2, name: 'A' },
      message_id: '99',
      body: 'やること',
      status: 'open' as const
    }
    expect(normalizeTask({ ...base, limit_time: 0, limit_type: 'none' }).dueAt).toBeUndefined()
    expect(normalizeTask({ ...base, limit_time: 1700000000, limit_type: 'date' })).toMatchObject({
      dueAt: 1700000000000,
      dueHasTime: false,
      permalink: 'https://www.chatwork.com/#!rid10-99'
    })
  })
})
