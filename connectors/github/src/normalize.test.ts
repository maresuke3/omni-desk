import { describe, expect, it } from 'vitest'
import { normalizeGitHubIssue, normalizeGitHubRepo, normalizePullRequest, repoFromApiUrl } from './normalize'

describe('github-normalize', () => {
  it('repository_url から owner/repo を抽出する', () => {
    expect(repoFromApiUrl('https://api.github.com/repos/maresuke/omni-desk')).toBe('maresuke/omni-desk')
    expect(repoFromApiUrl(undefined)).toBe('')
  })

  it('PR を正規化する', () => {
    const pr = normalizePullRequest(
      {
        id: 99,
        number: 12,
        title: 'Add Slack OAuth',
        html_url: 'https://github.com/maresuke/omni-desk/pull/12',
        repository_url: 'https://api.github.com/repos/maresuke/omni-desk',
        state: 'open',
        draft: false,
        user: { id: 1, login: 'maresuke' },
        created_at: '2026-11-13T01:00:00Z',
        updated_at: '2026-11-13T02:00:00Z'
      },
      'author'
    )
    expect(pr).toMatchObject({
      id: 'github:pr:99',
      number: 12,
      repo: 'maresuke/omni-desk',
      state: 'open',
      role: 'author'
    })
  })

  it('リポジトリを正規化する', () => {
    const repo = normalizeGitHubRepo({
      id: 7,
      full_name: 'my-org/omni-desk',
      owner: { login: 'my-org' },
      language: 'TypeScript',
      archived: false,
      description: 'Dashboard',
      html_url: 'https://github.com/my-org/omni-desk',
      private: true,
      updated_at: '2026-11-13T03:00:00Z'
    })
    expect(repo).toMatchObject({
      id: 'github:repo:7',
      fullName: 'my-org/omni-desk',
      owner: 'my-org',
      language: 'TypeScript',
      archived: false,
      isPrivate: true
    })
  })

  it('アサインされた Issue を正規化する', () => {
    const issue = normalizeGitHubIssue({
      id: 201,
      number: 45,
      title: 'Fix org repo sync',
      html_url: 'https://github.com/my-org/omni-desk/issues/45',
      repository_url: 'https://api.github.com/repos/my-org/omni-desk',
      state: 'open',
      labels: [{ name: 'bug' }],
      user: { id: 1, login: 'maresuke' },
      created_at: '2026-11-13T01:00:00Z',
      updated_at: '2026-11-13T02:00:00Z'
    })
    expect(issue).toMatchObject({
      id: 'github:issue:201',
      number: 45,
      repo: 'my-org/omni-desk',
      labels: ['bug']
    })
  })
})
