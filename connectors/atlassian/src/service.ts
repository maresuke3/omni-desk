import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { AppError } from '@omni-desk/connector-core'
import type { JiraCreateInput, JiraIssue, JiraUpdateInput, KnowledgeDoc } from '@omni-desk/contracts'
import {
  normalizeConfluencePage,
  normalizeJiraIssue,
  type RawAcliConfluencePage,
  type RawAcliJiraIssue
} from './normalize'

const execFileAsync = promisify(execFile)

export interface AtlassianCliOptions {
  /** `acli` バイナリのパス（既定: `'acli'`） */
  binaryPath?: string
  /** リンク組み立て用の Atlassian サイト URL（例: `https://example.atlassian.net`） */
  siteUrl?: string
  timeoutMs?: number
}

/**
 * Atlassian CLI（`acli`）をメインプロセスから実行するサービス。
 * シェル経由では実行せず、引数を配列で渡してインジェクションを防ぐ。
 */
export class AtlassianCliService {
  private readonly bin: string
  private readonly siteUrl?: string
  private readonly timeoutMs: number

  constructor(options: AtlassianCliOptions = {}) {
    this.bin = options.binaryPath?.trim() || 'acli'
    this.siteUrl = options.siteUrl?.trim() || undefined
    this.timeoutMs = options.timeoutMs ?? 20_000
  }

  private async run(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync(this.bin, args, {
        timeout: this.timeoutMs,
        maxBuffer: 8 * 1024 * 1024
      })
      return stdout
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { stderr?: string }
      if (err.code === 'ENOENT') {
        throw new AppError('not_configured', `Atlassian CLI（${this.bin}）が見つかりません。インストールとパス設定を確認してください`)
      }
      const detail = err.stderr?.trim() || err.message || 'acli 実行エラー'
      if (/auth|login|unauthorized|token/i.test(detail)) {
        throw new AppError('auth_error', `Atlassian CLI の認証が必要です: ${detail}`)
      }
      throw new AppError('unknown', `Atlassian CLI エラー: ${detail}`)
    }
  }

  private async runJson<T>(args: string[]): Promise<T> {
    const out = await this.run([...args, '--json'])
    try {
      return JSON.parse(out) as T
    } catch {
      throw new AppError('unknown', 'Atlassian CLI の JSON 出力を解釈できませんでした')
    }
  }

  async verify(): Promise<{ version: string }> {
    const out = await this.run(['--version'])
    return { version: out.trim() }
  }

  async searchJiraIssues(jql = 'assignee = currentUser() ORDER BY updated DESC', limit = 30): Promise<JiraIssue[]> {
    const raw = await this.runJson<RawAcliJiraIssue[] | { issues?: RawAcliJiraIssue[] }>([
      'jira',
      'workitem',
      'search',
      '--jql',
      jql,
      '--limit',
      String(limit)
    ])
    const list = Array.isArray(raw) ? raw : (raw.issues ?? [])
    return list.map((item) => normalizeJiraIssue(item, this.siteUrl))
  }

  async createJiraIssue(input: JiraCreateInput): Promise<JiraIssue> {
    const args = [
      'jira',
      'workitem',
      'create',
      '--project',
      input.projectKey,
      '--summary',
      input.summary,
      '--type',
      input.issueType ?? 'Task'
    ]
    if (input.description) {
      args.push('--description', input.description)
    }
    const created = await this.runJson<RawAcliJiraIssue>(args)
    return normalizeJiraIssue(created, this.siteUrl)
  }

  async updateJiraIssue(key: string, patch: JiraUpdateInput): Promise<void> {
    if (patch.summary || patch.description || patch.assignee) {
      const args = ['jira', 'workitem', 'edit', '--key', key]
      if (patch.summary) args.push('--summary', patch.summary)
      if (patch.description) args.push('--description', patch.description)
      if (patch.assignee) args.push('--assignee', patch.assignee)
      await this.run(args)
    }
    if (patch.status) {
      await this.run(['jira', 'workitem', 'transition', '--key', key, '--status', patch.status])
    }
  }

  async addJiraComment(key: string, body: string): Promise<void> {
    await this.run(['jira', 'workitem', 'comment', 'create', '--key', key, '--body', body])
  }

  async searchConfluencePages(query: string, limit = 25): Promise<KnowledgeDoc[]> {
    const raw = await this.runJson<RawAcliConfluencePage[] | { results?: RawAcliConfluencePage[] }>([
      'confluence',
      'page',
      'search',
      '--query',
      query,
      '--limit',
      String(limit)
    ])
    const list = Array.isArray(raw) ? raw : (raw.results ?? [])
    return list.map((p) => normalizeConfluencePage(p, this.siteUrl))
  }
}
