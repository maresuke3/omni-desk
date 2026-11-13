import { gemoji } from 'gemoji'
import type { SlackEmojiMap } from '@omni-desk/contracts'

let standard: Map<string, string> | null = null

function standardMap(): Map<string, string> {
  if (!standard) {
    standard = new Map()
    for (const g of gemoji) for (const name of g.names) standard.set(name, g.emoji)
    // Slack 独自の名前
    const extra: Record<string, string> = {
      thumbsup: '👍',
      thumbsdown: '👎',
      simple_smile: '🙂',
      slightly_smiling_face: '🙂',
      white_check_mark: '✅',
      heavy_check_mark: '✔️',
      'man-bowing': '🙇‍♂️',
      'woman-bowing': '🙇‍♀️',
      'man-gesturing-ok': '🙆‍♂️',
      'woman-gesturing-ok': '🙆‍♀️',
      'man-raising-hand': '🙋‍♂️',
      'woman-raising-hand': '🙋‍♀️'
    }
    for (const [k, v] of Object.entries(extra)) if (!standard.has(k)) standard.set(k, v)
  }
  return standard
}

export type ResolvedEmoji = { kind: 'char'; value: string } | { kind: 'image'; url: string } | null

/** Slack の絵文字名を、標準絵文字 or カスタム絵文字画像に解決する */
export function resolveEmoji(name: string, map?: SlackEmojiMap, depth = 0): ResolvedEmoji {
  const key = name.replace(/::skin-tone-\d$/, '')
  const custom = map?.custom[key]
  if (custom) return { kind: 'image', url: custom }
  const alias = map?.aliases[key]
  if (alias && depth < 3) return resolveEmoji(alias, map, depth + 1)
  const std = standardMap()
  const char = std.get(key) ?? std.get(key.replace(/-/g, '_'))
  return char ? { kind: 'char', value: char } : null
}
