import { AppError } from '@omni-desk/connector-core'
import type { GitHubRepo, PullRequest, PullRequestRole } from '@omni-desk/contracts'
import {
  normalizeGitHubRepo,
  normalizePullRequest,
  type RawGitHubRepo,
  type RawGitHubSearchIssue
} from './normalize'

const GITHUB_API = 'https://api.github.com'

export interface GitHubUserInfo {
  login: string
  name: string
  avatarUrl?: string
}

export class GitHubService {
  constructor(private readonly token: string) {}

  private async get<T>(path: string): Promise<T> {
    let res: Response
    try {
      res = await fetch(`${GITHUB_API}${path}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'omni-desk'
        }
      })
    } catch (error) {
      throw new AppError(
        'network',
        error instanceof Error ? `GitHub 通信エラー: ${error.message}` : 'GitHub 通信エラー'
      )
    }

    if (res.status === 401) {
      throw new AppError('auth_error', 'GitHub トークンが無効または期限切れです')
    }
    if (res.status === 403 || res.status === 429) {
      const retry = Number(res.headers.get('retry-after') ?? 60)
      const sec = Number.isFinite(retry) ? retry : 60
      throw new AppError('rate_limited', `GitHub API のレート制限に達しました（${sec} 秒後に再試行）`)
    }
    if (!res.ok) {
      throw new AppError('unknown', `GitHub API エラー（HTTP ${res.status}）`)
    }
    return (await res.json()) as T
  }

  async verify(): Promise<GitHubUserInfo> {
    const user = await this.get<{ login: string; name?: string | null; avatar_url?: string }>('/user')
    return {
      login: user.login,
      name: user.name?.trim() || user.login,
      avatarUrl: user.avatar_url
    }
  }

  private async searchPullRequests(query: string, role: PullRequestRole, perPage = 30): Promise<PullRequest[]> {
    const params = new URLSearchParams({
      q: query,
      sort: 'updated',
      order: 'desc',
      per_page: String(perPage)
    })
    const data = await this.get<{ items: RawGitHubSearchIssue[] }>(`/search/issues?${params.toString()}`)
    return data.items.map((item) => normalizePullRequest(item, role))
  }

  listMyPullRequests(perPage = 30): Promise<PullRequest[]> {
    return this.searchPullRequests('is:pr is:open author:@me', 'author', perPage)
  }

  listReviewRequests(perPage = 30): Promise<PullRequest[]> {
    return this.searchPullRequests('is:pr is:open review-requested:@me', 'reviewer', perPage)
  }

  async listMyRepos(perPage = 30): Promise<GitHubRepo[]> {
    const repos = await this.get<RawGitHubRepo[]>(`/user/repos?sort=updated&per_page=${perPage}`)
    return repos.map(normalizeGitHubRepo)
  }
}

export async function verifyGitHub(token: string): Promise<GitHubUserInfo> {
  return new GitHubService(token).verify()
}
