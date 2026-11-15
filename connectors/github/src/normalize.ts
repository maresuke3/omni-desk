import type { GitHubIssue, GitHubRepo, PullRequest, PullRequestRole } from '@omni-desk/contracts'

export interface RawGitHubSearchIssue {
  id: number
  number: number
  title: string
  html_url: string
  repository_url?: string
  state: 'open' | 'closed'
  draft?: boolean
  pull_request?: { merged_at?: string | null }
  labels?: Array<{ name?: string }>
  user?: { id: number; login: string; avatar_url?: string }
  created_at: string
  updated_at: string
}

export interface RawGitHubRepo {
  id: number
  full_name: string
  owner?: { login?: string }
  language?: string | null
  archived?: boolean
  description?: string | null
  html_url: string
  private: boolean
  updated_at: string
}

/** `https://api.github.com/repos/owner/repo` から `owner/repo` を抽出する */
export function repoFromApiUrl(repositoryUrl?: string): string {
  if (!repositoryUrl) return ''
  const match = /\/repos\/([^/]+\/[^/]+)$/.exec(repositoryUrl)
  return match?.[1] ?? ''
}

export function normalizePullRequest(raw: RawGitHubSearchIssue, role: PullRequestRole): PullRequest {
  const merged = Boolean(raw.pull_request?.merged_at)
  return {
    id: `github:pr:${raw.id}`,
    number: raw.number,
    title: raw.title,
    repo: repoFromApiUrl(raw.repository_url),
    url: raw.html_url,
    state: merged ? 'merged' : raw.state,
    isDraft: Boolean(raw.draft),
    author: {
      id: String(raw.user?.id ?? raw.user?.login ?? 'unknown'),
      name: raw.user?.login ?? 'unknown',
      avatarUrl: raw.user?.avatar_url
    },
    role,
    createdAt: Date.parse(raw.created_at) || Date.now(),
    updatedAt: Date.parse(raw.updated_at) || Date.now()
  }
}

export function normalizeGitHubIssue(raw: RawGitHubSearchIssue): GitHubIssue {
  const labels = raw.labels?.map((l) => l.name?.trim()).filter((n): n is string => Boolean(n))
  return {
    id: `github:issue:${raw.id}`,
    number: raw.number,
    title: raw.title,
    repo: repoFromApiUrl(raw.repository_url),
    url: raw.html_url,
    state: raw.state,
    author: {
      id: String(raw.user?.id ?? raw.user?.login ?? 'unknown'),
      name: raw.user?.login ?? 'unknown',
      avatarUrl: raw.user?.avatar_url
    },
    labels: labels?.length ? labels : undefined,
    updatedAt: Date.parse(raw.updated_at) || Date.now()
  }
}

export function normalizeGitHubRepo(raw: RawGitHubRepo): GitHubRepo {
  return {
    id: `github:repo:${raw.id}`,
    fullName: raw.full_name,
    owner: raw.owner?.login ?? raw.full_name.split('/')[0],
    language: raw.language ?? undefined,
    archived: Boolean(raw.archived),
    description: raw.description ?? undefined,
    url: raw.html_url,
    isPrivate: raw.private,
    updatedAt: Date.parse(raw.updated_at) || Date.now()
  }
}
