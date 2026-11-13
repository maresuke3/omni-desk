import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SyncStorage } from '@omni-desk/connector-core'

/**
 * 同期状態（自分宛てメッセージなど）の保存。顧客とのやり取りを含むので OS の暗号化ストレージで暗号化する。
 * 暗号化が使えない環境では保存しない（メモリ上だけで動かす）。
 */

const dir = (): string => join(app.getPath('userData'), 'sync')
const fileFor = (name: string): string => join(dir(), `${name.replace(/[^A-Za-z0-9_-]/g, '_')}.bin`)

export function encryptedFileStorage<T>(name: string, encryptionReady: () => Promise<boolean>): SyncStorage<T> {
  const file = fileFor(name)
  return {
    async load() {
      if (!(await encryptionReady()) || !existsSync(file)) return null
      const { result } = await safeStorage.decryptStringAsync(readFileSync(file))
      return JSON.parse(result) as T
    },
    async save(value) {
      if (!(await encryptionReady())) return
      const encrypted = await safeStorage.encryptStringAsync(JSON.stringify(value))
      mkdirSync(dir(), { recursive: true })
      const tmp = `${file}.tmp`
      writeFileSync(tmp, encrypted, { mode: 0o600 })
      renameSync(tmp, file)
    }
  }
}

/** 接続解除時に保存済みの同期状態を消す */
export function removeStoredState(name: string): void {
  const file = fileFor(name)
  if (existsSync(file)) rmSync(file)
}
