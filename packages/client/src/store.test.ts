import { describe, expect, it } from 'vitest'
import { emptyKnowledgeSnapshot, emptyServiceSnapshot, type PublicSettings, type StateEvent } from '@omni-desk/contracts'
import { applyStateEvent } from './store'

const settings = { demoActive: true } as PublicSettings
const base = () => ({
  seq: 5,
  settings,
  services: { slack: emptyServiceSnapshot(), chatwork: emptyServiceSnapshot() },
  knowledge: emptyKnowledgeSnapshot(),
  histories: {},
  inboxStates: {}
})

describe('applyStateEvent', () => {
  it('スナップショット以前の差分は捨てる（取りこぼし防止のための重複除去）', () => {
    const event: StateEvent = { kind: 'service', source: 'slack', changes: { phase: 'ready' }, seq: 5 }
    expect(applyStateEvent(base(), event)).toBeNull()
  })

  it('サービスの差分はそのサービスだけにマージする', () => {
    const next = applyStateEvent(base(), { kind: 'service', source: 'chatwork', changes: { phase: 'ready', inbox: [] }, seq: 6 })
    expect(next?.seq).toBe(6)
    expect(next?.services?.chatwork.phase).toBe('ready')
    expect(next?.services?.chatwork.inbox).toEqual([])
    expect(next?.services?.slack.phase).toBe('idle')
  })

  it('履歴は追加と削除ができる', () => {
    const history = { source: 'slack' as const, conversationId: 'C1', messages: [], loading: false, error: null, fetchedAt: 1 }
    const added = applyStateEvent(base(), { kind: 'history', key: 'slack:C1', history, seq: 6 })
    expect(added?.histories).toEqual({ 'slack:C1': history })
    const removed = applyStateEvent({ ...base(), seq: 6, histories: { 'slack:C1': history } }, {
      kind: 'history',
      key: 'slack:C1',
      history: null,
      seq: 7
    })
    expect(removed?.histories).toEqual({})
  })
})
