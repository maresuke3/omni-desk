import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// 配布ビルド時（環境変数が渡された場合のみ）メインプロセスへ OAuth 既定値を埋め込む
const mainDefine: Record<string, string> = {}
if (process.env.OMNI_GOOGLE_CLIENT_ID) {
  mainDefine['process.env.OMNI_GOOGLE_CLIENT_ID'] = JSON.stringify(process.env.OMNI_GOOGLE_CLIENT_ID)
}
if (process.env.OMNI_GOOGLE_CLIENT_SECRET) {
  mainDefine['process.env.OMNI_GOOGLE_CLIENT_SECRET'] = JSON.stringify(process.env.OMNI_GOOGLE_CLIENT_SECRET)
}

// ワークスペースのパッケージは TypeScript ソースのまま参照し、ここでまとめてバンドルする
// （ビルド時統合）。依存はすべて devDependencies に置いているので main/preload にも同梱される。
export default defineConfig({
  main: {
    define: mainDefine
  },
  preload: {},
  renderer: {
    plugins: [react()],
    resolve: {
      // Feature ごとに React / ストア / Emotion のインスタンスが分かれないよう 1 つに揃える
      dedupe: ['react', 'react-dom', 'zustand', '@emotion/react', '@emotion/styled']
    }
  }
})
