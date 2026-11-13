import type { Conversation, Message, Person, SlackEmojiMap, SlackTodoResult, Task } from '@omni-desk/contracts'
import { ago, DAY, daysFromNow, HOUR, MIN, todayAt } from '@omni-desk/connector-core'
import type { SlackProvider } from './provider'

/**
 * 未接続時・デモモード時に表示するサンプルデータ。人物・会社名はすべて架空。
 */

/** デモ時のログインユーザー ID（メンション判定・表示用） */
export const SLACK_DEMO_USER_ID = 'U0DEMO0ME'

const people = {
  sato: { id: 'U0SATO', name: '佐藤 美咲' },
  tanaka: { id: 'U0TANAKA', name: '田中 翔' },
  suzuki: { id: 'U0SUZUKI', name: '鈴木 健太' },
  takahashi: { id: 'U0TAKAHASHI', name: '高橋 彩' },
  ito: { id: 'U0ITO', name: '伊藤 大輔' },
  watanabe: { id: 'U0WATANABE', name: '渡辺 由衣' },
  yamamoto: { id: 'U0YAMAMOTO', name: '山本 拓海' },
  nakamura: { id: 'U0NAKAMURA', name: '中村 さくら' }
} satisfies Record<string, Person>

type DemoMsg = [author: Person, minutesAgo: number, text: string, extra?: Partial<Message>]

// ------------------------------------------------------------------ Slack

const slackConversations = (): Conversation[] => [
  { id: 'C0PRODUCT', source: 'slack', name: 'product-dev', kind: 'channel', hasUnread: true, mentionCount: 2, lastActivityAt: ago(12 * MIN) },
  { id: 'D0SATO', source: 'slack', name: people.sato.name, kind: 'dm', hasUnread: true, mentionCount: 1, lastActivityAt: ago(25 * MIN) },
  { id: 'C0SALES', source: 'slack', name: 'sales-team', kind: 'channel', hasUnread: true, lastActivityAt: ago(48 * MIN) },
  { id: 'G0LEADS', source: 'slack', name: 'leads-weekly', kind: 'private', lastActivityAt: ago(2 * HOUR) },
  { id: 'C0DESIGN', source: 'slack', name: 'design-review', kind: 'channel', mentionCount: 1, hasUnread: true, lastActivityAt: ago(3 * HOUR) },
  { id: 'M0TRIO', source: 'slack', name: `${people.tanaka.name}, ${people.ito.name}`, kind: 'group', lastActivityAt: ago(5 * HOUR) },
  { id: 'C0GENERAL', source: 'slack', name: 'general', kind: 'channel', lastActivityAt: ago(7 * HOUR) },
  { id: 'D0YAMAMOTO', source: 'slack', name: people.yamamoto.name, kind: 'dm', lastActivityAt: ago(DAY + 2 * HOUR) },
  { id: 'C0RANDOM', source: 'slack', name: 'random', kind: 'channel', lastActivityAt: ago(DAY + 5 * HOUR) }
]


const slackHistory: Record<string, DemoMsg[]> = {
  C0PRODUCT: [
    [people.tanaka, 190, '今週のリリース候補をまとめました :memo:\n• 検索結果の並び替え改善\n• 通知設定の一括変更\n• ダークモードの細かい修正', { reactions: [{ name: 'eyes', count: 3 }] }],
    [people.ito, 150, '通知設定の一括変更、QA 環境で確認しました。問題なさそうです :white_check_mark:'],
    [people.suzuki, 95, '検索の並び替え、パフォーマンス計測の結果を共有します。\n```p95: 420ms → 180ms\np99: 1.2s → 390ms```', { reactions: [{ name: 'tada', count: 5 }, { name: 'rocket', count: 2 }] }],
    [people.tanaka, 40, `<@${SLACK_DEMO_USER_ID}> リリースノートのドラフトをお願いできますか？ 明日の朝会で確認したいです :pray:`, { replyCount: 2 }],
    [people.sato, 12, `<@${SLACK_DEMO_USER_ID}> ついでに *ダークモードの修正* もリリースノートに含めてください〜`, { reactions: [{ name: '+1', count: 1 }] }]
  ],
  D0SATO: [
    [people.sato, 26 * 60, 'お疲れさまです！来週の 1on1 の時間、火曜 15:00 からで大丈夫でしょうか？'],
    [people.sato, 25, '先ほどの件、顧客向けデモの資料を共有しました。\n<https://example.com/docs/demo-deck|デモ資料（ドラフト）>\n気になる点があればコメントください :bow:']
  ],
  C0SALES: [
    [people.watanabe, 6 * 60, '今月の商談パイプラインを更新しました :chart_with_upwards_trend:'],
    [people.yamamoto, 48, '<!here> サンプル商事様の契約更新、先方の稟議が通ったそうです！ :tada:', { reactions: [{ name: 'tada', count: 8 }, { name: 'clap', count: 4 }] }]
  ],
  G0LEADS: [[people.nakamura, 120, '来週のリーダー定例のアジェンダ案です。追加があればスレッドへどうぞ。', { replyCount: 4 }]],
  C0DESIGN: [
    [people.takahashi, 4 * 60, '新しいダッシュボードのワイヤーです :art:', { files: [{ name: 'dashboard-wireframe-v3.fig' }] }],
    [people.takahashi, 180, `<@${SLACK_DEMO_USER_ID}> カード内の情報量について意見をもらえると嬉しいです！`]
  ],
  M0TRIO: [
    [people.tanaka, 6 * 60, '明日のランチ、新しくできたカレー屋さん行きませんか？ :curry:'],
    [people.ito, 5 * 60, 'いいですね！12:15 にロビー集合で :ok_hand:']
  ],
  C0GENERAL: [[people.nakamura, 7 * 60, '【お知らせ】年末年始の休業期間についてポータルに掲載しました。']],
  D0YAMAMOTO: [[people.yamamoto, 26 * 60, '昨日はありがとうございました！議事録を共有しておきます。']],
  C0RANDOM: [[people.suzuki, 29 * 60, '社内の観葉植物、新しい鉢が届いてます :seedling:']]
}

