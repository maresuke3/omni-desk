import { useEffect } from 'react'
import { CircleAlert, CircleCheck, X } from 'lucide-react'
import { actions, useAppStore } from '@omni-desk/client'
import { cn, IconButton } from '@omni-desk/ui'

/** 画面下の通知。元に戻せる操作には「元に戻す（Z）」を出す。数秒で消える */
export function Toast() {
  const toast = useAppStore((s) => s.toast)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(actions.dismissToast, toast.tone === 'info' ? 6_000 : 10_000)
    return () => clearTimeout(timer)
  }, [toast])

  if (!toast) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-50 flex justify-center px-4">
      <div
        role="status"
        className={cn(
          'animate-fade-in pointer-events-auto flex max-w-xl items-center gap-2.5 rounded-xl border px-3.5 py-2 text-[12.5px] shadow-pop',
          toast.tone === 'info' && 'border-line bg-fg text-canvas',
          toast.tone === 'warning' && 'border-warning/30 bg-warning-soft text-fg',
          toast.tone === 'danger' && 'border-danger/30 bg-danger-soft text-fg'
        )}
      >
        {toast.tone === 'info' ? (
          <CircleCheck className="size-4 shrink-0 opacity-80" />
        ) : (
          <CircleAlert className={cn('size-4 shrink-0', toast.tone === 'warning' ? 'text-warning' : 'text-danger')} />
        )}
        <span className="min-w-0 flex-1">{toast.message}</span>
        {toast.undoable && (
          <button onClick={() => void actions.undoInbox()} className="shrink-0 rounded-md px-2 py-0.5 font-semibold underline-offset-2 hover:underline">
            元に戻す（Z）
          </button>
        )}
        <IconButton label="閉じる" onClick={actions.dismissToast} className={cn('size-6', toast.tone === 'info' && 'text-canvas/70 hover:bg-white/10 hover:text-canvas')}>
          <X className="size-3.5" />
        </IconButton>
      </div>
    </div>
  )
}
