import type { Conversation, Message, SlackEmojiMap, SlackTodoResult } from '@omni-desk/contracts'

/**
 * Slack の API 呼び出しの抽象（実 API とデモデータで同じインターフェースを実装する）。
 * いつ取得するかは同期エンジン（sync.ts）が決める。
 */
export interface SlackProvider {
  listConversations(): Promise<Conversation[]>
  getHistory(conversationId: string): Promise<Message[]>
  getInbox(): Promise<Message[]>
  getTodos(): Promise<SlackTodoResult>
  getEmoji(): Promise<SlackEmojiMap>
  /** text は Slack の記法のまま送る（&, <, > はエスケープ済みであること） */
  sendMessage(conversationId: string, text: string, threadTs?: string): Promise<{ ts: string }>
  /** 会話を指定したメッセージまで既読にする */
  markRead(conversationId: string, ts: string): Promise<void>
}
