import { useEffect } from 'react'
import { X } from 'lucide-react'
import { actions, useAppStore } from '@omni-desk/client'
import { Alert, Box, Button, IconButton, Stack } from '@omni-desk/ui'

/** 画面下の通知。元に戻せる操作には「元に戻す（Z）」を出す。数秒で消える */
export function Toast() {
  const toast = useAppStore((s) => s.toast)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(actions.dismissToast, toast.tone === 'info' ? 6_000 : 10_000)
    return () => clearTimeout(timer)
  }, [toast])

  if (!toast) return null
  const severity = toast.tone === 'danger' ? 'error' : toast.tone === 'warning' ? 'warning' : 'success'

  return (
    <Box
      sx={{
        pointerEvents: 'none',
        position: 'absolute',
        insetInline: 0,
        bottom: 24,
        zIndex: 50,
        display: 'flex',
        justifyContent: 'center',
        px: 2
      }}
    >
      <Alert
        role="status"
        severity={severity}
        sx={{ pointerEvents: 'auto', maxWidth: 576, boxShadow: 3 }}
        action={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            {toast.undoable && (
              <Button size="sm" variant="ghost" onClick={() => void actions.undoInbox()}>
                元に戻す（Z）
              </Button>
            )}
            <IconButton label="閉じる" onClick={actions.dismissToast}>
              <X size={16} />
            </IconButton>
          </Stack>
        }
      >
        {toast.message}
      </Alert>
    </Box>
  )
}
