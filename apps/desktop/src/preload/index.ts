import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  API_CHANNELS,
  STATE_PATCH_CHANNEL,
  type ApiChannel,
  type DashboardBridge,
  type StateEvent
} from '@omni-desk/contracts'

const allowed = new Set<string>(API_CHANNELS)

const bridge: DashboardBridge = {
  platform: process.platform,
  invoke(channel: ApiChannel, ...args: unknown[]) {
    if (!allowed.has(channel)) {
      return Promise.resolve({
        ok: false as const,
        error: { code: 'invalid_input' as const, message: `Unknown channel: ${channel}` }
      })
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  // イベントオブジェクト（sender などを含む）はレンダラーに渡さず、差分だけを渡す
  subscribe(listener: (event: StateEvent) => void) {
    const handler = (_event: IpcRendererEvent, state: StateEvent): void => listener(state)
    ipcRenderer.on(STATE_PATCH_CHANNEL, handler)
    return () => {
      ipcRenderer.removeListener(STATE_PATCH_CHANNEL, handler)
    }
  }
} as DashboardBridge

contextBridge.exposeInMainWorld('dashboard', bridge)
