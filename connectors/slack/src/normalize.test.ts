import { describe, expect, it } from 'vitest'
import {
  buildPermalink,
  classifySavedItem,
  decorateMentions,
  extractText,
  prettifyMpimName,
  selectOpenTodos
} from './normalize'

describe('slack-normalize', () => {
  it('saved.list のアイテムを To-do / 保存済みに分類する', () => {
    expect(classifySavedItem({ item_id: 'C1', item_type: 'message', todo_state: 'to_do' })).toBe('todo-open')
    expect(classifySavedItem({ item_id: 'C1', item_type: 'message', todo_state: 'completed' })).toBe('todo-done')
    expect(classifySavedItem({ item_id: 'C1', item_type: 'message', todo_state: 'saved' })).toBe('saved')
    // todo_state が無い古い形式は期限・状態から推定
    expect(classifySavedItem({ item_id: 'C1', item_type: 'message', date_due: 1700000000 })).toBe('todo-open')
    expect(classifySavedItem({ item_id: 'C1', item_type: 'message', state: 'completed' })).toBe('todo-done')
    expect(classifySavedItem({ item_id: 'C1', item_type: 'message' })).toBe('saved')
    expect(classifySavedItem({ item_id: 'Sa1', item_type: 'reminder' })).toBe('todo-open')
  })

  it('未完了の To-do のみを抽出する', () => {
    const items = [
      { item_id: 'C1', item_type: 'message', ts: '1', todo_state: 'to_do' },
      { item_id: 'C2', item_type: 'message', ts: '2', todo_state: 'completed' },
      { item_id: 'C3', item_type: 'message', ts: '3', todo_state: 'saved' },
      { item_id: 'Sa1', item_type: 'reminder' }
    ]
    expect(selectOpenTodos(items).map((x) => x.item_id)).toEqual(['C1', 'Sa1'])
  })

  it('メンションに名前を埋め込む', () => {
    const text = decorateMentions(
      '<@U1> さん <#C1> と <@U2|既存>',
      (id) => (id === 'U1' ? '佐藤' : undefined),
      (id) => (id === 'C1' ? 'general' : undefined)
    )
    expect(text).toBe('<@U1|佐藤> さん <#C1|general> と <@U2|既存>')
  })

  it('パーマリンクを組み立てる', () => {
    expect(buildPermalink('https://ex.slack.com/', 'C1', '1700000000.123456')).toBe(
      'https://ex.slack.com/archives/C1/p1700000000123456'
    )
    expect(buildPermalink('https://ex.slack.com/', 'C1', '1.2', '1.1')).toBe(
      'https://ex.slack.com/archives/C1/p12?thread_ts=1.1&cid=C1'
    )
  })

  it('本文が空なら attachments から拾う', () => {
    expect(extractText({ ts: '1', text: '', attachments: [{ title: 'T', text: 'body' }] })).toBe('T\nbody')
  })

  it('グループ DM 名を整形する', () => {
    expect(prettifyMpimName('mpdm-taro--hanako--jiro-1')).toBe('taro, hanako, jiro')
  })
})
