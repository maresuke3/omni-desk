import type { BlockedSender, Message, SenderKey } from '@omni-desk/contracts'

/**
 * 受信箱で非表示にする送信者の判定（純粋関数）。
 * useUnifiedInbox がここを通すので、受信箱・ホーム・サイドバーのバッジで結果が一致する。
 * 会話画面やタスクには適用しない。
 */

/** メッセージの送信者キー。ID 体系はサービスごとに違うので source と組にする */
export const senderOf = (message: Pick<Message, 'source' | 'author'>): SenderKey => ({
  source: message.source,
  senderId: message.author.id
})

/** 非表示リストへ登録する値（名前は登録時点の表示名） */
export const toBlockedSender = (message: Pick<Message, 'source' | 'author'>): BlockedSender => ({
  ...senderOf(message),
  name: message.author.name
})

export function isSenderBlocked(blocked: readonly SenderKey[] | undefined, sender: SenderKey): boolean {
  return !!blocked?.some((b) => b.source === sender.source && b.senderId === sender.senderId)
}

/** 非表示の送信者からのメッセージを除く。並び順は変えない */
export function excludeBlockedSenders<T extends Pick<Message, 'source' | 'author'>>(
  messages: readonly T[],
  blocked: readonly SenderKey[] | undefined
): T[] {
  if (!blocked?.length) return [...messages]
  const keys = new Set(blocked.map((b) => `${b.source}\u0000${b.senderId}`))
  return messages.filter((m) => !keys.has(`${m.source}\u0000${m.author.id}`))
}
