import type { BlockedSender, SenderKey, Source } from '@omni-desk/contracts'
import { AppError } from '@omni-desk/connector-core'

/**
 * 受信箱で非表示にする送信者リストの検証と更新。
 * レンダラーからの入力は信用せず、ここで検証してから設定に保存する。
 * Electron に依存しない純粋関数にしてテストできるようにしている。
 */

const SOURCES: readonly Source[] = ['slack', 'chatwork']
/** Slack のユーザー ID / bot_id、Chatwork のアカウント ID はいずれも英数字 */
const SENDER_ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/
const MAX_NAME_LENGTH = 100
/** 不正な入力や誤操作で設定ファイルが肥大化しないための上限 */
export const MAX_BLOCKED_SENDERS = 500

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** source と senderId を検証して取り出す。不正なら invalid_input */
export function parseSenderKey(input: unknown): SenderKey {
  if (!isRecord(input)) throw new AppError('invalid_input', '送信者の指定が不正です')
  const { source, senderId } = input
  if (typeof source !== 'string' || !SOURCES.includes(source as Source)) {
    throw new AppError('invalid_input', 'サービスの指定が不正です')
  }
  if (typeof senderId !== 'string' || !SENDER_ID_RE.test(senderId)) {
    throw new AppError('invalid_input', '送信者 ID が不正です')
  }
  return { source: source as Source, senderId }
}

/** 登録する送信者を検証する。名前は表示用なので、空なら ID で代用し、長すぎれば切り詰める */
export function parseBlockedSender(input: unknown): BlockedSender {
  const key = parseSenderKey(input)
  const raw = isRecord(input) && typeof input.name === 'string' ? input.name.replace(/\s+/g, ' ').trim() : ''
  const name = [...(raw || key.senderId)].slice(0, MAX_NAME_LENGTH).join('')
  return { ...key, name }
}

export const isSameSender = (a: SenderKey, b: SenderKey): boolean =>
  a.source === b.source && a.senderId === b.senderId

/** 末尾に追加する。登録済みなら変更しない（重複登録しない） */
export function addBlockedSender(list: readonly BlockedSender[], entry: BlockedSender): BlockedSender[] {
  if (list.some((s) => isSameSender(s, entry))) return [...list]
  if (list.length >= MAX_BLOCKED_SENDERS) {
    throw new AppError('invalid_input', `非表示にできる送信者は ${MAX_BLOCKED_SENDERS} 人までです`)
  }
  return [...list, entry]
}

export function removeBlockedSender(list: readonly BlockedSender[], key: SenderKey): BlockedSender[] {
  return list.filter((s) => !isSameSender(s, key))
}

/** 設定ファイルから読んだ値を検証する。手で編集された場合に備え、不正な要素と重複は読み飛ばす */
export function sanitizeBlockedSenders(value: unknown): BlockedSender[] {
  if (!Array.isArray(value)) return []
  let list: BlockedSender[] = []
  for (const item of value) {
    try {
      list = addBlockedSender(list, parseBlockedSender(item))
    } catch {
      // 不正な要素は捨てる
    }
  }
  return list
}
