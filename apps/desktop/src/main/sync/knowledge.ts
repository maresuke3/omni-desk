import { AtlassianCliService } from '@omni-desk/connector-atlassian'
import { AppError, toErrorPayload } from '@omni-desk/connector-core'
import { GitHubService } from '@omni-desk/connector-github'
import { NotionService } from '@omni-desk/connector-notion'
import type {
  GitHubRepo,
  JiraCreateInput,
  JiraIssue,
  JiraUpdateInput,
  KnowledgeDoc,
  PullRequest
} from '@omni-desk/contracts'
import { settings } from '../settings'
import type { StateHub } from './hub'

const HOUR = 60 * 60 * 1000

function demoKnowledgeData(): {
  pullRequests: PullRequest[]
  repos: GitHubRepo[]
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
    repos: [
      {
        id: 'github:demo:repo-1',
        fullName: 'omni-desk/omni-desk',
        description: 'Slack / Chatwork / ナレッジを一元管理するデスクトップダッシュボード',
        url: 'https://github.com/example/omni-desk',
        isPrivate: true,
        updatedAt: now - 30 * 60 * 1000
      },
      {
        id: 'github:demo:repo-2',
        fullName: 'omni-desk/core-api',
        description: '社内共通 API・認証基盤サービス',
        url: 'https://github.com/example/core-api',
        isPrivate: true,
        updatedAt: now - 4 * HOUR
      }
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
    const hasAny = Boolean(pub.github || pub.atlassian || pub.notion)
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

    const [ghToken, notionToken] = await Promise.all([settings.githubToken(), settings.notionToken()])
    const atlassianCfg = settings.atlassianConfig()

    const tasks: Promise<void>[] = []
    let pullRequests: PullRequest[] = []
    let repos: GitHubRepo[] = []
    let jiraIssues: JiraIssue[] = []
    const docs: KnowledgeDoc[] = []
    let firstError: unknown = null

    if (ghToken) {
      const gh = new GitHubService(ghToken)
      tasks.push(
        Promise.all([gh.listMyPullRequests(), gh.listReviewRequests(), gh.listMyRepos()])
          .then(([mine, reviews, repoList]) => {
            const seen = new Set<string>()
            pullRequests = [...reviews, ...mine].filter((pr) => {
              if (seen.has(pr.id)) return false
              seen.add(pr.id)
              return true
            })
            repos = repoList
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
    docs.sort((a, b) => b.updatedAt - a.updatedAt)

    this.hub.setKnowledge({
      loading: false,
      error: firstError ? toErrorPayload(firstError) : null,
      lastSyncedAt: Date.now(),
      pullRequests,
      repos,
      jiraIssues,
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
}
