import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initStore } from '@omni-desk/client'
import { App } from './App'

// 中央ストアをメインプロセスの状態で初期化してから描画する（差分の購読もここで始まる）
void initStore().catch((error) => console.error('[store] 初期化に失敗しました', error))

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)
