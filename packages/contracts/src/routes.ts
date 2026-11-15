import type { Source } from './types'

/**
 * 画面遷移の宛先。Feature（MFE）同士は互いを import せず、
 * この Route をシェルの navigate() に渡して遷移する。
 */
export interface Route {
  feature: string
  params?: Record<string, string | undefined>
}

export const FEATURE_IDS = {
  home: 'home',
  inbox: 'inbox',
  mail: 'mail',
  tasks: 'tasks',
  calendar: 'calendar',
  knowledge: 'knowledge',
  conversations: 'conversations',
  settings: 'settings'
} as const

export type FeatureId = (typeof FEATURE_IDS)[keyof typeof FEATURE_IDS]

/** 遷移先を組み立てるヘルパー。Feature 間リンクは必ずこれを使う */
export const routes = {
  home: (): Route => ({ feature: FEATURE_IDS.home }),
  inbox: (): Route => ({ feature: FEATURE_IDS.inbox }),
  mail: (): Route => ({ feature: FEATURE_IDS.mail }),
  tasks: (): Route => ({ feature: FEATURE_IDS.tasks }),
  calendar: (): Route => ({ feature: FEATURE_IDS.calendar }),
  knowledge: (): Route => ({ feature: FEATURE_IDS.knowledge }),
  settings: (): Route => ({ feature: FEATURE_IDS.settings }),
  conversations: (source: Source, conversationId?: string): Route => ({
    feature: FEATURE_IDS.conversations,
    params: { source, conversationId }
  })
}

/** entry.params のキーがすべて一致するか（ナビゲーションのアクティブ判定用） */
export function routeMatches(current: Route, entry: Route): boolean {
  if (current.feature !== entry.feature) return false
  return Object.entries(entry.params ?? {}).every(
    ([key, value]) => value === undefined || current.params?.[key] === value
  )
}