/** デモ中に送信したメッセージ（アプリを閉じるまで保持） */
const sent: Record<string, Message[]> = {}
const DEMO_ME: Person = { id: SLACK_DEMO_USER_ID, name: 'あなた' }

function buildSlackMessages(conversationId: string): Message[] {
  const conv = slackConversations().find((c) => c.id === conversationId)
  if (!conv) return []
  const base = (slackHistory[conversationId] ?? []).map(([author, minutes, text, extra], i): Message => ({
    id: `${conversationId}:${i + 1}`,
    nativeId: `${i + 1}.000100`,
    source: 'slack',
    conversationId,
    conversationName: conv.name,
    conversationKind: conv.kind,
    author,
    text,
    format: 'slack',
    createdAt: ago(minutes * MIN),
    permalink: 'https://example.com/slack-demo',
    isMention: text.includes(`<@${SLACK_DEMO_USER_ID}>`) || text.includes('<!here>') || conv.kind === 'dm',
    ...extra
  }))
  return [...base, ...(sent[conversationId] ?? [])]
}

const decorateSelf = (m: Message): Message => ({
  ...m,
  text: m.text.replaceAll(`<@${SLACK_DEMO_USER_ID}>`, `<@${SLACK_DEMO_USER_ID}|あなた>`)
})

export const demoSlack: SlackProvider = {
  async listConversations() {
    return slackConversations()
  },
  async getHistory(id) {
    return buildSlackMessages(id).map(decorateSelf)
  },
  async getInbox() {
    return slackConversations()
      .flatMap((c) => buildSlackMessages(c.id))
      .filter((m) => m.isMention && m.createdAt > ago(2 * DAY))
      .map(decorateSelf)
      .sort((a, b) => b.createdAt - a.createdAt)
  },
  async getTodos(): Promise<SlackTodoResult> {
    const task = (id: string, text: string, conv: string, author: Person, extra: Partial<Task>): Task => ({
      id: `slack:demo:${id}`,
      source: 'slack',
      text,
      format: 'slack',
      status: 'open',
      dueHasTime: true,
      conversationName: conv,
      assignedBy: author,
      permalink: 'https://example.com/slack-demo',
      ...extra
    })
    return {
      tasks: [
        task('1', `<@${SLACK_DEMO_USER_ID}|あなた> リリースノートのドラフトをお願いできますか？ 明日の朝会で確認したいです :pray:`, 'product-dev', people.tanaka, { dueAt: daysFromNow(1, 9) }),
        task('2', 'カード内の情報量について意見をもらえると嬉しいです！', 'design-review', people.takahashi, { dueAt: todayAt(17) }),
        task('3', '先ほどの件、顧客向けデモの資料を共有しました。気になる点があればコメントください :bow:', people.sato.name, people.sato, { dueAt: ago(3 * HOUR) }),
        task('4', '来週のリーダー定例のアジェンダ案です。追加があればスレッドへどうぞ。', 'leads-weekly', people.nakamura, {}),
        task('5', '今月の商談パイプラインを更新しました :chart_with_upwards_trend:', 'sales-team', people.watanabe, { status: 'done', completedAt: ago(DAY) })
      ]
    }
  },
  async getEmoji(): Promise<SlackEmojiMap> {
    return { custom: {}, aliases: {} }
  },
  async markRead() {
    // デモでは既読状態を持たない
  },
  async sendMessage(conversationId, text, threadTs) {
    const conv = slackConversations().find((c) => c.id === conversationId)
    if (!conv) throw new Error('チャンネルが見つかりません')
    const list = (sent[conversationId] ??= [])
    const ts = `${Math.floor(Date.now() / 1000)}.${String(list.length).padStart(6, '0')}`
    list.push({
      id: `${conversationId}:${ts}`,
      nativeId: ts,
      threadId: threadTs,
      source: 'slack',
      conversationId,
      conversationName: conv.name,
      conversationKind: conv.kind,
      author: DEMO_ME,
      text,
      format: 'slack',
      createdAt: Date.now(),
      permalink: 'https://example.com/slack-demo'
    })
    return { ts }
  }
}
