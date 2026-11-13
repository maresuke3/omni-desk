import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  BlockedSender,
  ChatworkConnectionInfo,
  PublicSettings,
  SenderKey,
  SettingsPatch,
  SlackConnectionInfo,
  ThemePreference
} from '@omni-desk/contracts'
import { CHATWORK_DEMO_ACCOUNT_ID } from '@omni-desk/connector-chatwork'
import { AppError } from '@omni-desk/connector-core'
import { SLACK_DEMO_USER_ID } from '@omni-desk/connector-slack'
import { addBlockedSender, removeBlockedSender, sanitizeBlockedSenders } from './blocked-senders'

/**
 * 設定の永続化。トークン類は safeStorage（macOS はキーチェーン）で暗号化し、
 * 平文ではディスクに書かない。レンダラーにはトークンを一切返さない。
 */

interface StoredSlack extends SlackConnectionInfo {
  tokenEnc: string
  cookieEnc?: string
}

interface StoredChatwork extends ChatworkConnectionInfo {
  tokenEnc: string
}

interface StoredSettings {
  version: 1
  slack?: StoredSlack
  chatwork?: StoredChatwork
  refreshIntervalSec: number
  theme: ThemePreference
  demoMode: boolean
  /** 受信箱で非表示にする送信者（トークンではないので暗号化しない） */
  blockedSenders: BlockedSender[]
  /** 受信箱で対応済みにしたとき、サービス側も既読にするか */
  markReadOnDone: boolean
}

export interface SlackSecrets extends SlackConnectionInfo {
  token: string
  cookie?: string
}

export interface ChatworkSecrets extends ChatworkConnectionInfo {
  token: string
}

const DEFAULTS: StoredSettings = {
  version: 1,
  refreshIntervalSec: 120,
  theme: 'system',
  demoMode: false,
  blockedSenders: [],
  markReadOnDone: false
}

const REFRESH_CHOICES = [60, 120, 300, 600]

class SettingsStore {
  private cache: StoredSettings | null = null
  /** 確認が終わるまでは undefined（表示上は利用可能とみなし、暗号化処理だけ確認完了を待つ） */
  private encryptionAvailable: boolean | undefined
  private encryptionReady: Promise<boolean> | null = null

  /**
   * app の ready 後に呼ぶ。暗号化ストレージ（macOS はキーチェーン）の初期化を始める。
   * キーチェーンの許可ダイアログで待たされることがあるので、呼び出し側は await しない
   * （ウィンドウ表示をブロックしない）。
   */
  init(): Promise<boolean> {
    this.encryptionReady ??= safeStorage
      .isAsyncEncryptionAvailable()
      .catch((error: unknown) => {
        console.error('[settings] 暗号化ストレージを初期化できませんでした', error)
        return false
      })
      .then((available) => (this.encryptionAvailable = available))
    return this.encryptionReady
  }

  private get file(): string {
    return join(app.getPath('userData'), 'settings.json')
  }

  private load(): StoredSettings {
    if (this.cache) return this.cache
    try {
      if (existsSync(this.file)) {
        const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<StoredSettings>
        this.cache = {
          ...DEFAULTS,
          ...parsed,
          version: 1,
          blockedSenders: sanitizeBlockedSenders(parsed.blockedSenders)
        }
        return this.cache
      }
    } catch (error) {
      console.error('[settings] 読み込みに失敗したため初期値を使います', error)
    }
    this.cache = { ...DEFAULTS }
    return this.cache
  }

