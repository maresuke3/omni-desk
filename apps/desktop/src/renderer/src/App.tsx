import { Suspense, useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import { actions, useAppStore } from '@omni-desk/client'
import { routes, type Route } from '@omni-desk/contracts'
import { Button, SkeletonList } from '@omni-desk/ui'
import { FeatureBoundary } from './FeatureBoundary'
import { features } from './features'
import { Sidebar } from './Sidebar'

const navigate = (to: Route): void => actions.navigate(to)

/** テーマ設定を <html class="dark"> に反映する */
function useThemeClass(): void {
  const theme = useAppStore((s) => s.settings?.theme ?? 'system')
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}

function DemoBanner({ onOpenSettings }: { onOpenSettings: () => void }) {
  const settings = useAppStore((s) => s.settings)
  if (!settings?.demoActive) return null
  const noneConnected = !settings.slack && !settings.chatwork
  return (
    <div className="drag flex shrink-0 items-center gap-2.5 border-b border-warning/25 bg-warning-soft px-5 py-2 text-[12.5px]">
      <Sparkles className="size-4 shrink-0 text-warning" />
      <p className="flex-1 text-fg">
        <b>デモデータを表示中</b>
        <span className="text-fg-muted">
          {noneConnected
            ? ' — 設定から Slack / Chatwork を接続すると実際のデータに切り替わります'
            : ' — 設定でデモ表示がオンになっています'}
        </span>
      </p>
      {noneConnected ? (
        <Button size="sm" onClick={onOpenSettings}>
          接続する
        </Button>
      ) : (
        <Button size="sm" onClick={() => void actions.updateSettings({ demoMode: false })}>
          実データに戻す
        </Button>
      )}
    </div>
  )
}

/**
 * シェル。レイアウト・ナビゲーション・テーマ・エラー境界だけを持ち、
 * 画面の中身は各 Feature（MFE）に任せる。
 */
export function App() {
  const hydrated = useAppStore((s) => s.hydrated)
  const route = useAppStore((s) => s.ui.route)
  useThemeClass()

  // メインプロセスから初期状態が届くまでは何も描画しない（通常は一瞬）
  if (!hydrated) return <div className="h-full bg-canvas" />

  const feature = features.find((f) => f.id === route.feature) ?? features[0]
  const View = feature.View

  return (
    <div className="flex h-full">
      <Sidebar features={features} route={route} navigate={navigate} />
      <main className="flex min-w-0 flex-1 flex-col bg-canvas">
        <DemoBanner onOpenSettings={() => navigate(routes.settings())} />
        <div key={feature.id} className="animate-fade-in min-h-0 flex-1">
          <FeatureBoundary featureId={feature.id}>
            <Suspense
              fallback={
                <div className="p-8">
                  <SkeletonList rows={6} />
                </div>
              }
            >
              <View route={route} navigate={navigate} />
            </Suspense>
          </FeatureBoundary>
        </div>
      </main>
    </div>
  )
}
