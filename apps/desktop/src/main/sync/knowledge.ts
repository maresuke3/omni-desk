import { AtlassianCliService } from '@omni-desk/connector-atlassian'
import { AppError, toErrorPayload } from '@omni-desk/connector-core'
import { GitHubService } from '@omni-desk/connector-github'
import { NotionService } from '@omni-desk/connector-notion'
import type {
  GitHubIssue,
  GitHubRepo,
  JiraCreateInput,
  JiraIssue,
  JiraProject,
  JiraUpdateInput,
  KnowledgeDoc,
  NotionPageCreateInput,
  PullRequest
} from '@omni-desk/contracts'
import { settings } from '../settings'
import type { StateHub } from './hub'

const HOUR = 60 * 60 * 1000

function demoKnowledgeData(): {
  pullRequests: PullRequest[]
  githubIssues: GitHubIssue[]
  repos: GitHubRepo[]
  jiraProjects: JiraProject[]
  jiraIssues: JiraIssue[]
  docs: KnowledgeDoc[]
} {
  const now = Date.now()
  return {
    pullRequests: [
      {
        id: 'github:demo:pr-1',
        number: 142,
        title: 'feat(inbox): Slack OAuth 認可フローとリダイレクト URL 抽出を追加',
        repo: 'omni-desk/omni-desk',
        url: 'https://github.com/example/omni-desk/pull/142',
        state: 'open',
        isDraft: false,
        author: { id: 'demo-me', name: 'maresuke' },
        role: 'author',
        createdAt: now - 5 * HOUR,
        updatedAt: now - 30 * 60 * 1000
      },
      {
        id: 'github:demo:pr-2',
        number: 89,
        title: 'fix(sync): Chatwork レート制限リトライ時のバックオフ調整',
        repo: 'omni-desk/core-api',
        url: 'https://github.com/example/core-api/pull/89',
        state: 'open',
        isDraft: false,
        author: { id: 'demo-tanaka', name: 'tanaka' },
        role: 'reviewer',
        createdAt: now - 14 * HOUR,
        updatedAt: now - 2 * HOUR
      }
    ],
    githubIssues: [
      {
        id: 'github:demo:issue-1',
        number: 42,
        title: 'Organization 配下リポジトリの同期パフォーマンス改善',
        repo: 'omni-desk/core-api',
        url: 'https://github.com/example/core-api/issues/42',
        state: 'open',
        author: { id: 'demo-sato', name: 'sato' },
        labels: ['enhancement', 'org'],
        updatedAt: now - 3 * HOUR
      }
    ],
    repos: [
      {
        id: 'github:demo:repo-1',
        fullName: 'omni-desk/omni-desk',
        owner: 'omni-desk',
        language: 'TypeScript',
        description: 'Slack / Chatwork / ナレッジを一元管理するデスクトップダッシュボード',
        url: 'https://github.com/example/omni-desk',
        isPrivate: true,
        updatedAt: now - 30 * 60 * 1000
      },
      {
        id: 'github:demo:repo-2',
        fullName: 'omni-desk/core-api',
        owner: 'omni-desk',
        language: 'Go',
        description: '社内共通 API・認証基盤サービス',
        url: 'https://github.com/example/core-api',
        isPrivate: true,
        updatedAt: now - 4 * HOUR
      }
    ],
    jiraProjects: [
      { key: 'OMNI', name: 'OmniDesk' },
      { key: 'OPS', name: 'Operations' }
    ],
    jiraIssues: [
      {
        key: 'OMNI-101',
        summary: 'ナレッジボードの UI レイアウトと横断検索を実装する',
        status: 'In Progress',
        statusCategory: 'in_progress',
        priority: 'High',
        issueType: 'Task',
        projectKey: 'OMNI',
        assignee: { id: 'demo-me', name: 'Maresuke' },
        updatedAt: now - 1 * HOUR,
        url: 'https://example.atlassian.net/browse/OMNI-101'
      },
      {
        key: 'OMNI-98',
        summary: 'Google Calendar OAuth クライアントの設定（GCP 側）',
        status: 'To Do',
        statusCategory: 'todo',
        priority: 'Medium',
        issueType: 'Task',
        projectKey: 'OMNI',
        assignee: { id: 'demo-me', name: 'Maresuke' },
        updatedAt: now - 12 * HOUR,
        url: 'https://example.atlassian.net/browse/OMNI-98'
      }
    ],
    docs: [
      {
        id: 'confluence:demo:1',
        source: 'confluence',
        title: '2026 Q4 プロダクト開発ロードマップ & ナレッジ運用ルール',
        spaceOrParent: 'Product / Strategy',
        excerpt: 'ビジネスメンバーと開発チームで共有する仕様書・議事録の置き場ガイドライン',
        url: 'https://example.atlassian.net/wiki/spaces/PROD/pages/1',
        author: { id: 'demo-sato', name: '佐藤' },
        updatedAt: now - 3 * HOUR
      },
      {
        id: 'notion:demo:1',
        source: 'notion',
        title: '顧客オンボーディングチェックリスト（営業・CS 共通）',
        spaceOrParent: 'Database item',
        excerpt: '契約〜キックオフ MTG〜アカウント発行までの標準フロー',
        url: 'https://www.notion.so/demo-onboarding',
        updatedAt: now - 6 * HOUR
      }
    ]
  }
}

export class KnowledgeSyncService {
  constructor(private readonly hub: StateHub) {}

