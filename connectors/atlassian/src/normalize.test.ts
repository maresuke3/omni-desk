import { describe, expect, it } from 'vitest'
import { normalizeConfluencePage, normalizeJiraIssue } from './normalize'

describe('atlassian-normalize', () => {
  it('Jira Issue を正規化する', () => {
    const issue = normalizeJiraIssue(
      {
        key: 'OMNI-42',
        fields: {
          summary: 'ナレッジボードの設計',
          status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
          priority: { name: 'High' },
          issuetype: { name: 'Task' },
          project: { key: 'OMNI' },
          assignee: { accountId: 'acc-1', displayName: 'Maresuke' },
          updated: '2026-11-13T01:00:00.000Z'
        }
      },
      'https://example.atlassian.net/'
    )
    expect(issue).toMatchObject({
      key: 'OMNI-42',
      summary: 'ナレッジボードの設計',
      status: 'In Progress',
      statusCategory: 'in_progress',
      projectKey: 'OMNI',
      url: 'https://example.atlassian.net/browse/OMNI-42'
    })
    expect(issue.assignee?.name).toBe('Maresuke')
  })

  it('Confluence ページを KnowledgeDoc に正規化する', () => {
    const doc = normalizeConfluencePage(
      {
        id: '12345',
        title: 'API 設計ガイド',
        space: { name: 'Engineering', key: 'ENG' },
        excerpt: 'API の設計ルールまとめ',
        _links: { webui: '/wiki/spaces/ENG/pages/12345' },
        version: { when: '2026-11-13T02:00:00.000Z', by: { accountId: 'u1', displayName: 'Tanaka' } }
      },
      'https://example.atlassian.net'
    )
    expect(doc).toMatchObject({
      id: 'confluence:12345',
      source: 'confluence',
      title: 'API 設計ガイド',
      spaceOrParent: 'Engineering',
      url: 'https://example.atlassian.net/wiki/spaces/ENG/pages/12345'
    })
    expect(doc.author?.name).toBe('Tanaka')
  })
})
