import type { Message, SlackEmojiMap } from '@omni-desk/contracts'
import { chatworkToPlain } from './chatwork-markup'
import { resolveEmoji } from './emoji'
import { slackToPlain } from './slack-markup'

/** 一覧用の 1〜2 行プレビュー文字列 */
export function previewText(message: Pick<Message, 'text' | 'format'>, emoji?: SlackEmojiMap): string {
  if (message.format === 'chatwork') return collapse(chatworkToPlain(message.text))
  if (message.format === 'slack') {
    const plain = slackToPlain(message.text).replace(/:([a-z0-9_+\-']+):/gi, (raw, name: string) => {
      const r = resolveEmoji(name.toLowerCase(), emoji)
      return r?.kind === 'char' ? r.value : raw
    })
    return collapse(plain.replace(/[*_~`]/g, ''))
  }
  return collapse(message.text)
}

function collapse(s: string): string {
  return s.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()
}
