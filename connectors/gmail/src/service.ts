import { AppError } from '@omni-desk/connector-core'
import type { MailAccountInfo, MailMessage, MailSendInput } from '@omni-desk/contracts'
import { buildRawMimeMessage, normalizeGmailMessage, type RawGmailMessage } from './normalize'
import { refreshGoogleMailAccessToken } from './oauth'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

export interface GmailServiceOptions {
  accountId: string
  email: string
  accessToken: string
  refreshToken?: string
  clientId?: string
  clientSecret?: string
  expiresAt?: number
  onTokenRefreshed?: (tokens: { accessToken: string; expiresAt: number }) => Promise<void> | void
}

export async function verifyGmailAccount(accessToken: string): Promise<MailAccountInfo> {
  let res: Response
  try {
    res = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
    })
  } catch (err) {
    throw new AppError('network', `Google 通信エラー: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (res.status === 401) {
    throw new AppError('auth_error', 'Google アクセストークンが無効または期限切れです')
  }
  if (!res.ok) {
    throw new AppError('unknown', `Google ユーザー情報の取得に失敗しました（HTTP ${res.status}）`)
  }
  const user = (await res.json()) as { email?: string; name?: string; picture?: string }
  if (!user.email) {
    throw new AppError('unknown', 'Google アカウントのメールアドレスが取得できませんでした')
  }
  return {
    id: `google:${user.email}`,
    provider: 'google',
    email: user.email,
    name: user.name?.trim() || undefined,
    avatarUrl: user.picture
  }
}

export class GmailService {
  private accessToken: string
  private expiresAt: number
  private refreshing: Promise<string> | null = null

  constructor(private readonly opts: GmailServiceOptions) {
    this.accessToken = opts.accessToken
    this.expiresAt = opts.expiresAt ?? 0
  }

  private async ensureAccessToken(): Promise<string> {
    if (this.expiresAt && Date.now() < this.expiresAt - 60_000) {
      return this.accessToken
    }
    if (!this.opts.refreshToken || !this.opts.clientId) {
      return this.accessToken
    }
    if (!this.refreshing) {
      this.refreshing = refreshGoogleMailAccessToken({
        clientId: this.opts.clientId,
        clientSecret: this.opts.clientSecret,
        refreshToken: this.opts.refreshToken
      })
        .then(async (next) => {
          this.accessToken = next.accessToken
          this.expiresAt = next.expiresAt
          await this.opts.onTokenRefreshed?.(next)
          return next.accessToken
        })
        .finally(() => {
          this.refreshing = null
        })
    }
    return this.refreshing
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown, retried = false): Promise<T> {
    const token = await this.ensureAccessToken()
    let res: Response
    try {
      res = await fetch(`${GMAIL_API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
        },
        body: body !== undefined ? JSON.stringify(body) : undefined
      })
    } catch (err) {
      throw new AppError('network', `Gmail 通信エラー: ${err instanceof Error ? err.message : String(err)}`)
    }

    if (res.status === 401 && !retried && this.opts.refreshToken && this.opts.clientId) {
      this.expiresAt = 0
      return this.request<T>(method, path, body, true)
    }

    if (res.status === 401) {
      throw new AppError('auth_error', 'Gmail の認証が切れました。設定から再連携してください')
    }
    if (res.status === 403 || res.status === 429) {
      throw new AppError('rate_limited', `Gmail API のレート制限または権限エラーです（HTTP ${res.status}）`)
    }
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
      throw new AppError('unknown', detail?.error?.message ?? `Gmail API エラー（HTTP ${res.status}）`)
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  async listMessages(options?: { query?: string; maxResults?: number }): Promise<MailMessage[]> {
    const params = new URLSearchParams({
      maxResults: String(options?.maxResults ?? 25)
    })
    const q = options?.query?.trim()
    if (q) {
      params.set('q', q)
    } else {
      params.append('labelIds', 'INBOX')
    }

    const list = await this.request<{ messages?: Array<{ id: string }> }>(
      'GET',
      `/users/me/messages?${params.toString()}`
    )
    const ids = (list.messages ?? []).map((m) => m.id)
    if (ids.length === 0) return []

    const account = { id: this.opts.accountId, email: this.opts.email }
    const metadataQuery =
      'format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Date'
    const out: MailMessage[] = []
    const CHUNK = 6
    for (let i = 0; i < ids.length; i += CHUNK) {
      const batch = await Promise.all(
        ids.slice(i, i + CHUNK).map((id) =>
          this.request<RawGmailMessage>('GET', `/users/me/messages/${encodeURIComponent(id)}?${metadataQuery}`)
        )
      )
      for (const raw of batch) {
        out.push(normalizeGmailMessage(raw, account))
      }
    }
    return out
  }

  async getMessage(externalId: string): Promise<MailMessage> {
    const raw = await this.request<RawGmailMessage>(
      'GET',
      `/users/me/messages/${encodeURIComponent(externalId)}?format=full`
    )
    return normalizeGmailMessage(raw, { id: this.opts.accountId, email: this.opts.email })
  }

  async setUnread(externalId: string, unread: boolean): Promise<void> {
    await this.request('POST', `/users/me/messages/${encodeURIComponent(externalId)}/modify`, {
      addLabelIds: unread ? ['UNREAD'] : [],
      removeLabelIds: unread ? [] : ['UNREAD']
    })
  }

  async archiveMessage(externalId: string): Promise<void> {
    await this.request('POST', `/users/me/messages/${encodeURIComponent(externalId)}/modify`, {
      removeLabelIds: ['INBOX']
    })
  }

  async sendMessage(input: MailSendInput): Promise<void> {
    const raw = buildRawMimeMessage(input, this.opts.email)
    await this.request('POST', '/users/me/messages/send', {
      raw,
      ...(input.threadId ? { threadId: input.threadId } : {})
    })
  }
}
