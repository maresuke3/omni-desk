import type { JiraIssue, JiraStatusCategory, KnowledgeDoc } from '@omni-desk/contracts'

export interface RawAcliJiraIssue {
  key: string
  fields?: {
    summary?: string
    status?: {
      name?: string
      statusCategory?: { key?: string; name?: string }
    }
    priority?: { name?: string }
    issuetype?: { name?: string }
    project?: { key?: string }
    assignee?: { accountId?: string; displayName?: string; avatarUrls?: Record<string, string> }
    updated?: string
  }
  self?: string
}

export interface RawAcliConfluencePage {
  id: string
  title?: string
  space?: { name?: string; key?: string }
  excerpt?: string
  _links?: { webui?: string; base?: string }
  version?: { when?: string; by?: { accountId?: string; displayName?: string } }
}

function toJiraStatusCategory(key?: string): JiraStatusCategory {
  if (key === 'done') return 'done'
  if (key === 'indeterminate') return 'in_progress'
  return 'todo'
}

export function normalizeJiraIssue(raw: RawAcliJiraIssue, siteUrl?: string): JiraIssue {
  const f = raw.fields ?? {}
  const updatedMs = f.updated ? Date.parse(f.updated) : NaN
  const projectKey = f.project?.key ?? raw.key.split('-')[0] ?? ''
  const base = siteUrl?.replace(/\/+$/, '')

  return {
    key: raw.key,
    summary: f.summary ?? '',
    status: f.status?.name ?? 'Unknown',
    statusCategory: toJiraStatusCategory(f.status?.statusCategory?.key),
    priority: f.priority?.name,
    issueType: f.issuetype?.name,
    projectKey,
    assignee: f.assignee
      ? {
          id: f.assignee.accountId ?? f.assignee.displayName ?? 'unknown',
          name: f.assignee.displayName ?? 'Unknown',
          avatarUrl: f.assignee.avatarUrls?.['48x48']
        }
      : undefined,
    updatedAt: Number.isFinite(updatedMs) ? updatedMs : Date.now(),
    url: base ? `${base}/browse/${raw.key}` : undefined
  }
}

export function normalizeConfluencePage(raw: RawAcliConfluencePage, siteUrl?: string): KnowledgeDoc {
  const when = raw.version?.when ? Date.parse(raw.version.when) : NaN
  const base = (raw._links?.base ?? siteUrl ?? '').replace(/\/+$/, '')
  const webui = raw._links?.webui ?? ''
  const url = webui.startsWith('http') ? webui : base && webui ? `${base}${webui}` : ''

  return {
    id: `confluence:${raw.id}`,
    source: 'confluence',
    title: raw.title ?? '(無題のページ)',
    spaceOrParent: raw.space?.name ?? raw.space?.key,
    excerpt: raw.excerpt,
    url,
    author: raw.version?.by
      ? {
          id: raw.version.by.accountId ?? raw.version.by.displayName ?? 'unknown',
          name: raw.version.by.displayName ?? 'Unknown'
        }
      : undefined,
    updatedAt: Number.isFinite(when) ? when : Date.now()
  }
}
