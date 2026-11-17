import { Suspense, useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { actions, useAppStore } from '@omni-desk/client'
import { routes, type Route } from '@omni-desk/contracts'
import { AppThemeProvider, Box, Button, SkeletonList, Stack, Typography, type ColorMode } from '@omni-desk/ui'
import { FeatureBoundary } from './FeatureBoundary'
import { features } from './features'
import { Sidebar } from './Sidebar'

const navigate = (to: Route): void => actions.navigate(to)

/** テーマ設定からライト/ダークモードを解決し <html class="dark"> とも同期する */
function useColorMode(): ColorMode {
  const theme = useAppStore((s) => s.settings?.theme ?? 'system')
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemDark(media.matches)
    const onChange = (): void => setSystemDark(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const mode: ColorMode = theme === 'dark' || (theme === 'system' && systemDark) ? 'dark' : 'light'

  useEffect(() => {
    document.documentElement.classList.toggle('dark', mode === 'dark')
  }, [mode])

  return mode
}

function DemoBanner({ onOpenSettings }: { onOpenSettings: () => void }) {
  const settings = useAppStore((s) => s.settings)
  if (!settings?.demoActive) return null
  const noneConnected = !settings.slack && !settings.chatwork
  return (
    <Stack
      direction="row"
      spacing={2}
      className="drag"
      sx={(theme) => ({
        flexShrink: 0,
        alignItems: 'center',
        borderBottom: `1px solid ${theme.palette.divider}`,
        bgcolor: theme.palette.mode === 'dark' ? 'rgba(240, 169, 59, 0.14)' : '#fff4e0',
        px: 3,
        py: 1
      })}
    >
      <Sparkles size={16} color="#b86e00" />
      <Typography variant="body2" sx={{ flex: 1, fontSize: '12px' }}>
        <strong>デモデータを表示中</strong>
        <Box component="span" sx={{ color: 'text.secondary' }}>
          {noneConnected
            ? ' — 設定から Slack / Chatwork を接続すると実際のデータに切り替わります'
            : ' — 設定でデモ表示がオンになっています'}
        </Box>
      </Typography>
      {noneConnected ? (
        <Button size="sm" onClick={onOpenSettings}>
          接続する
        </Button>
      ) : (
        <Button size="sm" onClick={() => void actions.updateSettings({ demoMode: false })}>
          実データに戻す
        </Button>
      )}
    </Stack>
  )
}

/**
 * シェル。レイアウト・ナビゲーション・テーマ・エラー境界だけを持ち、
 * 画面の中身は各 Feature（MFE）に任せる。
 */
export function App() {
  const hydrated = useAppStore((s) => s.hydrated)
  const route = useAppStore((s) => s.ui.route)
  const mode = useColorMode()

  const feature = features.find((f) => f.id === route.feature) ?? features[0]
  const View = feature.View

  return (
    <AppThemeProvider mode={mode}>
      {!hydrated ? (
        <Box sx={{ height: '100%', bgcolor: 'background.default' }} />
      ) : (
        <Stack direction="row" sx={{ height: '100%' }}>
          <Sidebar features={features} route={route} mode={mode} navigate={navigate} />
          <Stack component="main" sx={{ minWidth: 0, flex: 1, bgcolor: 'background.default' }}>
            <DemoBanner onOpenSettings={() => navigate(routes.settings())} />
            <Box key={feature.id} sx={{ minHeight: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <FeatureBoundary featureId={feature.id}>
                <Suspense
                  fallback={
                    <Box sx={{ p: 4 }}>
                      <SkeletonList rows={6} />
                    </Box>
                  }
                >
                  <View route={route} navigate={navigate} />
                </Suspense>
              </FeatureBoundary>
            </Box>
          </Stack>
        </Stack>
      )}
    </AppThemeProvider>
  )
}
