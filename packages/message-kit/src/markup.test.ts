import { describe, expect, it } from 'vitest'
import { chatworkToPlain, parseChatwork, replaceEmoticons } from './chatwork-markup'
import { parseInline, parseSlack, slackToPlain } from './slack-markup'

describe('parseSlack', () => {
  it('ユーザー・チャンネル・全体メンションを解釈する', () => {
    const inline = parseInline('<@U1|佐藤> <#C1|general> <!here>', 'U1')
    expect(inline).toEqual([
      { t: 'mention', kind: 'user', label: '@佐藤', self: true },
      { t: 'text', v: ' ' },
      { t: 'mention', kind: 'channel', label: '#general' },
      { t: 'text', v: ' ' },
      { t: 'mention', kind: 'broadcast', label: '@here', self: true }
    ])
  })

  it('リンク・装飾・絵文字を解釈する', () => {
    const inline = parseInline('見て <https://example.com|資料> *重要* _注意_ ~取消~ `x` :tada:')
    expect(inline.map((n) => n.t)).toEqual([
      'text', 'link', 'text', 'bold', 'text', 'italic', 'text', 'strike', 'text', 'code', 'text', 'emoji'
    ])
    expect(inline[1]).toEqual({ t: 'link', href: 'https://example.com', label: '資料' })
  })

  it('snake_case やファイル名を斜体にしない', () => {
    expect(parseInline('user_id と file_name_v2.txt')).toEqual([
      { t: 'text', v: 'user_id と file_name_v2.txt' }
    ])
  })

  it('コードブロックと引用をブロックに分ける', () => {
    const blocks = parseSlack('前文\n```a < b```\n&gt; 引用です\n後文')
    expect(blocks.map((b) => b.t)).toEqual(['para', 'pre', 'quote', 'para'])
    expect(blocks[1]).toEqual({ t: 'pre', v: 'a < b' })
  })

  it('HTML エンティティを戻す', () => {
    expect(slackToPlain('A &amp; B &lt;tag&gt; <@U1|鈴木>')).toBe('A & B <tag> @鈴木')
  })
})

describe('parseChatwork', () => {
  it('To・返信・全員宛てを解釈して自分宛てを判定する', () => {
    const nodes = parseChatwork('[To:111]山田さん\n[rp aid=222 to=1-2]佐藤さん\n[toall]', '111')
    expect(nodes[0]).toEqual({ t: 'to', aid: '111', self: true })
    expect(nodes.find((n) => n.t === 'reply')).toEqual({ t: 'reply', aid: '222', self: false })
    expect(nodes.some((n) => n.t === 'toall')).toBe(true)
  })

  it('info / title / qt / code をネストして解釈する', () => {
    const nodes = parseChatwork(
      '[info][title]お知らせ[/title]本文[/info][qt][qtmeta aid=1 time=1700000000]引用[/qt][code][To:1]そのまま[/code]'
    )
    expect(nodes[0]).toEqual({
      t: 'info',
      c: [{ t: 'title', c: [{ t: 'text', v: 'お知らせ' }] }, { t: 'text', v: '本文' }]
    })
    expect(nodes[1]).toEqual({ t: 'quote', aid: '1', time: 1700000000000, c: [{ t: 'text', v: '引用' }] })
    expect(nodes[2]).toEqual({ t: 'code', v: '[To:1]そのまま' })
  })

  it('未知のタグや閉じタグだけのものはテキストとして残す', () => {
    expect(parseChatwork('[重要] [TODO] 対応 [/info]')).toEqual([
      { t: 'text', v: '[重要] [TODO] 対応 [/info]' }
    ])
  })

  it('ファイルとエモーティコンをプレーンテキスト化する', () => {
    expect(chatworkToPlain('[download:1]a.pdf[/download]よろしく(bow)')).toBe('📎 a.pdf よろしく🙇')
    expect(replaceEmoticons('時刻:open (y)')).toBe('時刻:open 👍')
  })
})
