/**
 * 各サービスのデータを正規化した共通型。
 * Teams / メールを追加するときも、この型に寄せれば UI 側はそのまま使える。
 */

export type Source = 'slack' | 'chatwork'

/** メッセージ本文の記法。描画時のパーサー選択に使う */
export type TextFormat = 'slack' | 'chatwork' | 'plain'

export interface Person {
  id: string
  name: string
  avatarUrl?: string
}

export type ConversationKind = 'channel' | 'private' | 'dm' | 'group' | 'my'

export interface Conversation {
  id: string
  source: Source
  name: string
  kind: ConversationKind
  iconUrl?: string
  /** 未読件数（Chatwork のみ件数が分かる） */
  unreadCount?: number
  /** 未読があるか（Slack はブラウザセッション接続時のみ分かる） */
  hasUnread?: boolean
  mentionCount?: number
  /** 最終更新（ms）。分からない場合は undefined */
  lastActivityAt?: number
  /** 上部固定（Chatwork のピン留め） */
  pinned?: boolean
  /** メッセージ総数（Chatwork の変更検知に使う） */
  messageCount?: number
  /** 自分の未完了タスク数（Chatwork の変更検知に使う） */
  myTaskCount?: number
}

export interface Reaction {
  name: string
  count: number
}

export interface FileRef {
  name: string
  url?: string
}

export interface Message {
  /** アプリ内で一意な ID（`会話ID:サービス上のID`） */
  id: string
  /** サービス上の ID（Slack は ts、Chatwork は message_id）。返信先の指定に使う */
  nativeId: string
  /** Slack のスレッドの親の ts（スレッド内の投稿のとき） */
  threadId?: string
  source: Source
  conversationId: string
  conversationName: string
  conversationKind: ConversationKind
  author: Person
  text: string
  format: TextFormat
  /** 送信日時（ms） */
  createdAt: number
  editedAt?: number
  permalink?: string
  /** 自分宛て（メンション / To / 返信 / 全員宛て） */
  isMention?: boolean
  isUnread?: boolean
  isBot?: boolean
  replyCount?: number
  reactions?: Reaction[]
  files?: FileRef[]
}

export type TaskStatus = 'open' | 'done'

export interface Task {
  id: string
  source: Source
  text: string
  format: TextFormat
  status: TaskStatus
  /** 期限（ms） */
  dueAt?: number
  /** 期限に時刻まで含むか（false なら日付のみ） */
  dueHasTime: boolean
  createdAt?: number
  completedAt?: number
  conversationId?: string
  conversationName?: string
  /** 依頼者（Chatwork）／元メッセージの投稿者（Slack） */
  assignedBy?: Person
  permalink?: string
}

export interface SlackTodoResult {
  tasks: Task[]
  /** To-dos が取得できない場合の理由（認証方式の制約など） */
  unavailableReason?: string
}

export interface SlackEmojiMap {
  /** カスタム絵文字名 → 画像 URL */
  custom: Record<string, string>
  /** エイリアス名 → 参照先の絵文字名 */
  aliases: Record<string, string>
}

export interface ChatworkStatus {
  unreadRoomCount: number
  mentionRoomCount: number
  taskRoomCount: number
  unreadCount: number
  mentionCount: number
  taskCount: number
}

export type SlackAuthType = 'user' | 'session'
export type ThemePreference = 'system' | 'light' | 'dark'

export interface SlackConnectionInfo {
  authType: SlackAuthType
  teamName: string
  teamUrl: string
  userId: string
  userName: string
}

export interface ChatworkConnectionInfo {
  accountId: string
  name: string
  avatarUrl?: string
  organizationName?: string
}

export interface GitHubConnectionInfo {
  login: string
  name: string
  avatarUrl?: string
}

export interface AtlassianConnectionInfo {
  binaryPath: string
  siteUrl?: string
  version: string
}

export interface NotionConnectionInfo {
  id: string
  name: string
  avatarUrl?: string
  workspaceName?: string
}

/** 送信者を特定するキー。ID 体系がサービスごとに違うので source とセットで扱う */
export interface SenderKey {
  source: Source
  /** Slack: ユーザー ID（Bot の場合は bot_id）、Chatwork: アカウント ID。`Message.author.id` と同じ値 */
  senderId: string
}

/** 受信箱で非表示にする送信者（会話画面・タスクには影響しない） */
export interface BlockedSender extends SenderKey {
  /** 登録時点の表示名（一覧表示用） */
  name: string
}

/** レンダラーに渡す設定。トークンは絶対に含めない */
export interface PublicSettings {
  slack: SlackConnectionInfo | null
  /** 接続済みの全 Slack ワークスペース（複数ワークスペース対応） */
  slackWorkspaces: SlackConnectionInfo[]
  chatwork: ChatworkConnectionInfo | null
  github: GitHubConnectionInfo | null
  atlassian: AtlassianConnectionInfo | null
  notion: NotionConnectionInfo | null
  refreshIntervalSec: number
  theme: ThemePreference
  /** 明示的にデモモードを有効にしているか */
  demoMode: boolean
  /** 実際にデモデータを表示しているか（明示 ON、またはどのサービスも未接続） */
  demoActive: boolean
  /** OS の暗号化ストレージが使えるか */
  encryptionAvailable: boolean
  /** 自分の ID（メンションの強調表示に使う）。デモ時はデモ用 ID */
  identity: { slackUserId?: string; chatworkAccountId?: string }
  /** 受信箱で非表示にする送信者（登録順） */
  blockedSenders: BlockedSender[]
  /** 受信箱で対応済みにしたとき、Chatwork / Slack 側も既読にするか（既定はアプリ内だけ） */
  markReadOnDone: boolean
}

