import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { AppError } from '@omni-desk/connector-core'
import type { JiraCreateInput, JiraIssue, JiraProject, JiraUpdateInput, KnowledgeDoc } from '@omni-desk/contracts'
import {
  normalizeConfluencePage,
  normalizeJiraIssue,
  normalizeJiraProject,
  type RawAcliConfluencePage,
  type RawAcliJiraIssue,
  type RawAcliJiraProject
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

  async listJiraProjects(limit = 50): Promise<JiraProject[]> {
    const raw = await this.runJson<RawAcliJiraProject[] | { values?: RawAcliJiraProject[]; projects?: RawAcliJiraProject[] }>([
      'jira',
      'project',
      'list',
      '--limit',
      String(limit)
    ])
    const list = Array.isArray(raw) ? raw : (raw.values ?? raw.projects ?? [])
    return list.map(normalizeJiraProject).filter((p): p is JiraProject => p !== null)
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
    if (input.additionalAttributes && Object.keys(input.additionalAttributes).length > 0) {
      const payload: Record<string, unknown> = {
        projectKey: input.projectKey,
        type: input.issueType ?? 'Task',
        summary: input.summary,
        additionalAttributes: input.additionalAttributes
      }
      if (input.description) {
        payload.description = {
          type: 'doc',
          version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: input.description }] }]
        }
      }
      if (input.assignee) payload.assignee = input.assignee
      if (input.labels?.length) payload.labels = input.labels
      if (input.parent) payload.parentIssueId = input.parent

      const tmpPath = join(tmpdir(), `omni-jira-${randomUUID()}.json`)
      await writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf8')
      try {
        const created = await this.runJson<RawAcliJiraIssue>(['jira', 'workitem', 'create', '--from-json', tmpPath])
        return normalizeJiraIssue(created, this.siteUrl)
      } finally {
        await unlink(tmpPath).catch(() => undefined)
      }
    }

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
    if (input.assignee) {
      args.push('--assignee', input.assignee)
    }
    if (input.labels && input.labels.length > 0) {
      args.push('--label', input.labels.join(','))
    }
    if (input.parent) {
      args.push('--parent', input.parent)
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
