import { describe, expect, it } from 'vitest'
import { AppError } from '@omni-desk/connector-core'
import {
  addBlockedSender,
  MAX_BLOCKED_SENDERS,
  parseBlockedSender,
  parseSenderKey,
  removeBlockedSender,
  sanitizeBlockedSenders
} from './blocked-senders'

const sato = { source: 'slack' as const, senderId: 'U0SATO', name: '佐藤 美咲' }
const kobayashi = { source: 'chatwork' as const, senderId: '2000001', name: '小林 誠' }

describe('parseBlockedSender', () => {
  it('正しい入力はそのまま通す', () => {
    expect(parseBlockedSender(sato)).toEqual(sato)
    expect(parseBlockedSender({ source: 'slack', senderId: 'B0123BOT', name: 'Deploy Bot' })).toMatchObject({
      senderId: 'B0123BOT'
    })
  })

  it('不正な source / senderId は invalid_input', () => {
    const bad: unknown[] = [
      null,
      'U0SATO',
      { source: 'teams', senderId: 'U0SATO' },
      { source: 'slack' },
      { source: 'slack', senderId: '' },
      { source: 'slack', senderId: 'U0 SATO' },
      { source: 'slack', senderId: 'x'.repeat(65) },
      { source: 'chatwork', senderId: 2000001 }
    ]
    for (const input of bad) {
      expect(() => parseBlockedSender(input)).toThrow(AppError)
    }
  })

  it('名前は空なら ID で代用し、空白を整えて長すぎれば切り詰める', () => {
    expect(parseBlockedSender({ source: 'slack', senderId: 'U0SATO' }).name).toBe('U0SATO')
    expect(parseBlockedSender({ source: 'slack', senderId: 'U0SATO', name: '  佐藤\n美咲 ' }).name).toBe('佐藤 美咲')
    expect([...parseBlockedSender({ ...sato, name: 'あ'.repeat(300) }).name]).toHaveLength(100)
  })

  it('余分なプロパティは保存しない', () => {
    expect(parseBlockedSender({ ...sato, extra: 'x' })).toEqual(sato)
    expect(parseSenderKey({ ...sato })).toEqual({ source: 'slack', senderId: 'U0SATO' })
  })
})

describe('addBlockedSender / removeBlockedSender', () => {
  it('同じ送信者は重複登録しない（名前が違っても）', () => {
    const once = addBlockedSender([], sato)
    const twice = addBlockedSender(once, { ...sato, name: '別名' })
    expect(twice).toEqual([sato])
  })

  it('サービスが違えば同じ ID でも別の送信者として登録する', () => {
    const list = addBlockedSender([kobayashi], { source: 'slack', senderId: '2000001', name: 'x' })
    expect(list).toHaveLength(2)
  })

  it('解除は source と senderId が一致するものだけを消す', () => {
    const list = [sato, kobayashi]
    expect(removeBlockedSender(list, { source: 'chatwork', senderId: '2000001' })).toEqual([sato])
    expect(removeBlockedSender(list, { source: 'slack', senderId: '2000001' })).toEqual(list)
  })

  it('上限を超えると invalid_input', () => {
    const full = Array.from({ length: MAX_BLOCKED_SENDERS }, (_, i) => ({ source: 'slack' as const, senderId: `U${i}`, name: `${i}` }))
    expect(() => addBlockedSender(full, sato)).toThrow(AppError)
    // 登録済みの送信者なら上限でもエラーにしない
    expect(addBlockedSender(full, full[0])).toHaveLength(MAX_BLOCKED_SENDERS)
  })
})

describe('sanitizeBlockedSenders', () => {
  it('配列でなければ空、不正な要素と重複は読み飛ばす', () => {
    expect(sanitizeBlockedSenders(undefined)).toEqual([])
    expect(sanitizeBlockedSenders({})).toEqual([])
    expect(sanitizeBlockedSenders([sato, { source: 'x', senderId: 'y' }, 1, { ...sato, name: '重複' }, kobayashi])).toEqual([
      sato,
      kobayashi
    ])
  })
})
