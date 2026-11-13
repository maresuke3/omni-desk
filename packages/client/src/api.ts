import type { ApiArgs, ApiChannel, ApiReturn, DashboardBridge, ErrorCode } from '@omni-desk/contracts'

declare global {
  interface Window {
    /** preload が contextBridge で公開する唯一の API */
    dashboard: DashboardBridge
  }
}

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** IPC を呼び、失敗時は ApiError を投げる */
export async function call<C extends ApiChannel>(channel: C, ...args: ApiArgs<C>): Promise<ApiReturn<C>> {
  const result = await window.dashboard.invoke(channel, ...args)
  if (!result.ok) throw new ApiError(result.error.code, result.error.message)
  return result.data
}

export function openExternal(url: string | undefined): void {
  if (!url) return
  call('app:open-external', url).catch((error) => console.error(error))
}

export const isMac = (): boolean => window.dashboard?.platform === 'darwin'
