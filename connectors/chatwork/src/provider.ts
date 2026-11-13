import type { Conversation, Message, Task } from '@omni-desk/contracts'

/**
 * Chatwork の API 呼び出しの抽象（実 API とデモデータで同じインターフェースを実装する）。
 * どれを・いつ取得するかは同期エンジン（sync.ts）が決める。
 */
export interface ChatworkProvider {
  /** 全ルームの状態（未読数・自分宛ての未読数・更新時刻など）。変更検知に使う */
  listRooms(): Promise<Conversation[]>
  /** ルームの最新メッセージ（最大 100 件） */
  getMessages(roomId: string): Promise<Message[]>
  getTasks(): Promise<Task[]>
  sendMessage(roomId: string, body: string): Promise<{ messageId: string }>
  /** 指定したメッセージまでを既読にする */
  markRead(roomId: string, messageId: string): Promise<void>
}
