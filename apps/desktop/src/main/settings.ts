import { app, safeStorage } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  AtlassianConnectionInfo,
  BlockedSender,
  ChatworkConnectionInfo,
  GitHubConnectionInfo,
  GoogleAccountInfo,
  GoogleCalendarConnectionInfo,
  MailAccountInfo,
  NotionConnectionInfo,
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
import { getGitHubOAuthDefaults, getGoogleOAuthDefaults } from './oauth-defaults'

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

interface StoredGitHub extends GitHubConnectionInfo {
  tokenEnc: string
}

interface StoredNotion extends NotionConnectionInfo {
  tokenEnc: string
}

interface StoredGoogleCalendar extends GoogleCalendarConnectionInfo {
  accessTokenEnc: string
  refreshTokenEnc?: string
  clientIdEnc?: string
  clientSecretEnc?: string
  expiresAt?: number
}

interface StoredMailAccount extends MailAccountInfo {
  accessTokenEnc: string
  refreshTokenEnc?: string
  clientIdEnc?: string
  clientSecretEnc?: string
  expiresAt?: number
}

interface StoredGoogleAccount extends GoogleAccountInfo {
  accessTokenEnc: string
  refreshTokenEnc?: string
  clientIdEnc?: string
  clientSecretEnc?: string
  expiresAt?: number
}

interface StoredSettings {
  version: 1
  /** 後方互換用（読み込み時に slackWorkspaces へ移行） */
  slack?: StoredSlack
  slackWorkspaces?: StoredSlack[]
  chatwork?: StoredChatwork
  /** 後方互換用（読み込み時に githubAccounts へ移行） */
  github?: StoredGitHub
  githubAccounts?: StoredGitHub[]
  atlassian?: AtlassianConnectionInfo
  notion?: StoredNotion
  /** 後方互換用（読み込み時に googleAccounts へ移行） */
  googleCalendar?: StoredGoogleCalendar
  googleAccounts?: StoredGoogleAccount[]
  mailAccounts?: StoredMailAccount[]
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

  private listStoredSlack(s = this.load()): StoredSlack[] {
    if (s.slackWorkspaces && s.slackWorkspaces.length > 0) return s.slackWorkspaces
    return s.slack ? [s.slack] : []
  }

  private listStoredGitHub(s = this.load()): StoredGitHub[] {
    if (s.githubAccounts && s.githubAccounts.length > 0) return s.githubAccounts
    return s.github ? [s.github] : []
  }

  private listStoredGoogleAccounts(s = this.load()): StoredGoogleAccount[] {
    if (s.googleAccounts && s.googleAccounts.length > 0) return s.googleAccounts
    const map = new Map<string, StoredGoogleAccount>()
    for (const m of s.mailAccounts ?? []) {
      if (m.provider !== 'google') continue
      map.set(m.email, {
        id: m.id,
        email: m.email,
        name: m.name,
        avatarUrl: m.avatarUrl,
        label: m.label,
        accessTokenEnc: m.accessTokenEnc,
        refreshTokenEnc: m.refreshTokenEnc,
        clientIdEnc: m.clientIdEnc,
        clientSecretEnc: m.clientSecretEnc,
        expiresAt: m.expiresAt
      })
    }
    if (s.googleCalendar && !map.has(s.googleCalendar.email)) {
      const g = s.googleCalendar
      map.set(g.email, {
        id: `google:${g.email}`,
        email: g.email,
        name: g.name,
        avatarUrl: g.avatarUrl,
        accessTokenEnc: g.accessTokenEnc,
        refreshTokenEnc: g.refreshTokenEnc,
        clientIdEnc: g.clientIdEnc,
        clientSecretEnc: g.clientSecretEnc,
        expiresAt: g.expiresAt
      })
    }
    return [...map.values()]
  }

