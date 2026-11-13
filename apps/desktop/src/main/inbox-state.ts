import type { InboxItemState, InboxStatus } from '@omni-desk/contracts'
import { AppError } from '@omni-desk/connector-core'

/**
 * 受信箱の対応状況（対応済み・あとで）の管理。純粋なロジックだけを持ち、保存はシェル側で行う。
 * 保存するのはメッセージの ID と状態・時刻だけで、本文は含めない。
 */

export type InboxStates = Record<string, InboxItemState>

const ID_RE = /^[A-Za-z0-9_.:-]{1,160}$/
/** これより古い記録は消す（自分宛ての保持期間 14 日より長めに残す） */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000
/** あとでの上限（誤操作で永久に隠れないように） */
const MAX_SNOOZE_MS = 60 * 24 * 60 * 60 * 1000
const MAX_ENTRIES = 5_000

export function assertInboxId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new AppError('invalid_input', '受信箱の項目の指定が不正です')
}

/** 状態を変える。未対応に戻すときは記録を消す */
export function setInboxStatus(
  states: InboxStates,
  ids: readonly string[],
  status: InboxStatus,
  opts: { now: number; until?: number }
): InboxStates {
  const next = { ...states }
  if (status === 'snoozed') {
    if (!opts.until || opts.until <= opts.now || opts.until > opts.now + MAX_SNOOZE_MS) {
      throw new AppError('invalid_input', 'あとでの時刻が不正です')
    }
  }
  for (const id of ids) {
    if (status === 'open') delete next[id]
    else next[id] = { status, until: status === 'snoozed' ? opts.until : undefined, updatedAt: opts.now, reason: 'manual' }
  }
  return next
}

/**
 * 返信済みと分かったものを対応済みにする。
 * 利用者が自分で状態を付けたもの（あとでなど）は上書きしない。
 */
export function markReplied(states: InboxStates, ids: readonly string[], now: number): InboxStates {
  let changed = false
  const next = { ...states }
  for (const id of ids) {
    if (next[id]) continue
    next[id] = { status: 'done', updatedAt: now, reason: 'replied' }
    changed = true
  }
  return changed ? next : states
}

/** 古い記録と、壊れた値を捨てる（読み込み時と保存時に通す） */
export function pruneInboxStates(value: unknown, now: number): InboxStates {
  if (!value || typeof value !== 'object') return {}
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([id, v]) => {
      if (!ID_RE.test(id) || !v || typeof v !== 'object') return false
      const s = v as Partial<InboxItemState>
      if (s.status !== 'done' && s.status !== 'snoozed') return false
      if (typeof s.updatedAt !== 'number' || now - s.updatedAt > RETENTION_MS) return false
      return s.status !== 'snoozed' || typeof s.until === 'number'
    })
    .sort((a, b) => (b[1] as InboxItemState).updatedAt - (a[1] as InboxItemState).updatedAt)
    .slice(0, MAX_ENTRIES)
  return Object.fromEntries(
    entries.map(([id, v]) => {
      const s = v as InboxItemState
      return [id, { status: s.status, until: s.until, updatedAt: s.updatedAt, reason: s.reason === 'replied' ? 'replied' : 'manual' }]
    })
  )
}
