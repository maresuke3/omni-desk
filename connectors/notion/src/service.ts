import { AppError } from '@omni-desk/connector-core'
import type { KnowledgeDoc } from '@omni-desk/contracts'
import { normalizeNotionObject, type RawNotionObject } from './normalize'

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

export interface NotionUserInfo {
  id: string
  name: string
  avatarUrl?: string
  workspaceName?: string
}

export class NotionService {
  constructor(private readonly token: string) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response
    try {
      res = await fetch(`${NOTION_API}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
          ...init.headers
        }
      })
    } catch (error) {
      throw new AppError(
        'network',
        error instanceof Error ? `Notion 通信エラー: ${error.message}` : 'Notion 通信エラー'
      )
    }

    if (res.status === 401) {
      throw new AppError('auth_error', 'Notion トークンが無効または期限切れです')
    }
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') ?? 30)
      const sec = Number.isFinite(retry) ? retry : 30
      throw new AppError('rate_limited', `Notion API のレート制限に達しました（${sec} 秒後に再試行）`)
    }
    if (!res.ok) {
      throw new AppError('unknown', `Notion API エラー（HTTP ${res.status}）`)
    }
    return (await res.json()) as T
  }

  async verify(): Promise<NotionUserInfo> {
    const me = await this.request<{
      id: string
      name?: string | null
      avatar_url?: string | null
      bot?: { workspace_name?: string | null }
    }>('/users/me')
    return {
      id: me.id,
      name: me.name?.trim() || 'Notion Integration',
      avatarUrl: me.avatar_url ?? undefined,
      workspaceName: me.bot?.workspace_name ?? undefined
    }
  }

  async searchDocs(query = '', pageSize = 25): Promise<KnowledgeDoc[]> {
    const body: Record<string, unknown> = {
      page_size: pageSize,
      sort: { direction: 'descending', timestamp: 'last_edited_time' }
    }
    if (query.trim()) {
      body.query = query.trim()
    }
    const data = await this.request<{ results: RawNotionObject[] }>('/search', {
      method: 'POST',
      body: JSON.stringify(body)
    })
    return data.results.map(normalizeNotionObject)
  }
}

export async function verifyNotion(token: string): Promise<NotionUserInfo> {
  return new NotionService(token).verify()
}
