/**
 * Chatwork のメッセージ記法 → 簡易 AST。
 * https://developer.chatwork.com/docs/message-notation
 */

export type CwNode =
  | { t: 'text'; v: string }
  | { t: 'to'; aid: string; self: boolean }
  | { t: 'reply'; aid: string; self: boolean }
  | { t: 'toall' }
  | { t: 'person'; aid: string }
  | { t: 'info'; c: CwNode[] }
  | { t: 'title'; c: CwNode[] }
  | { t: 'quote'; aid?: string; time?: number; c: CwNode[] }
  | { t: 'code'; v: string }
  | { t: 'hr' }
  | { t: 'file'; id: string; name: string }
  | { t: 'task'; c: CwNode[] }

const CONTAINERS = new Set(['info', 'title', 'qt', 'task', 'download'])
const KNOWN = new Set([
  ...CONTAINERS,
  'to',
  'rp',
  'toall',
  'pname',
  'piconname',
  'picon',
  'qtmeta',
  'code',
  'hr',
  'preview',
  'dtext',
  'deleted'
])

// [name] / [/name] / [name:value] / [name a=b c=d]
const TAG_RE = /\[(\/)?([A-Za-z]+|返信)(?::([^\]\s]*))?((?:\s+[A-Za-z]+=[^\s\]]*)*)\s*\]/g

interface Frame {
  tag: string
  nodes: CwNode[]
  attrs: Record<string, string>
  value?: string
}

function parseAttrs(src: string | undefined): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const m of (src ?? '').matchAll(/([A-Za-z]+)=([^\s\]]*)/g)) attrs[m[1]] = m[2]
  return attrs
}

export function parseChatwork(src: string, selfId?: string): CwNode[] {
  const root: Frame = { tag: 'root', nodes: [], attrs: {} }
  const stack: Frame[] = [root]
  const top = (): Frame => stack[stack.length - 1]
  const pushText = (v: string): void => {
    if (!v) return
    const nodes = top().nodes
    const prev = nodes[nodes.length - 1]
    if (prev?.t === 'text') prev.v += v
    else nodes.push({ t: 'text', v })
  }
  const closeFrame = (): void => {
    const frame = stack.pop()
    if (!frame) return
    top().nodes.push(buildNode(frame))
  }

  const re = new RegExp(TAG_RE.source, 'g')
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const [raw, close, rawName, value, attrStr] = m
    const name = rawName === '返信' ? 'rp' : rawName.toLowerCase()
    if (!KNOWN.has(name)) continue

    pushText(src.slice(last, m.index))
    last = re.lastIndex

    if (close) {
      let idx = -1
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === name) {
          idx = i
          break
        }
      }
      if (idx === -1) {
        pushText(raw)
        continue
      }
      while (stack.length > idx) closeFrame()
      continue
    }

    const attrs = parseAttrs(attrStr)
    if (name === 'code') {
      // [code] の中身は記法として解釈しない
      const end = src.indexOf('[/code]', last)
      const body = end === -1 ? src.slice(last) : src.slice(last, end)
      top().nodes.push({ t: 'code', v: body.replace(/^\n/, '').replace(/\n$/, '') })
      last = end === -1 ? src.length : end + '[/code]'.length
      re.lastIndex = last
      continue
    }
    if (CONTAINERS.has(name)) {
      stack.push({ tag: name, nodes: [], attrs, value })
      continue
    }
    switch (name) {
      case 'to':
        top().nodes.push({ t: 'to', aid: value ?? '', self: !!selfId && value === selfId })
        break
      case 'rp':
        top().nodes.push({ t: 'reply', aid: attrs.aid ?? '', self: !!selfId && attrs.aid === selfId })
        break
      case 'toall':
        top().nodes.push({ t: 'toall' })
        break
      case 'pname':
      case 'piconname':
      case 'picon':
        top().nodes.push({ t: 'person', aid: value ?? '' })
        break
      case 'hr':
        top().nodes.push({ t: 'hr' })
        break
      case 'qtmeta': {
        const frame = [...stack].reverse().find((f) => f.tag === 'qt')
        if (frame) Object.assign(frame.attrs, attrs)
        break
      }
      case 'deleted':
        pushText('（このメッセージは削除されました）')
        break
      // preview / dtext は表示しない
    }
  }
  pushText(src.slice(last))
  while (stack.length > 1) closeFrame()
  return trimNodes(root.nodes)
}

