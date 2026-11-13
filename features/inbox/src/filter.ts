import type { InboxStatus, Message } from '@omni-desk/contracts'
import type { InboxEntry, InboxPeriod, SourceFilter } from '@omni-desk/client'

/** 受信箱の絞り込み条件（ストアの ui に置く） */
export interface InboxFilter {
  status: InboxStatus
  source: SourceFilter
  period: InboxPeriod
  query: string
}

const DAY = 24 * 60 * 60 * 1000

export const normalize = (s: string): string => s.normalize('NFKC').toLowerCase()

const startOfDay = (ms: number): number => {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function periodStart(period: InboxPeriod, now: number): number {
  switch (period) {
    case 'today':
      return startOfDay(now)
    case '7d':
      return now - 7 * DAY
    case '30d':
      return now - 30 * DAY
    default:
      return 0
  }
}

/**
 * 検索語はスペース区切りの AND。送信者名・ルーム名・本文（記法を外したもの）を対象にし、
 * 全角半角・大文字小文字は区別しない。
 */
export function matchesQuery(message: Message, terms: readonly string[], toText: (m: Message) => string): boolean {
  if (!terms.length) return true
  const haystack = normalize(`${message.author.name}\n${message.conversationName}\n${toText(message)}`)
  return terms.every((t) => haystack.includes(t))
}

export const queryTerms = (query: string): string[] => normalize(query).split(/\s+/).filter(Boolean)

/** タブ（状態）・サービス・期間・検索語で絞り込み、タブに合った順に並べる */
export function filterInbox(
  entries: readonly InboxEntry[],
  filter: InboxFilter,
  now: number,
  toText: (m: Message) => string
): InboxEntry[] {
  const from = periodStart(filter.period, now)
  const terms = queryTerms(filter.query)
  const list = entries.filter(
    (e) =>
      e.status === filter.status &&
      (filter.source === 'all' || e.message.source === filter.source) &&
      e.message.createdAt >= from &&
      matchesQuery(e.message, terms, toText)
  )
  if (filter.status === 'snoozed') return list.sort((a, b) => (a.state?.until ?? 0) - (b.state?.until ?? 0))
  if (filter.status === 'done') return list.sort((a, b) => (b.state?.updatedAt ?? 0) - (a.state?.updatedAt ?? 0))
  return list.sort((a, b) => b.message.createdAt - a.message.createdAt)
}

/** 絞り込みが効いているか（空表示の文言と「条件をクリア」の表示に使う） */
export const isFiltering = (f: InboxFilter): boolean => f.source !== 'all' || f.period !== 'all' || f.query.trim() !== ''
