import type { Conversation, Message, Person, Task } from '@omni-desk/contracts'
import { ago, DAY, daysFromNow, HOUR, MIN, todayAt } from '@omni-desk/connector-core'
import type { ChatworkProvider } from './provider'

/**
 * 未接続時・デモモード時に表示するサンプルデータ。人物・会社名はすべて架空。
 */

/** デモ時のログインユーザー ID（メンション判定・表示用） */
export const CHATWORK_DEMO_ACCOUNT_ID = '1000001'

const cwPeople = {
  kobayashi: { id: '2000001', name: '小林 誠（サンプル商事）' },
  kato: { id: '2000002', name: '加藤 真由美' },
  yoshida: { id: '2000003', name: '吉田 隆' },
  matsumoto: { id: '2000004', name: '松本 愛（ABCデザイン）' },
  inoue: { id: '2000005', name: '井上 亮' }
} satisfies Record<string, Person>

type DemoMsg = [author: Person, minutesAgo: number, text: string, extra?: Partial<Message>]

// ------------------------------------------------------------------ Chatwork

const baseRooms = (): Conversation[] => [
  { id: '9001', source: 'chatwork', name: '【サンプル商事様】定例・連絡', kind: 'group', unreadCount: 3, hasUnread: true, mentionCount: 1, lastActivityAt: ago(8 * MIN), pinned: true },
  { id: '9002', source: 'chatwork', name: cwPeople.kato.name, kind: 'dm', unreadCount: 1, hasUnread: true, lastActivityAt: ago(35 * MIN) },
  { id: '9003', source: 'chatwork', name: 'ABCデザイン × 自社 Web リニューアル', kind: 'group', unreadCount: 5, hasUnread: true, mentionCount: 1, lastActivityAt: ago(70 * MIN) },
  { id: '9004', source: 'chatwork', name: '経理・請求連絡', kind: 'group', unreadCount: 0, lastActivityAt: ago(5 * HOUR) },
  { id: '9005', source: 'chatwork', name: 'マイチャット', kind: 'my', unreadCount: 0, lastActivityAt: ago(DAY) },
  { id: '9006', source: 'chatwork', name: cwPeople.inoue.name, kind: 'dm', unreadCount: 0, lastActivityAt: ago(2 * DAY) }
]

const cwHistory: Record<string, DemoMsg[]> = {
  '9001': [
    [cwPeople.kobayashi, 26 * 60, '[info][title]次回定例のご案内[/title]日時：今週金曜 14:00〜15:00\n場所：オンライン（URL は別途お送りします）[/info]'],
    [cwPeople.yoshida, 3 * 60, '承知しました。当日はよろしくお願いいたします(bow)'],
    [cwPeople.kobayashi, 8, `[To:${CHATWORK_DEMO_ACCOUNT_ID}]デモ太郎さん\nお世話になっております。\n先日のお見積りについて、数量を 120 → 150 に変更した版をいただけますでしょうか。\n今週中ですと大変助かります(please)`]
  ],
  '9002': [
    [cwPeople.kato, 3 * 60, 'お疲れさまです。来月の出張の件で相談させてください。'],
    [cwPeople.kato, 35, '新幹線の手配はこちらで進めますね！ホテルの希望があれば教えてください(roger)']
  ],
  '9003': [
    [cwPeople.matsumoto, 5 * 60, 'トップページのデザイン案を 2 パターンお送りします。\n[download:111]top_design_A.pdf[/download]\n[download:112]top_design_B.pdf[/download]'],
    [cwPeople.inoue, 2 * 60, '[qt][qtmeta aid=2000004 time=1700000000]トップページのデザイン案を 2 パターンお送りします。[/qt]\nB 案の方向性がよさそうです！'],
    [cwPeople.matsumoto, 70, `[rp aid=${CHATWORK_DEMO_ACCOUNT_ID} to=9003-1]デモ太郎さん\nフィードバックありがとうございます！修正版を明日中にお送りします(cracker)`]
  ],
  '9004': [[cwPeople.yoshida, 5 * 60, '[toall]\n今月分の経費精算の締め切りは 25 日です。お早めにご提出ください。']],
  '9005': [[{ id: CHATWORK_DEMO_ACCOUNT_ID, name: 'デモ 太郎' }, 24 * 60, '[code]TODO: 見積書テンプレートを更新する[/code]']],
  '9006': [[cwPeople.inoue, 2 * 24 * 60, '先日の打ち合わせメモです。\n[hr]\n・次回までに要件を整理\n・スケジュール案を作成']]
}

