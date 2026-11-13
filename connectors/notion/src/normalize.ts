import type { KnowledgeDoc } from '@omni-desk/contracts'

interface NotionRichText {
  plain_text?: string
}

interface NotionProperty {
  type?: string
  title?: NotionRichText[]
}

export interface RawNotionObject {
  object: 'page' | 'database'
  id: string
  url?: string
  last_edited_time?: string
  title?: NotionRichText[]
  properties?: Record<string, NotionProperty>
  parent?: { type?: string; database_id?: string; page_id?: string; workspace?: boolean }
}

const joinRichText = (parts?: NotionRichText[]): string =>
  (parts ?? [])
    .map((p) => p.plain_text ?? '')
    .join('')
    .trim()

export function extractNotionTitle(obj: RawNotionObject): string {
  if (obj.object === 'database') {
    return joinRichText(obj.title) || '(無題のデータベース)'
  }
  const props = obj.properties ?? {}
  for (const prop of Object.values(props)) {
    if (prop.type === 'title') {
      const text = joinRichText(prop.title)
      if (text) return text
    }
  }
  return '(無題のページ)'
}

export function normalizeNotionObject(obj: RawNotionObject): KnowledgeDoc {
  const edited = obj.last_edited_time ? Date.parse(obj.last_edited_time) : NaN
  const spaceOrParent =
    obj.object === 'database'
      ? 'Database'
      : obj.parent?.type === 'workspace'
        ? 'Workspace'
        : obj.parent?.type === 'database_id'
          ? 'Database item'
          : undefined

  return {
    id: `notion:${obj.id}`,
    source: 'notion',
    title: extractNotionTitle(obj),
    spaceOrParent,
    url: obj.url ?? '',
    updatedAt: Number.isFinite(edited) ? edited : Date.now()
  }
}
