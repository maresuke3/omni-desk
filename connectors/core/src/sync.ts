import type { HistorySnapshot, SendMessageInput, SendMessageResult, ServiceSnapshot } from '@omni-desk/contracts'

/** 同期エンジンが結果を書き出す先（シェルの状態ハブが実装する） */
export interface SyncSink {
  service(changes: Partial<ServiceSnapshot>): void
  /** 開いている会話の履歴。null で削除 */
  history(conversationId: string, history: HistorySnapshot | null): void
  /** サービス側で自分が返信済みだと分かった自分宛てメッセージ（Message.id）。受信箱で対応済みにする */
  handled(messageIds: string[]): void
}

/** 同期状態の永続化（シェルが暗号化して保存する） */
export interface SyncStorage<T> {
  load(): Promise<T | null>
  save(value: T): Promise<void>
}

/** サービスごとの同期エンジンの共通インターフェース */
export interface SyncEngine {
  start(): void
  stop(): void
  /** すぐに同期し直す */
  refresh(): void
  /** スリープ復帰・ネットワーク復帰時の追いつき */
  resume(): void
  /** 開いている会話を指定する（null で解除） */
  watch(conversationId: string | null): void
  send(input: SendMessageInput): Promise<SendMessageResult>
  /** サービス側を既読にする（会話ごとに、指定したメッセージまで） */
  markRead(items: { conversationId: string; nativeId: string }[]): Promise<void>
}