  private atlassianService(): AtlassianCliService {
    const cfg = settings.atlassianConfig()
    if (!cfg) {
      throw new AppError('not_configured', 'Atlassian CLI が設定されていません')
    }
    return new AtlassianCliService({ binaryPath: cfg.binaryPath, siteUrl: cfg.siteUrl })
  }

  async refresh(query?: { jql?: string; docQuery?: string }): Promise<void> {
    const pub = settings.toPublic()
    const hasGitHub = Boolean(pub.github || (pub.githubAccounts?.length ?? 0) > 0)
    const hasAny = Boolean(hasGitHub || pub.atlassian || pub.notion)
    if (!hasAny || pub.demoMode) {
      this.hub.setKnowledge({
        loading: false,
        error: null,
        lastSyncedAt: Date.now(),
        ...demoKnowledgeData()
      })
      return
    }

    this.hub.setKnowledge({ loading: true, error: null })

    const [ghTokens, notionToken] = await Promise.all([settings.githubTokens(), settings.notionToken()])
    const atlassianCfg = settings.atlassianConfig()

    const tasks: Promise<void>[] = []
    const prMap = new Map<string, PullRequest>()
    const issueMap = new Map<string, GitHubIssue>()
    const repoMap = new Map<string, GitHubRepo>()
    let jiraIssues: JiraIssue[] = []
    let jiraProjects: JiraProject[] = []
    const docs: KnowledgeDoc[] = []
    let firstError: unknown = null

    for (const token of ghTokens) {
      const gh = new GitHubService(token)
      tasks.push(
        Promise.all([
          gh.listMyPullRequests(),
          gh.listReviewRequests(),
          gh.listAssignedIssues(),
          gh.listMyRepos()
        ])
          .then(([mine, reviews, issues, repoList]) => {
            for (const pr of [...reviews, ...mine]) {
              if (!prMap.has(pr.id)) prMap.set(pr.id, pr)
            }
            for (const issue of issues) {
              if (!issueMap.has(issue.id)) issueMap.set(issue.id, issue)
            }
            for (const repo of repoList) {
              if (!repoMap.has(repo.id)) repoMap.set(repo.id, repo)
            }
          })
          .catch((e) => {
            firstError ??= e
          })
      )
    }

    if (atlassianCfg) {
      const acli = new AtlassianCliService({
        binaryPath: atlassianCfg.binaryPath,
        siteUrl: atlassianCfg.siteUrl
      })
      tasks.push(
        acli
          .searchJiraIssues(query?.jql || undefined)
          .then((issues) => {
            jiraIssues = issues
          })
          .catch((e) => {
            firstError ??= e
          })
      )
      tasks.push(
        acli
          .listJiraProjects()
          .then((projects) => {
            jiraProjects = projects
          })
          .catch(() => {
            // プロジェクト一覧取得に失敗した場合は課題から補完する
          })
      )
      tasks.push(
        acli
          .searchConfluencePages(query?.docQuery?.trim() || 'space is not EMPTY')
          .then((pages) => {
            docs.push(...pages)
          })
          .catch(() => {
            // Confluence 未利用の組織もあるため、検索失敗時は静かにスキップ
          })
      )
    }

    if (notionToken) {
      const notion = new NotionService(notionToken)
      tasks.push(
        notion
          .searchDocs(query?.docQuery ?? '')
          .then((notionDocs) => {
            docs.push(...notionDocs)
          })
          .catch((e) => {
            firstError ??= e
          })
      )
    }

    await Promise.all(tasks)
    const pullRequests = [...prMap.values()].sort((a, b) => b.updatedAt - a.updatedAt)
    const githubIssues = [...issueMap.values()].sort((a, b) => b.updatedAt - a.updatedAt)
    const repos = [...repoMap.values()].sort((a, b) => b.updatedAt - a.updatedAt)
    docs.sort((a, b) => b.updatedAt - a.updatedAt)

    if (jiraProjects.length === 0 && jiraIssues.length > 0) {
      const seenKeys = new Set<string>()
      jiraProjects = jiraIssues
        .map((i) => i.projectKey)
        .filter((k) => {
          if (!k || seenKeys.has(k)) return false
          seenKeys.add(k)
          return true
        })
        .map((key) => ({ key, name: key }))
    }

    this.hub.setKnowledge({
      loading: false,
      error: firstError ? toErrorPayload(firstError) : null,
      lastSyncedAt: Date.now(),
      pullRequests,
      githubIssues,
      repos,
      jiraIssues,
      jiraProjects,
      docs
    })
  }

  async createJiraIssue(input: JiraCreateInput): Promise<JiraIssue> {
    const acli = this.atlassianService()
    const created = await acli.createJiraIssue(input)
    await this.refresh()
    return created
  }

  async updateJiraIssue(key: string, patch: JiraUpdateInput): Promise<void> {
    const acli = this.atlassianService()
    await acli.updateJiraIssue(key, patch)
    await this.refresh()
  }

  async addJiraComment(key: string, body: string): Promise<void> {
    const acli = this.atlassianService()
    await acli.addJiraComment(key, body)
  }

  async createNotionPage(input: NotionPageCreateInput): Promise<KnowledgeDoc> {
    const token = await settings.notionToken()
    if (!token) {
      throw new AppError('not_configured', 'Notion が接続されていません')
    }
    const created = await new NotionService(token).createPage(input)
    await this.refresh()
    return created
  }
}
