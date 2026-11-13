import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// ワークスペースのパッケージは TypeScript ソースのまま参照し、ここでまとめてバンドルする
// （ビルド時統合）。依存はすべて devDependencies に置いているので main/preload にも同梱される。
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      // Feature ごとに React / ストアのインスタンスが分かれないよう 1 つに揃える
      dedupe: ['react', 'react-dom', 'zustand']
    }
  }
})