function buildNode(frame: Frame): CwNode {
  const c = trimNodes(frame.nodes)
  switch (frame.tag) {
    case 'info':
      return { t: 'info', c }
    case 'title':
      return { t: 'title', c }
    case 'qt': {
      const time = Number(frame.attrs.time)
      return { t: 'quote', aid: frame.attrs.aid, time: time > 0 ? time * 1000 : undefined, c }
    }
    case 'task':
      return { t: 'task', c }
    case 'download':
      return { t: 'file', id: frame.value ?? '', name: plainText(c).trim() || 'ファイル' }
    default:
      return { t: 'info', c }
  }
}

/** ブロックの直前直後の改行を落として余白が二重にならないようにする */
function trimNodes(nodes: CwNode[]): CwNode[] {
  const isBlock = (n: CwNode | undefined): boolean =>
    !!n && ['info', 'title', 'quote', 'code', 'hr', 'task', 'file'].includes(n.t)
  const out: CwNode[] = []
  nodes.forEach((node, i) => {
    if (node.t !== 'text') {
      out.push(node)
      return
    }
    let v = node.v
    if (i === 0 || isBlock(nodes[i - 1])) v = v.replace(/^\n/, '')
    if (i === nodes.length - 1 || isBlock(nodes[i + 1])) v = v.replace(/\n$/, '')
    if (v) out.push({ t: 'text', v })
  })
  return out
}

export function plainText(nodes: CwNode[]): string {
  return nodes
    .map((n) => {
      switch (n.t) {
        case 'text':
        case 'code':
          return n.v
        case 'to':
          return 'To: '
        case 'reply':
          return 'Re: '
        case 'toall':
          return 'To: 全員 '
        case 'file':
          return `📎 ${n.name} `
        case 'hr':
          return '\n'
        case 'person':
          return ''
        default:
          return plainText(n.c) + (n.t === 'title' ? '\n' : ' ')
      }
    })
    .join('')
}

/** Chatwork の主なエモーティコン（誤変換を避けるため括弧付きのものだけ） */
export const CHATWORK_EMOTICONS: Record<string, string> = {
  '(smile)': '🙂',
  '(sad)': '😢',
  '(more smile)': '😄',
  '(lol)': '😆',
  '(blush)': '😊',
  '(surprise)': '😮',
  '(wink)': '😉',
  '(tongueout)': '😛',
  '(sweat)': '😅',
  '(gasp)': '😱',
  '(cry)': '😭',
  '(think)': '🤔',
  '(kiss)': '😘',
  '(devil)': '😈',
  '(heart)': '❤️',
  '(flower)': '🌸',
  '(bow)': '🙇',
  '(cracker)': '🎉',
  '(roger)': '👌',
  '(yes)': '👍',
  '(y)': '👍',
  '(please)': '🙏',
  '(clap)': '👏',
  '(dance)': '💃',
  '(flex)': '💪',
  '(star)': '⭐',
  '(coffee)': '☕',
  '(beer)': '🍺',
  '(handshake)': '🤝',
  '(^^;)': '😅',
  '(ec14)': '🙏'
}

const EMOTICON_RE = new RegExp(
  Object.keys(CHATWORK_EMOTICONS)
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'g'
)

export function replaceEmoticons(text: string): string {
  return text.replace(EMOTICON_RE, (m) => CHATWORK_EMOTICONS[m] ?? m)
}

/** 一覧表示用のプレーンテキスト */
export function chatworkToPlain(text: string): string {
  return replaceEmoticons(plainText(parseChatwork(text)))
}
