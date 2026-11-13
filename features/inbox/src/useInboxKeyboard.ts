import { useEffect, useRef } from 'react'

export interface InboxKeyHandlers {
  next: () => void
  prev: () => void
  done: () => void
  reopen: () => void
  snooze: () => void
  reply: () => void
  open: () => void
  undo: () => void
  focusSearch: () => void
  switchTab: (index: number) => void
  toggleHelp: () => void
  escape: () => void
}

/** 入力欄で打っている文字はショートカットとして扱わない */
const isTyping = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/**
 * 受信箱のキーボード操作。
 * j/k・↓/↑: 移動　e: 対応済み　u: 未対応に戻す　s: あとで　r: 返信　o/Enter: 会話を開く
 * z: 元に戻す　/: 検索　1〜3: タブ切り替え　?: 一覧　Esc: 閉じる
 */
export function useInboxKeyboard(handlers: InboxKeyHandlers): void {
  // 毎回の描画で最新のハンドラーを参照する（リスナーは 1 回だけ登録する）
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const h = ref.current
      if (e.key === 'Escape') {
        h.escape()
        if (isTyping(e.target)) (e.target as HTMLElement).blur()
        return
      }
      if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return

      const map: Record<string, () => void> = {
        j: h.next,
        ArrowDown: h.next,
        k: h.prev,
        ArrowUp: h.prev,
        e: h.done,
        u: h.reopen,
        s: h.snooze,
        r: h.reply,
        o: h.open,
        Enter: h.open,
        z: h.undo,
        '/': h.focusSearch,
        '?': h.toggleHelp,
        '1': () => h.switchTab(0),
        '2': () => h.switchTab(1),
        '3': () => h.switchTab(2)
      }
      const action = map[e.key]
      if (!action) return
      e.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