export interface SettingsPatch {
  refreshIntervalSec?: number
  theme?: ThemePreference
  demoMode?: boolean
  markReadOnDone?: boolean
}

export const SLACK_USER_SCOPES = [
  'channels:history',
  'channels:read',
  'groups:history',
  'groups:read',
  'im:history',
  'im:read',
  'mpim:history',
  'mpim:read',
  'users:read',
  'search:read',
  'emoji:read',
  'chat:write'
] as const

export interface SlackConnectInput {
  token: string
  /** ブラウザセッション（xoxc）の場合のみ必要な `d` Cookie */
  cookie?: string
}

export interface OAuthConnectInput {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** 認可後にリダイレクトされた URL 全体、または `code` パラメータの値 */
  codeOrUrl: string
  state?: string
}

export type SlackOAuthInput = OAuthConnectInput

/** Slack OAuth 2.0 認可 URL を組み立てる（User OAuth Token 取得用） */
export function buildSlackAuthorizeUrl(params: {
  clientId: string
  redirectUri: string
  state: string
}): string {
  const url = new URL('https://slack.com/oauth/v2/authorize')
  url.searchParams.set('client_id', params.clientId.trim())
  url.searchParams.set('user_scope', SLACK_USER_SCOPES.join(','))
  url.searchParams.set('redirect_uri', params.redirectUri.trim())
  url.searchParams.set('state', params.state)
  return url.toString()
}

/** GitHub OAuth 2.0 認可 URL を組み立てる */
export function buildGitHubAuthorizeUrl(params: {
  clientId: string
  redirectUri: string
  state: string
}): string {
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', params.clientId.trim())
  url.searchParams.set('scope', 'repo read:user')
  url.searchParams.set('redirect_uri', params.redirectUri.trim())
  url.searchParams.set('state', params.state)
  return url.toString()
}

/** Notion OAuth 2.0 認可 URL を組み立てる */
export function buildNotionAuthorizeUrl(params: {
  clientId: string
  redirectUri: string
  state: string
}): string {
  const url = new URL('https://api.notion.com/v1/oauth/authorize')
  url.searchParams.set('client_id', params.clientId.trim())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('owner', 'user')
  url.searchParams.set('redirect_uri', params.redirectUri.trim())
  url.searchParams.set('state', params.state)
  return url.toString()
}

export interface ChatworkConnectInput {
  token: string
}

export interface GitHubConnectInput {
  token: string
}

export interface AtlassianConnectInput {
  binaryPath?: string
  siteUrl?: string
}

export interface NotionConnectInput {
  token: string
}

// ------------------------------------------------------------------ 送信

/** 返信先のメッセージ（Chatwork は返信タグ、Slack はスレッドの指定に使う） */
export interface ReplyTarget {
  /** 返信先の `Message.nativeId` */
  messageId: string
  authorId: string
  authorName: string
  /** Slack: 返信先が属するスレッドの ts */
  threadId?: string
}

export interface SendMessageInput {
  source: Source
  conversationId: string
  text: string
  replyTo?: ReplyTarget
}

export interface SendMessageResult {
  /** 送信したメッセージのサービス上の ID */
  nativeId: string
}

// ------------------------------------------------------------------ 同期状態（メイン → レンダラー）

export type ErrorCode =
  | 'not_configured'
  | 'auth_error'
  | 'rate_limited'
  | 'network'
  | 'unsupported'
  | 'invalid_input'
  | 'api_error'
  | 'unknown'

export interface ApiErrorPayload {
  code: ErrorCode
  message: string
}

/** API 利用枠の状況（Chatwork: 5 分あたり 300 回） */
export interface RateStatus {
  limit: number
  /** 残り回数（サーバーのヘッダーとアプリ内の計測の小さい方） */
  remaining: number
  /** 次に枠が回復する時刻（ms） */
  resetAt: number | null
  /** 429 を受けて止めている場合、その解除時刻（ms） */
  blockedUntil: number | null
  /** 待ち行列に残っている取得・送信の数 */
  queued: number
}

export type SyncPhase = 'idle' | 'syncing' | 'ready' | 'error'

/** サービスごとの同期済みデータ。null は「まだ取得していない」 */
export interface ServiceSnapshot {
  phase: SyncPhase
  error: ApiErrorPayload | null
  lastSyncedAt: number | null
  conversations: Conversation[] | null
  /** 自分宛てメッセージ（新しい順） */
  inbox: Message[] | null
  tasks: Task[] | null
  /** タスクを取得できない理由（Slack To-dos の認証方式の制約など） */
  tasksUnavailableReason?: string
  /** Chatwork: ルーム一覧から集計した件数 */
  status?: ChatworkStatus | null
  /** Slack: カスタム絵文字 */
  emoji?: SlackEmojiMap | null
  rate?: RateStatus | null
}

