import { AppError } from '@omni-desk/connector-core'
import type { KnowledgeDoc, NotionPageCreateInput } from '@omni-desk/contracts'
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

  async createPage(input: NotionPageCreateInput): Promise<KnowledgeDoc> {
    const title = input.title.trim()
    if (!title) throw new AppError('invalid_input', 'タイトルを入力してください')

    let titlePropName = 'title'
    if (input.parentType === 'database') {
      const db = await this.request<{ properties?: Record<string, { type?: string }> }>(
        `/databases/${encodeURIComponent(input.parentId)}`
      )
      const found = Object.entries(db.properties ?? {}).find(([, prop]) => prop.type === 'title')
      if (found) titlePropName = found[0]
    }

    const parent =
      input.parentType === 'database'
        ? { database_id: input.parentId }
        : { page_id: input.parentId }

    const children = toNotionBlocks(input.body)

    const created = await this.request<RawNotionObject>('/pages', {
      method: 'POST',
      body: JSON.stringify({
        parent,
        properties: {
          [titlePropName]: {
            title: [{ text: { content: title } }]
          }
        },
        ...(children.length > 0 ? { children } : {})
      })
    })
    return normalizeNotionObject(created)
  }
}

function toNotionBlocks(body: string): Array<Record<string, unknown>> {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const blocks: Array<Record<string, unknown>> = []
  for (const rawLine of lines) {
    if (blocks.length >= 90) break
    const line = rawLine.trimEnd()
    if (!line.trim()) continue
    const makeRich = (text: string) => [{ type: 'text', text: { content: text.slice(0, 1900) } }]

    if (line.startsWith('### ')) {
      blocks.push({ object: 'block', type: 'heading_3', heading_3: { rich_text: makeRich(line.slice(4)) } })
    } else if (line.startsWith('## ')) {
      blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: makeRich(line.slice(3)) } })
    } else if (line.startsWith('# ')) {
      blocks.push({ object: 'block', type: 'heading_1', heading_1: { rich_text: makeRich(line.slice(2)) } })
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      blocks.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: makeRich(line.slice(2)) } })
    } else {
      blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: makeRich(line) } })
    }
  }
  return blocks
}

export async function verifyNotion(token: string): Promise<NotionUserInfo> {
  return new NotionService(token).verify()
}