/** デモ中に送信したメッセージ（アプリを閉じるまで保持） */
const sent: Record<string, Message[]> = {}
const DEMO_ME: Person = { id: CHATWORK_DEMO_ACCOUNT_ID, name: 'デモ 太郎' }

const chatworkRooms = (): Conversation[] =>
  baseRooms().map((room) => {
    const mine = sent[room.id] ?? []
    const last = mine[mine.length - 1]
    return {
      ...room,
      messageCount: (cwHistory[room.id]?.length ?? 0) + mine.length,
      myTaskCount: 0,
      lastActivityAt: last ? last.createdAt : room.lastActivityAt
    }
  })

function buildCwMessages(roomId: string): Message[] {
  const room = chatworkRooms().find((r) => r.id === roomId)
  if (!room) return []
  const base = (cwHistory[roomId] ?? []).map(([author, minutes, text], i): Message => ({
    id: `${roomId}:${i + 1}`,
    nativeId: String(i + 1),
    source: 'chatwork',
    conversationId: roomId,
    conversationName: room.name,
    conversationKind: room.kind,
    author,
    text,
    format: 'chatwork',
    createdAt: ago(minutes * MIN),
    permalink: 'https://example.com/chatwork-demo',
    isMention:
      author.id !== CHATWORK_DEMO_ACCOUNT_ID &&
      (text.includes(`[To:${CHATWORK_DEMO_ACCOUNT_ID}]`) ||
        text.includes(`aid=${CHATWORK_DEMO_ACCOUNT_ID}`) ||
        text.includes('[toall]') ||
        room.kind === 'dm')
  }))
  return [...base, ...(sent[roomId] ?? [])]
}

export const demoChatwork: ChatworkProvider = {
  async listRooms() {
    return chatworkRooms()
  },
  async getMessages(roomId) {
    return buildCwMessages(roomId)
  },
  async getTasks(): Promise<Task[]> {
    const task = (id: string, text: string, roomId: string, by: Person, extra: Partial<Task>): Task => ({
      id: `chatwork:demo:${id}`,
      source: 'chatwork',
      text,
      format: 'chatwork',
      status: 'open',
      dueHasTime: false,
      conversationId: roomId,
      conversationName: chatworkRooms().find((r) => r.id === roomId)?.name,
      assignedBy: by,
      permalink: 'https://example.com/chatwork-demo',
      ...extra
    })
    return [
      task('1', '数量変更版（150個）のお見積りを送付する', '9001', cwPeople.kobayashi, { dueAt: daysFromNow(2) }),
      task('2', '経費精算（10月分）を提出', '9004', cwPeople.yoshida, { dueAt: daysFromNow(-1) }),
      task('3', 'トップページ B 案へのフィードバックをまとめる', '9003', cwPeople.matsumoto, { dueAt: todayAt(18, 0), dueHasTime: true }),
      task('4', '[info][title]出張手配[/title]ホテルの希望を加藤さんへ連絡[/info]', '9002', cwPeople.kato, { dueAt: daysFromNow(6) }),
      task('5', '要件整理メモを井上さんに共有', '9006', cwPeople.inoue, {}),
      task('6', '定例の議事録を共有', '9001', cwPeople.yoshida, { status: 'done', dueAt: daysFromNow(-3) })
    ]
  },
  async markRead() {
    // デモでは既読状態を持たない
  },
  async sendMessage(roomId, body) {
    const room = chatworkRooms().find((r) => r.id === roomId)
    if (!room) throw new Error('ルームが見つかりません')
    const list = (sent[roomId] ??= [])
    const nativeId = String(1000 + list.length)
    list.push({
      id: `${roomId}:${nativeId}`,
      nativeId,
      source: 'chatwork',
      conversationId: roomId,
      conversationName: room.name,
      conversationKind: room.kind,
      author: DEMO_ME,
      text: body,
      format: 'chatwork',
      createdAt: Date.now(),
      permalink: 'https://example.com/chatwork-demo'
    })
    return { messageId: nativeId }
  }
}