  toPublic(): PublicSettings {
    const s = this.load()
    const slackWorkspaces = this.listStoredSlack(s).map((w) => stripSecrets(w))
    const slack = slackWorkspaces[0] ?? null
    const chatwork = s.chatwork ? stripSecrets(s.chatwork) : null
    const githubAccounts = this.listStoredGitHub(s).map((g) => stripSecrets(g))
    const github = githubAccounts[0] ?? null
    const atlassian = s.atlassian ? { ...s.atlassian } : null
    const notion = s.notion ? stripSecrets(s.notion) : null
    const googleAccounts: GoogleAccountInfo[] = this.listStoredGoogleAccounts(s).map((g) => ({
      id: g.id,
      email: g.email,
      name: g.name,
      avatarUrl: g.avatarUrl,
      label: g.label
    }))
    const googleCalendar = googleAccounts[0]
      ? { email: googleAccounts[0].email, name: googleAccounts[0].name, avatarUrl: googleAccounts[0].avatarUrl }
      : null
    const nonGoogleMails: MailAccountInfo[] = (s.mailAccounts ?? [])
      .filter((m) => m.provider !== 'google')
      .map((m) => ({
        id: m.id,
        provider: m.provider,
        email: m.email,
        name: m.name,
        avatarUrl: m.avatarUrl,
        label: m.label
      }))
    const mailAccounts: MailAccountInfo[] = [
      ...googleAccounts.map((g) => ({
        id: g.id,
        provider: 'google' as const,
        email: g.email,
        name: g.name,
        avatarUrl: g.avatarUrl,
        label: g.label
      })),
      ...nonGoogleMails
    ]
    const demoActive = s.demoMode || (slackWorkspaces.length === 0 && !chatwork)
    return {
      slack,
      slackWorkspaces,
      chatwork,
      github,
      githubAccounts,
      atlassian,
      notion,
      googleCalendar,
      googleAccounts,
      mailAccounts,
      googleOAuthConfigured: Boolean(getGoogleOAuthDefaults().clientId),
      githubOAuthConfigured: Boolean(getGitHubOAuthDefaults().clientId && getGitHubOAuthDefaults().clientSecret),
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
    const entry: StoredSlack = {
      ...info,
      tokenEnc: await this.encrypt(token),
      cookieEnc: cookie ? await this.encrypt(cookie) : undefined
    }
    const current = this.load()
    const list = this.listStoredSlack(current).filter((w) => w.teamUrl !== info.teamUrl)
    list.push(entry)
    const { slack: _legacy, ...rest } = current
    this.save({ ...rest, slackWorkspaces: list })
  }

  clearSlack(teamUrl?: string): void {
    const current = this.load()
    const { slack: _legacy, ...rest } = current
    if (!teamUrl) {
      this.save({ ...rest, slackWorkspaces: [] })
      return
    }
    const list = this.listStoredSlack(current).filter((w) => w.teamUrl !== teamUrl)
    this.save({ ...rest, slackWorkspaces: list })
  }

  async setChatwork(info: ChatworkConnectionInfo, token: string): Promise<void> {
    const tokenEnc = await this.encrypt(token)
    this.save({ ...this.load(), chatwork: { ...info, tokenEnc } })
  }

  clearChatwork(): void {
    const { chatwork: _removed, ...rest } = this.load()
    this.save({ ...rest })
  }

  async setGitHub(info: GitHubConnectionInfo, token: string): Promise<void> {
    const tokenEnc = await this.encrypt(token)
    const entry: StoredGitHub = {
      ...info,
      id: info.id ?? randomUUID(),
      label: info.label?.trim() || undefined,
      tokenEnc
    }
    const current = this.load()
    const existing = this.listStoredGitHub(current)
    // 同一トークンが既にあれば差し替え、別トークンなら同一 @login でも追加できるようにする
    const kept: StoredGitHub[] = []
    for (const g of existing) {
      const dec = await this.decrypt(g.tokenEnc, () => {}).catch(() => null)
      if (dec !== token) kept.push(g)
    }
    kept.push(entry)
    const { github: _legacy, ...rest } = current
    this.save({ ...rest, githubAccounts: kept })
  }

  clearGitHub(accountId?: string): void {
    const current = this.load()
    const { github: _legacy, ...rest } = current
    if (!accountId) {
      this.save({ ...rest, githubAccounts: [] })
      return
    }
    const list = this.listStoredGitHub(current).filter((g) => (g.id ?? g.login) !== accountId)
    this.save({ ...rest, githubAccounts: list })
  }

  setAtlassian(info: AtlassianConnectionInfo): void {
    this.save({ ...this.load(), atlassian: info })
  }

  clearAtlassian(): void {
    const { atlassian: _removed, ...rest } = this.load()
    this.save({ ...rest })
  }

  async setNotion(info: NotionConnectionInfo, token: string): Promise<void> {
    const tokenEnc = await this.encrypt(token)
    this.save({ ...this.load(), notion: { ...info, tokenEnc } })
  }

  clearNotion(): void {
    const { notion: _removed, ...rest } = this.load()
    this.save({ ...rest })
  }

  async slackSecretsList(): Promise<SlackSecrets[]> {
    const list = this.listStoredSlack()
    return Promise.all(
      list.map(async (s) => {
        const patchSlack = (patch: Partial<StoredSlack>): void => {
          const current = this.load()
          const updated = this.listStoredSlack(current).map((w) =>
            w.teamUrl === s.teamUrl ? { ...w, ...patch } : w
          )
          const { slack: _legacy, ...rest } = current
          this.save({ ...rest, slackWorkspaces: updated })
        }
        return {
          ...stripSecrets(s),
          token: await this.decrypt(s.tokenEnc, (tokenEnc) => patchSlack({ tokenEnc })),
          cookie: s.cookieEnc ? await this.decrypt(s.cookieEnc, (cookieEnc) => patchSlack({ cookieEnc })) : undefined
        }
      })
    )
  }

  async slackSecrets(): Promise<SlackSecrets | null> {
    const list = await this.slackSecretsList()
    return list[0] ?? null
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

  async githubTokens(): Promise<string[]> {
    const list = this.listStoredGitHub()
    return Promise.all(
      list.map((g, idx) =>
        this.decrypt(g.tokenEnc, (tokenEnc) => {
          const current = this.load()
          const updated = this.listStoredGitHub(current).map((item, i) =>
            (g.id ? item.id === g.id : i === idx) ? { ...item, tokenEnc } : item
          )
          const { github: _legacy, ...rest } = current
          this.save({ ...rest, githubAccounts: updated })
        })
      )
    )
  }

  atlassianConfig(): AtlassianConnectionInfo | null {
    return this.load().atlassian ? { ...this.load().atlassian! } : null
  }

  async notionToken(): Promise<string | null> {
    const n = this.load().notion
    if (!n) return null
    return this.decrypt(n.tokenEnc, (tokenEnc) => {
      const current = this.load().notion
      if (current) this.save({ ...this.load(), notion: { ...current, tokenEnc } })
    })
  }

  async setGoogleCalendar(
    info: GoogleCalendarConnectionInfo,
    secrets: { accessToken: string; refreshToken?: string; clientId: string; clientSecret?: string; expiresAt?: number }
  ): Promise<PublicSettings> {
    const existing = this.load().googleCalendar
    const accessTokenEnc = await this.encrypt(secrets.accessToken)
    const refreshTokenEnc = secrets.refreshToken
      ? await this.encrypt(secrets.refreshToken)
      : existing?.refreshTokenEnc
    const clientIdEnc = await this.encrypt(secrets.clientId)
    const clientSecretEnc = secrets.clientSecret?.trim()
      ? await this.encrypt(secrets.clientSecret.trim())
      : undefined
    this.save({
      ...this.load(),
      googleCalendar: {
        ...info,
        accessTokenEnc,
        refreshTokenEnc,
        clientIdEnc,
        clientSecretEnc,
        expiresAt: secrets.expiresAt
      }
    })
    return this.toPublic()
  }

  async updateGoogleCalendarAccessToken(accessToken: string, expiresAt: number): Promise<void> {
    const current = this.load().googleCalendar
    if (!current) return
    const accessTokenEnc = await this.encrypt(accessToken)
    this.save({ ...this.load(), googleCalendar: { ...current, accessTokenEnc, expiresAt } })
  }

  clearGoogleCalendar(): PublicSettings {
    const { googleCalendar: _removed, ...rest } = this.load()
    this.save(rest)
    return this.toPublic()
  }

  async googleCalendarSecrets(): Promise<{
    accessToken: string
    refreshToken?: string
    clientId?: string
    clientSecret?: string
    expiresAt?: number
  } | null> {
    const g = this.load().googleCalendar
    if (!g) return null
    const accessToken = await this.decrypt(g.accessTokenEnc, (accessTokenEnc) => {
      const current = this.load().googleCalendar
      if (current) this.save({ ...this.load(), googleCalendar: { ...current, accessTokenEnc } })
    })
    const refreshToken = g.refreshTokenEnc
      ? await this.decrypt(g.refreshTokenEnc, (refreshTokenEnc) => {
          const current = this.load().googleCalendar
          if (current) this.save({ ...this.load(), googleCalendar: { ...current, refreshTokenEnc } })
        })
      : undefined
    const clientId = g.clientIdEnc
      ? await this.decrypt(g.clientIdEnc, (clientIdEnc) => {
          const current = this.load().googleCalendar
          if (current) this.save({ ...this.load(), googleCalendar: { ...current, clientIdEnc } })
        })
      : undefined
    const clientSecret = g.clientSecretEnc
      ? await this.decrypt(g.clientSecretEnc, (clientSecretEnc) => {
          const current = this.load().googleCalendar
          if (current) this.save({ ...this.load(), googleCalendar: { ...current, clientSecretEnc } })
        })
      : undefined
    return { accessToken, refreshToken, clientId, clientSecret, expiresAt: g.expiresAt }
  }

  async addGoogleAccount(
    info: GoogleAccountInfo,
    secrets: { accessToken: string; refreshToken?: string; clientId: string; clientSecret?: string; expiresAt?: number }
  ): Promise<PublicSettings> {
    const current = this.load()
    const list = this.listStoredGoogleAccounts(current)
    const existing = list.find((g) => g.id === info.id || g.email === info.email)
    const accessTokenEnc = await this.encrypt(secrets.accessToken)
    const refreshTokenEnc = secrets.refreshToken
      ? await this.encrypt(secrets.refreshToken)
      : existing?.refreshTokenEnc
    const clientIdEnc = await this.encrypt(secrets.clientId)
    const clientSecretEnc = secrets.clientSecret?.trim()
      ? await this.encrypt(secrets.clientSecret.trim())
      : undefined
    const nextEntry: StoredGoogleAccount = {
      ...info,
      label: info.label?.trim() || existing?.label || undefined,
      accessTokenEnc,
      refreshTokenEnc,
      clientIdEnc,
      clientSecretEnc,
      expiresAt: secrets.expiresAt
    }
    const nextList = [...list.filter((g) => g.id !== info.id && g.email !== info.email), nextEntry]
    const { googleCalendar: _legacyCal, ...rest } = current
    const nonGoogleMails = (current.mailAccounts ?? []).filter((m) => m.provider !== 'google')
    this.save({ ...rest, googleAccounts: nextList, mailAccounts: nonGoogleMails })
    return this.toPublic()
  }

  async updateGoogleAccountAccessToken(accountId: string, accessToken: string, expiresAt: number): Promise<void> {
    const current = this.load()
    const list = this.listStoredGoogleAccounts(current)
    if (!list.some((g) => g.id === accountId)) return
    const accessTokenEnc = await this.encrypt(accessToken)
    const nextList = list.map((g) => (g.id === accountId ? { ...g, accessTokenEnc, expiresAt } : g))
    const { googleCalendar: _legacyCal, ...rest } = current
    this.save({ ...rest, googleAccounts: nextList })
  }

  clearGoogleAccount(accountId?: string): PublicSettings {
    const current = this.load()
    const { googleCalendar: _legacyCal, ...rest } = current
    const nonGoogleMails = (current.mailAccounts ?? []).filter((m) => m.provider !== 'google')
    if (!accountId) {
      this.save({ ...rest, googleAccounts: [], mailAccounts: nonGoogleMails })
      return this.toPublic()
    }
    const nextList = this.listStoredGoogleAccounts(current).filter(
      (g) => g.id !== accountId && g.email !== accountId
    )
    this.save({ ...rest, googleAccounts: nextList, mailAccounts: nonGoogleMails })
    return this.toPublic()
  }

  async googleAccountSecretsList(): Promise<
    Array<{
      account: GoogleAccountInfo
      accessToken: string
      refreshToken?: string
      clientId?: string
      clientSecret?: string
      expiresAt?: number
    }>
  > {
    const list = this.listStoredGoogleAccounts()
    return Promise.all(
      list.map(async (g) => {
        const patchGoogle = (patch: Partial<StoredGoogleAccount>): void => {
          const current = this.load()
          const updated = this.listStoredGoogleAccounts(current).map((item) =>
            item.id === g.id ? { ...item, ...patch } : item
          )
          const { googleCalendar: _legacyCal, ...rest } = current
          this.save({ ...rest, googleAccounts: updated })
        }
        const accessToken = await this.decrypt(g.accessTokenEnc, (accessTokenEnc) => patchGoogle({ accessTokenEnc }))
        const refreshToken = g.refreshTokenEnc
          ? await this.decrypt(g.refreshTokenEnc, (refreshTokenEnc) => patchGoogle({ refreshTokenEnc }))
          : undefined
        const clientId = g.clientIdEnc
          ? await this.decrypt(g.clientIdEnc, (clientIdEnc) => patchGoogle({ clientIdEnc }))
          : undefined
        const clientSecret = g.clientSecretEnc
          ? await this.decrypt(g.clientSecretEnc, (clientSecretEnc) => patchGoogle({ clientSecretEnc }))
          : undefined
        return {
          account: {
            id: g.id,
            email: g.email,
            name: g.name,
            avatarUrl: g.avatarUrl,
            label: g.label
          },
          accessToken,
          refreshToken,
          clientId,
          clientSecret,
          expiresAt: g.expiresAt
        }
      })
    )
  }

  async addMailAccount(
    info: MailAccountInfo,
    secrets: { accessToken: string; refreshToken?: string; clientId: string; clientSecret?: string; expiresAt?: number }
  ): Promise<PublicSettings> {
    const current = this.load()
    const list = current.mailAccounts ?? []
    const existing = list.find((m) => m.id === info.id)
    const accessTokenEnc = await this.encrypt(secrets.accessToken)
    const refreshTokenEnc = secrets.refreshToken
      ? await this.encrypt(secrets.refreshToken)
      : existing?.refreshTokenEnc
    const clientIdEnc = await this.encrypt(secrets.clientId)
    const clientSecretEnc = secrets.clientSecret?.trim()
      ? await this.encrypt(secrets.clientSecret.trim())
      : undefined
    const nextEntry: StoredMailAccount = {
      ...info,
      label: info.label?.trim() || undefined,
      accessTokenEnc,
      refreshTokenEnc,
      clientIdEnc,
      clientSecretEnc,
      expiresAt: secrets.expiresAt
    }
    const nextList = [...list.filter((m) => m.id !== info.id), nextEntry]
    this.save({ ...current, mailAccounts: nextList })
    return this.toPublic()
  }

  async updateMailAccessToken(accountId: string, accessToken: string, expiresAt: number): Promise<void> {
    await this.updateGoogleAccountAccessToken(accountId, accessToken, expiresAt)
    const current = this.load()
    const list = current.mailAccounts ?? []
    if (!list.some((m) => m.id === accountId)) return
    const accessTokenEnc = await this.encrypt(accessToken)
    const nextList = list.map((m) => (m.id === accountId ? { ...m, accessTokenEnc, expiresAt } : m))
    this.save({ ...current, mailAccounts: nextList })
  }

  clearMailAccount(accountId?: string): PublicSettings {
    if (!accountId) {
      this.clearGoogleAccount()
      return this.toPublic()
    }
    if (accountId.startsWith('google:')) {
      return this.clearGoogleAccount(accountId)
    }
    const current = this.load()
    const nextList = (current.mailAccounts ?? []).filter((m) => m.id !== accountId)
    this.save({ ...current, mailAccounts: nextList })
    return this.toPublic()
  }

  async mailAccountSecretsList(): Promise<
    Array<{
      account: MailAccountInfo
      accessToken: string
      refreshToken?: string
      clientId?: string
      clientSecret?: string
      expiresAt?: number
    }>
  > {
    const googleSecrets = await this.googleAccountSecretsList()
    const googleMailEntries = googleSecrets.map((g) => ({
      account: {
        id: g.account.id,
        provider: 'google' as const,
        email: g.account.email,
        name: g.account.name,
        avatarUrl: g.account.avatarUrl,
        label: g.account.label
      },
      accessToken: g.accessToken,
      refreshToken: g.refreshToken,
      clientId: g.clientId,
      clientSecret: g.clientSecret,
      expiresAt: g.expiresAt
    }))

    const list = (this.load().mailAccounts ?? []).filter((m) => m.provider !== 'google')
    const otherEntries = await Promise.all(
      list.map(async (m) => {
        const patchMail = (patch: Partial<StoredMailAccount>): void => {
          const current = this.load()
          const updated = (current.mailAccounts ?? []).map((item) =>
            item.id === m.id ? { ...item, ...patch } : item
          )
          this.save({ ...current, mailAccounts: updated })
        }
        const accessToken = await this.decrypt(m.accessTokenEnc, (accessTokenEnc) => patchMail({ accessTokenEnc }))
        const refreshToken = m.refreshTokenEnc
          ? await this.decrypt(m.refreshTokenEnc, (refreshTokenEnc) => patchMail({ refreshTokenEnc }))
          : undefined
        const clientId = m.clientIdEnc
          ? await this.decrypt(m.clientIdEnc, (clientIdEnc) => patchMail({ clientIdEnc }))
          : undefined
        const clientSecret = m.clientSecretEnc
          ? await this.decrypt(m.clientSecretEnc, (clientSecretEnc) => patchMail({ clientSecretEnc }))
          : undefined
        return {
          account: {
            id: m.id,
            provider: m.provider,
            email: m.email,
            name: m.name,
            avatarUrl: m.avatarUrl,
            label: m.label
          },
          accessToken,
          refreshToken,
          clientId,
          clientSecret,
          expiresAt: m.expiresAt
        }
      })
    )
    return [...googleMailEntries, ...otherEntries]
  }
}

function stripSecrets<T extends { tokenEnc: string; cookieEnc?: string }>(
  value: T
): Omit<T, 'tokenEnc' | 'cookieEnc'> {
  const { tokenEnc: _t, cookieEnc: _c, ...rest } = value
  return rest
}

export const settings = new SettingsStore()
