import { shell } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'

const WSL_RUNDLL32 = '/mnt/c/Windows/System32/rundll32.exe'

/**
 * 外部ブラウザで URL を開く（http/https のみ）。
 * WSL2 環境では xdg-open が無いことが多いため、Windows 側の既定ブラウザで開く。
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return
  if (process.platform === 'linux' && process.env.WSL_DISTRO_NAME && existsSync(WSL_RUNDLL32)) {
    await new Promise<void>((resolve, reject) => {
      execFile(WSL_RUNDLL32, ['url.dll,FileProtocolHandler', url], (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    return
  }
  await shell.openExternal(url)
}
