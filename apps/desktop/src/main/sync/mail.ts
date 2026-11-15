import { AppError, toErrorPayload } from '@omni-desk/connector-core'
import { GmailService } from '@omni-desk/connector-gmail'
import { emptyMailSnapshot, type MailMessage, type MailSendInput } from '@omni-desk/contracts'
import { settings } from '../settings'
import type { StateHub } from './hub'

function buildDemoMails(): MailMessage[] {
  const now = Date.now()
  const MIN = 60_000
  const HOUR = 60 * MIN
  return [
    {
      id: 'google:demo@example.com:demo-1',
      externalId: 'demo-1',
      accountId: 'google:demo@example.com',
      accountEmail: 'demo@example.com',
      provider: 'google',
      subject: '【重要】来週のスプリントレビュー資料の確認依頼',
      from: { name: '佐藤 (PM)', email: 'sato@example.com' },
      to: ['demo@example.com'],
      snippet: 'お疲れさまです。来週火曜のスプリントレビューに向けた資料を共有しましたのでご確認をお願いします。',
      bodyText:
        'お疲れさまです。佐藤です。\n\n来週火曜のスプリントレビューに向けた資料を共有しました。\n今回の OmniDesk アップデート内容についても 1 枚追加しています。\n\nご確認のほどよろしくお願いいたします。',
      receivedAt: now - 18 * MIN,
      isUnread: true,
      isStarred: true,
      labels: ['INBOX', 'UNREAD', 'STARRED'],
      webUrl: 'https://mail.google.com'
    },
    {
      id: 'google:demo@example.com:demo-2',
      externalId: 'demo-2',
      accountId: 'google:demo@example.com',
      accountEmail: 'demo@example.com',
      provider: 'google',
      subject: 'GitHub Organization セキュリティ通知',
      from: { name: 'GitHub', email: 'noreply@github.com' },
      to: ['demo@example.com'],
      snippet: 'Fine-grained personal access token の有効期限が近づいています。',
      bodyText: 'OmniDesk で利用中の GitHub トークンの有効期限が 7 日以内に迫っています。必要に応じて更新してください。',
      receivedAt: now - 3 * HOUR,
      isUnread: false,
      isStarred: false,
      labels: ['INBOX'],
      webUrl: 'https://mail.google.com'
    }
  ]
}

export class MailSyncService {
  private refreshing: Promise<void> | null = null

  constructor(private readonly hub: StateHub) {}

  private async getServices(): Promise<Map<string, GmailService>> {
    const entries = await settings.mailAccountSecretsList()
    const map = new Map<string, GmailService>()
    for (const item of entries) {
      if (item.account.provider === 'google') {
        map.set(
          item.account.id,
          new GmailService({
            accountId: item.account.id,
            email: item.account.email,
            accessToken: item.accessToken,
            refreshToken: item.refreshToken,
            clientId: item.clientId,
            clientSecret: item.clientSecret,
            expiresAt: item.expiresAt,
            onTokenRefreshed: ({ accessToken, expiresAt }) =>
              settings.updateMailAccessToken(item.account.id, accessToken, expiresAt)
          })
        )
      }
    }
    return map
  }

  private async getService(accountId: string): Promise<GmailService> {
    const map = await this.getServices()
    const svc = map.get(accountId)
    if (!svc) {
      throw new AppError('not_configured', '指定されたメールアカウントが見つかりません')
    }
    return svc
  }

  async refresh(query?: string): Promise<void> {
    if (this.refreshing && !query) return this.refreshing
    const task = this.doRefresh(query).finally(() => {
      if (!query) this.refreshing = null
    })
    if (!query) this.refreshing = task
    return task
  }

  private async doRefresh(query?: string): Promise<void> {
    const pub = settings.toPublic()
    const services = await this.getServices()

    if (services.size === 0) {
      if (pub.demoActive) {
        this.hub.setMail({
          loading: false,
          error: null,
          lastSyncedAt: Date.now(),
          messages: buildDemoMails()
        })
      } else {
        this.hub.setMail({
          loading: false,
          error: null,
          lastSyncedAt: null,
          messages: []
        })
      }
      return
    }

    this.hub.setMail({ loading: true, error: null })
    const existingBodyById = new Map(
      (this.hub.get().mail?.messages ?? [])
        .filter((m) => m.bodyText !== undefined)
        .map((m) => [m.id, m.bodyText])
    )

    const merged: MailMessage[] = []
    let firstError: unknown = null

    await Promise.all(
      [...services.values()].map(async (svc) => {
        try {
          const items = await svc.listMessages({ query, maxResults: 25 })
          for (const item of items) {
            const cachedBody = existingBodyById.get(item.id)
            merged.push(cachedBody !== undefined ? { ...item, bodyText: cachedBody } : item)
          }
        } catch (err) {
          firstError ??= err
        }
      })
    )

    merged.sort((a, b) => b.receivedAt - a.receivedAt)
    this.hub.setMail({
      loading: false,
      error: firstError ? toErrorPayload(firstError) : null,
      lastSyncedAt: Date.now(),
      messages: merged
    })
  }

  async getBody(accountId: string, messageId: string): Promise<MailMessage> {
    const current = (this.hub.get().mail ?? emptyMailSnapshot()).messages
    const existing = current.find((m) => m.accountId === accountId && m.externalId === messageId)
    if (existing?.bodyText !== undefined) return existing

    if (settings.toPublic().demoActive && accountId.includes('demo@example.com')) {
      if (existing) return existing
    }

    const svc = await this.getService(accountId)
    const full = await svc.getMessage(messageId)
    const updated = current.some((m) => m.id === full.id)
      ? current.map((m) => (m.id === full.id ? full : m))
      : [full, ...current]
    this.hub.setMail({ messages: updated })
    return full
  }

  async setUnread(accountId: string, messageId: string, unread: boolean): Promise<void> {
    if (!(settings.toPublic().demoActive && accountId.includes('demo@example.com'))) {
      const svc = await this.getService(accountId)
      await svc.setUnread(messageId, unread)
    }
    const current = (this.hub.get().mail ?? emptyMailSnapshot()).messages
    this.hub.setMail({
      messages: current.map((m) =>
        m.accountId === accountId && m.externalId === messageId ? { ...m, isUnread: unread } : m
      )
    })
  }

  async archive(accountId: string, messageId: string): Promise<void> {
    if (!(settings.toPublic().demoActive && accountId.includes('demo@example.com'))) {
      const svc = await this.getService(accountId)
      await svc.archiveMessage(messageId)
    }
    const current = (this.hub.get().mail ?? emptyMailSnapshot()).messages
    this.hub.setMail({
      messages: current.filter((m) => !(m.accountId === accountId && m.externalId === messageId))
    })
  }

  async send(input: MailSendInput): Promise<void> {
    if (settings.toPublic().demoActive && input.accountId.includes('demo@example.com')) {
      return
    }
    const svc = await this.getService(input.accountId)
    await svc.sendMessage(input)
  }
}
