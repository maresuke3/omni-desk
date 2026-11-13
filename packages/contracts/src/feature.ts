import type { ComponentType } from 'react'
import type { Route } from './routes'

/**
 * Feature（マイクロフロントエンド）とシェルの契約。
 *
 * - Feature は FeatureModule を 1 つ export し、シェルがそれを登録して画面に配置する。
 * - Feature 同士は import しない。遷移は context.navigate(routes.xxx()) で行う。
 * - データは @omni-desk/client 経由で取得する（Feature 間で状態を直接共有しない）。
 */

export interface FeatureContext {
  route: Route
  navigate: (to: Route, options?: { replace?: boolean }) => void
}

export type NavSection = 'primary' | 'services' | 'footer'

export interface NavBadge {
  count: number
  tone?: 'accent' | 'danger' | 'muted'
}

export type NavStatus = 'connected' | 'demo' | 'off'

export interface NavEntry {
  id: string
  label: string
  section: NavSection
  /** 同じセクション内の並び順（小さいほど上） */
  order: number
  icon: ComponentType<{ className?: string }>
  route: Route
  /** バッジ件数を返すフック（シェルが毎レンダー呼ぶ） */
  useBadge?: () => NavBadge | undefined
  /** 接続状態のインジケーターを返すフック */
  useStatus?: () => NavStatus | undefined
  /** 準備中などで押せない項目 */
  disabled?: boolean
  tag?: string
}

export interface FeatureModule {
  /** Route.feature と一致させる */
  id: string
  /** サイドバーに出す項目（0 個でもよい） */
  nav: NavEntry[]
  /** 画面本体。React.lazy で遅延読み込みしてよい */
  View: ComponentType<FeatureContext>
}