  private save(next: StoredSettings): void {
    this.cache = next
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 })
    renameSync(tmp, this.file)
  }

  private async encrypt(value: string): Promise<string> {
    if (!(await this.init())) {
      throw new AppError(
        'unsupported',
        'OS の暗号化ストレージが利用できないため、トークンを安全に保存できません。'
      )
    }
    return (await safeStorage.encryptStringAsync(value)).toString('base64')
  }

  /** 復号する。鍵のローテーションなどで再暗号化が必要と言われたら暗号文を更新する */
  private async decrypt(value: string, reEncrypt: (enc: string) => void): Promise<string> {
    await this.init()
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(value, 'base64'))
    if (shouldReEncrypt) reEncrypt(await this.encrypt(result))
    return result
  }

  toPublic(): PublicSettings {
    const s = this.load()
    const slack = s.slack ? stripSecrets(s.slack) : null
    const chatwork = s.chatwork ? stripSecrets(s.chatwork) : null
    const demoActive = s.demoMode || (!slack && !chatwork)
    return {
      slack,
      chatwork,
      refreshIntervalSec: s.refreshIntervalSec,
      theme: s.theme,
      demoMode: s.demoMode,
      demoActive,
      encryptionAvailable: this.encryptionAvailable ?? true,
      identity: demoActive
        ? { slackUserId: SLACK_DEMO_USER_ID, chatworkAccountId: CHATWORK_DEMO_ACCOUNT_ID }
        : { slackUserId: slack?.userId, chatworkAccountId: chatwork?.accountId },
      blockedSenders: s.blockedSenders.map((b) => ({ ...b })),
      markReadOnDone: s.markReadOnDone === true
    }
  }

  update(patch: SettingsPatch): PublicSettings {
    const s = this.load()
    const next: StoredSettings = { ...s }
    if (patch.theme && ['system', 'light', 'dark'].includes(patch.theme)) next.theme = patch.theme
    if (patch.refreshIntervalSec !== undefined) {
      if (!REFRESH_CHOICES.includes(patch.refreshIntervalSec)) {
        throw new AppError('invalid_input', '更新間隔の値が不正です')
      }
      next.refreshIntervalSec = patch.refreshIntervalSec
    }
    if (typeof patch.demoMode === 'boolean') next.demoMode = patch.demoMode
    if (typeof patch.markReadOnDone === 'boolean') next.markReadOnDone = patch.markReadOnDone
    this.save(next)
    return this.toPublic()
  }

  /** 検証済みの送信者を非表示リストに追加する（登録済みなら変更しない） */
  blockSender(sender: BlockedSender): PublicSettings {
    const s = this.load()
    this.save({ ...s, blockedSenders: addBlockedSender(s.blockedSenders, sender) })
    return this.toPublic()
  }

  unblockSender(key: SenderKey): PublicSettings {
    const s = this.load()
    this.save({ ...s, blockedSenders: removeBlockedSender(s.blockedSenders, key) })
    return this.toPublic()
  }

  async setSlack(info: SlackConnectionInfo, token: string, cookie?: string): Promise<void> {
    const slack: StoredSlack = {
      ...info,
      tokenEnc: await this.encrypt(token),
      cookieEnc: cookie ? await this.encrypt(cookie) : undefined
    }
    this.save({ ...this.load(), slack })
  }

  clearSlack(): void {
    const { slack: _removed, ...rest } = this.load()
    this.save({ ...rest })
  }

  async setChatwork(info: ChatworkConnectionInfo, token: string): Promise<void> {
    const tokenEnc = await this.encrypt(token)
    this.save({ ...this.load(), chatwork: { ...info, tokenEnc } })
  }

  clearChatwork(): void {
    const { chatwork: _removed, ...rest } = this.load()
    this.save({ ...rest })
  }

  async slackSecrets(): Promise<SlackSecrets | null> {
    const s = this.load().slack
    if (!s) return null
    const patchSlack = (patch: Partial<StoredSlack>): void => {
      const current = this.load().slack
      if (current) this.save({ ...this.load(), slack: { ...current, ...patch } })
    }
    return {
      ...stripSecrets(s),
      token: await this.decrypt(s.tokenEnc, (tokenEnc) => patchSlack({ tokenEnc })),
      cookie: s.cookieEnc ? await this.decrypt(s.cookieEnc, (cookieEnc) => patchSlack({ cookieEnc })) : undefined
    }
  }

  async chatworkSecrets(): Promise<ChatworkSecrets | null> {
    const c = this.load().chatwork
    if (!c) return null
    const token = await this.decrypt(c.tokenEnc, (tokenEnc) => {
      const current = this.load().chatwork
      if (current) this.save({ ...this.load(), chatwork: { ...current, tokenEnc } })
    })
    return { ...stripSecrets(c), token }
  }
}

function stripSecrets<T extends { tokenEnc: string; cookieEnc?: string }>(
  value: T
): Omit<T, 'tokenEnc' | 'cookieEnc'> {
  const { tokenEnc: _t, cookieEnc: _c, ...rest } = value
  return rest
}

export const settings = new SettingsStore()