/** 会話画面で開いているチャンネル・ルームの履歴 */
export interface HistorySnapshot {
  source: Source
  conversationId: string
  messages: Message[] | null
  loading: boolean
  error: ApiErrorPayload | null
  fetchedAt: number | null
}

export interface KnowledgeBoardSnapshot {
  loading: boolean
  error: ApiErrorPayload | null
  lastSyncedAt: number | null
  pullRequests: PullRequest[]
  repos: GitHubRepo[]
  jiraIssues: JiraIssue[]
  docs: KnowledgeDoc[]
}

export const emptyKnowledgeSnapshot = (): KnowledgeBoardSnapshot => ({
  loading: false,
  error: null,
  lastSyncedAt: null,
  pullRequests: [],
  repos: [],
  jiraIssues: [],
  docs: []
})

export interface AppSnapshot {
  /** 状態の版。差分イベントの seq がこれ以下なら、すでにスナップショットに含まれている */
  seq: number
  settings: PublicSettings
  services: Record<Source, ServiceSnapshot>
  knowledge: KnowledgeBoardSnapshot
  histories: Record<string, HistorySnapshot>
  /** 受信箱の対応状況（キーは Message.id。未対応のものは持たない） */
  inboxStates: Record<string, InboxItemState>
}

/** メインからレンダラーへ送る差分 */
export type StatePatch =
  | { kind: 'settings'; settings: PublicSettings }
  | { kind: 'service'; source: Source; changes: Partial<ServiceSnapshot> }
  | { kind: 'knowledge'; changes: Partial<KnowledgeBoardSnapshot> }
  | { kind: 'history'; key: string; history: HistorySnapshot | null }
  | { kind: 'reset'; snapshot: AppSnapshot }
  | { kind: 'inbox-states'; states: Record<string, InboxItemState> }

/** 実際に送られるイベント（差分＋通し番号） */
export type StateEvent = StatePatch & { seq: number }

export const historyKey = (source: Source, conversationId: string): string => `${source}:${conversationId}`

export const emptyServiceSnapshot = (): ServiceSnapshot => ({
  phase: 'idle',
  error: null,
  lastSyncedAt: null,
  conversations: null,
  inbox: null,
  tasks: null,
  status: null,
  emoji: null,
  rate: null
})

// ------------------------------------------------------------------ 受信箱の対応状況

/** 未対応 / 対応済み / あとで（指定時刻まで隠す。過ぎたら未対応に戻る） */
export type InboxStatus = 'open' | 'done' | 'snoozed'

/** 受信箱の 1 件の対応状況（PC に保存する。未対応のものは記録しない） */
export interface InboxItemState {
  status: 'done' | 'snoozed'
  /** あとで: この時刻（ms）まで隠す */
  until?: number
  updatedAt: number
  /** manual: 利用者の操作 / replied: 返信したので自動で対応済み */
  reason: 'manual' | 'replied'
}

/** 対応状況を変える対象（既読連携のためにサービス上の ID も渡す） */
export interface InboxItemRef {
  /** Message.id */
  id: string
  source: Source
  conversationId: string
  nativeId: string
}

export interface SetInboxStatusResult {
  /** 対応状況は変えられたが、サービス側の既読化に失敗したときなど */
  warning?: string
}

export interface SetInboxStatusInput {
  items: InboxItemRef[]
  status: InboxStatus
  /** status が snoozed のとき必須 */
  until?: number
}

// ------------------------------------------------------------------ ナレッジボード / ワーク

export type KnowledgeSource = 'confluence' | 'notion'

/** Confluence / Notion で共有された資料・ナレッジの共通型 */
export interface KnowledgeDoc {
  id: string
  source: KnowledgeSource
  title: string
  /** Confluence のスペース名 / Notion の親ページ・DB 名 */
  spaceOrParent?: string
  excerpt?: string
  url: string
  author?: Person
  updatedAt: number
}

export type PullRequestRole = 'author' | 'reviewer'

export interface PullRequest {
  id: string
  number: number
  title: string
  /** `owner/repo` 形式 */
  repo: string
  url: string
  state: 'open' | 'closed' | 'merged'
  isDraft: boolean
  author: Person
  role: PullRequestRole
  createdAt: number
  updatedAt: number
}

export interface GitHubRepo {
  id: string
  fullName: string
  description?: string
  url: string
  isPrivate: boolean
  updatedAt: number
}

export type JiraStatusCategory = 'todo' | 'in_progress' | 'done'

export interface JiraIssue {
  key: string
  summary: string
  status: string
  statusCategory: JiraStatusCategory
  priority?: string
  issueType?: string
  projectKey: string
  assignee?: Person
  updatedAt: number
  url?: string
}

export interface JiraCreateInput {
  projectKey: string
  summary: string
  description?: string
  issueType?: string
}

export interface JiraUpdateInput {
  summary?: string
  description?: string
  status?: string
  assignee?: string
}
