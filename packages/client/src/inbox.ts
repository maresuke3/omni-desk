import type { InboxItemState, InboxStatus, Message, Source } from '@omni-desk/contracts'

/**
 * 受信箱の対応状況の判定（純粋関数）。受信箱・ホーム・サイドバーの件数が同じ規則になるよう、ここに集める。
 */

export interface InboxEntry {
  message: Message
  status: InboxStatus
  state?: InboxItemState
}

/** 記録された状態と現在時刻から、実際の状態を決める（「あとで」は時刻を過ぎたら未対応に戻る） */
export function effectiveStatus(state: InboxItemState | undefined, now: number): InboxStatus {
  if (!state) return 'open'
  if (state.status === 'snoozed') return (state.until ?? 0) > now ? 'snoozed' : 'open'
  return 'done'
}

export function buildInboxEntries(
  messages: readonly Message[],
  states: Record<string, InboxItemState>,
  now: number
): InboxEntry[] {
  return messages.map((message) => {
    const state = states[message.id]
    return { message, state, status: effectiveStatus(state, now) }
  })
}

export function countByStatus(entries: readonly InboxEntry[]): Record<InboxStatus, number> {
  const counts: Record<InboxStatus, number> = { open: 0, snoozed: 0, done: 0 }
  for (const e of entries) counts[e.status]++
  return counts
}

export function countOpenBySource(entries: readonly InboxEntry[]): Record<Source, number> {
  const counts: Record<Source, number> = { slack: 0, chatwork: 0 }
  for (const e of entries) if (e.status === 'open') counts[e.message.source]++
  return counts
}
