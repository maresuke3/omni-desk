import { describe, expect, it } from 'vitest'
import { extractNotionTitle, normalizeNotionObject } from './normalize'

describe('notion-normalize', () => {
  it('ページとデータベースのタイトルを抽出する', () => {
    expect(
      extractNotionTitle({
        object: 'page',
        id: 'p1',
        properties: {
          Name: { type: 'title', title: [{ plain_text: '議事録 ' }, { plain_text: '11/13' }] }
        }
      })
    ).toBe('議事録 11/13')

    expect(
      extractNotionTitle({
        object: 'database',
        id: 'd1',
        title: [{ plain_text: 'プロダクトロードマップ' }]
      })
    ).toBe('プロダクトロードマップ')
  })

  it('Notion オブジェクトを KnowledgeDoc に正規化する', () => {
    const doc = normalizeNotionObject({
      object: 'page',
      id: 'page-1',
      url: 'https://www.notion.so/page-1',
      last_edited_time: '2026-11-13T04:00:00.000Z',
      parent: { type: 'database_id', database_id: 'db-1' },
      properties: {
        title: { type: 'title', title: [{ plain_text: 'オンボーディング資料' }] }
      }
    })
    expect(doc).toMatchObject({
      id: 'notion:page-1',
      source: 'notion',
      title: 'オンボーディング資料',
      spaceOrParent: 'Database item',
      url: 'https://www.notion.so/page-1'
    })
  })
})
