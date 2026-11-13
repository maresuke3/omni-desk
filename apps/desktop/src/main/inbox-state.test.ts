import { describe, expect, it } from 'vitest'
import { markReplied, pruneInboxStates, setInboxStatus } from './inbox-state'

const NOW = 1_800_000_000_000
const HOUR = 3_600_000

describe('受信箱の対応状況', () => {
  it('対応済み・あとで・未対応に戻すを切り替える', () => {
    let s = setInboxStatus({}, ['1:a', '1:b'], 'done', { now: NOW })
    expect(s['1:a']).toEqual({ status: 'done', until: undefined, updatedAt: NOW, reason: 'manual' })
    s = setInboxStatus(s, ['1:b'], 'snoozed', { now: NOW, until: NOW + HOUR })
    expect(s['1:b'].status).toBe('snoozed')
    s = setInboxStatus(s, ['1:a'], 'open', { now: NOW })
    expect(s['1:a']).toBeUndefined()
  })

  it('あとでの時刻が過去や遠すぎる未来なら拒否する', () => {
    expect(() => setInboxStatus({}, ['1:a'], 'snoozed', { now: NOW, until: NOW - 1 })).toThrow()
    expect(() => setInboxStatus({}, ['1:a'], 'snoozed', { now: NOW, until: NOW + 90 * 24 * HOUR })).toThrow()
    expect(() => setInboxStatus({}, ['1:a'], 'snoozed', { now: NOW })).toThrow()
  })

  it('返信済みは自動で対応済みにするが、利用者が付けた状態は上書きしない', () => {
    const snoozed = setInboxStatus({}, ['1:a'], 'snoozed', { now: NOW, until: NOW + HOUR })
    const s = markReplied(snoozed, ['1:a', '1:b'], NOW)
    expect(s['1:a'].status).toBe('snoozed')
    expect(s['1:b']).toEqual({ status: 'done', updatedAt: NOW, reason: 'replied' })
    expect(markReplied(s, ['1:b'], NOW)).toBe(s) // 変化がなければ同じオブジェクト
  })

  it('古い記録と壊れた値を捨てる', () => {
    const pruned = pruneInboxStates(
      {
        '1:new': { status: 'done', updatedAt: NOW - HOUR, reason: 'manual' },
        '1:old': { status: 'done', updatedAt: NOW - 40 * 24 * HOUR, reason: 'manual' },
        '1:bad': { status: 'unknown', updatedAt: NOW },
        '../x': { status: 'done', updatedAt: NOW }
      },
      NOW
    )
    expect(Object.keys(pruned)).toEqual(['1:new'])
  })
})
