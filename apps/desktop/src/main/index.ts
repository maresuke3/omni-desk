import { app, BrowserWindow, nativeTheme, powerMonitor, shell, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { applyTheme, registerIpc } from './ipc'
import { settings } from './settings'
import { StateHub } from './sync/hub'
import { InboxStateService } from './sync/inbox'
import { SyncManager } from './sync/manager'

const devServerUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined

/** IPC を受け付けるのは自分のレンダラーからだけ */
function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? ''
  if (devServerUrl && url.startsWith(devServerUrl)) return true
  return url.startsWith('file://')
}

function createWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1040,
    minHeight: 640,
    show: false,
    title: 'Omni Desk',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1115' : '#f5f6f8',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // 外部リンクはアプリ内で開かず既定のブラウザへ
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const internal = devServerUrl ? url.startsWith(devServerUrl) : url.startsWith('file://')
    if (!internal) {
      event.preventDefault()
      if (url.startsWith('https://')) void shell.openExternal(url)
    }
  })

  if (devServerUrl) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  app.setName('Omni Desk')
  void settings.init()
  applyTheme()

  // 同期エンジンはメインプロセスで動かし、結果を状態ハブ経由で画面に送る
  const hub = new StateHub(settings.toPublic())
  const inbox = new InboxStateService(hub)
  const sync = new SyncManager(hub, inbox)
  registerIpc(isTrustedSender, hub, sync, inbox)
  void sync.apply()
  // スリープから復帰したら、閉じていた間の差分を取り直す
  powerMonitor.on('resume', () => sync.resume())
  app.on('before-quit', () => {
    sync.dispose()
    inbox.save()
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
