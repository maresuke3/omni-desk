import { describe, expect, it } from 'vitest'
import { escapeSlackText, threadTsFromPermalink } from './normalize'
import { resolveThreadTs } from './sync'

describe('Slack 送信', () => {
  it('&, <, > をエスケープする', () => {
    expect(escapeSlackText('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d')
  })

  it('チャンネルではスレッドに返信し、DM ではスレッド内のときだけスレッドに返す', () => {
    const reply = { messageId: '100.1', authorId: 'U1', authorName: 'a' }
    expect(resolveThreadTs(reply, 'channel')).toBe('100.1')
    expect(resolveThreadTs(reply, 'dm')).toBeUndefined()
    expect(resolveThreadTs({ ...reply, threadId: '99.9' }, 'dm')).toBe('99.9')
    expect(resolveThreadTs(undefined, 'channel')).toBeUndefined()
  })

  it('パーマリンクからスレッドの親を取り出す', () => {
    expect(threadTsFromPermalink('https://x.slack.com/archives/C1/p2?thread_ts=1.5&cid=C1')).toBe('1.5')
    expect(threadTsFromPermalink('https://x.slack.com/archives/C1/p2')).toBeUndefined()
  })
})
