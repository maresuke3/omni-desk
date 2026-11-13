import type {
  ApiErrorPayload,
  AppSnapshot,
  AtlassianConnectInput,
  BlockedSender,
  ChatworkConnectInput,
  GitHubConnectInput,
  JiraCreateInput,
  JiraIssue,
  JiraUpdateInput,
  NotionConnectInput,
  OAuthConnectInput,
  PublicSettings,
  SenderKey,
  SendMessageInput,
  SendMessageResult,
  SetInboxStatusInput,
  SetInboxStatusResult,
  SettingsPatch,
  SlackConnectInput,
  SlackOAuthInput,
  Source,
  StateEvent
} from './types'


/**
 * メイン ⇔ レンダラー間の IPC 契約（レンダラーからの呼び出し）。
 * キーがチャンネル名、値がハンドラーのシグネチャ。
 *
 * データの取得はメインプロセスの同期エンジンが行い、結果は `state:patch` イベントで
 * レンダラーへ送られる。レンダラーから API を直接叩くチャンネルは持たない
 * （レート制限の予算をメインの 1 か所で管理するため）。
 */
export interface ApiContract {
  'settings:get': () => PublicSettings
  'settings:update': (patch: SettingsPatch) => PublicSettings
  'slack:connect': (input: SlackConnectInput) => PublicSettings
  'slack:connect-oauth': (input: SlackOAuthInput) => PublicSettings
  'slack:disconnect': (teamUrl?: string) => PublicSettings
  'chatwork:connect': (input: ChatworkConnectInput) => PublicSettings
  'chatwork:disconnect': () => PublicSettings
  'github:connect': (input: GitHubConnectInput) => PublicSettings
  'github:connect-oauth': (input: OAuthConnectInput) => PublicSettings
  'github:disconnect': () => PublicSettings
  'atlassian:connect': (input: AtlassianConnectInput) => PublicSettings
  'atlassian:disconnect': () => PublicSettings
  'notion:connect': (input: NotionConnectInput) => PublicSettings
  'notion:connect-oauth': (input: OAuthConnectInput) => PublicSettings
  'notion:disconnect': () => PublicSettings
  /** ナレッジボード（PR・リポジトリ・Jira・Confluence・Notion）を再取得する */
  'knowledge:refresh': (query?: { jql?: string; docQuery?: string }) => void
  'jira:create': (input: JiraCreateInput) => JiraIssue
  'jira:update': (input: { key: string; patch: JiraUpdateInput }) => void
  'jira:comment': (input: { key: string; body: string }) => void
  /** 受信箱で非表示にする送信者を追加する（登録済みなら何もしない） */
  'blocked-senders:add': (sender: BlockedSender) => PublicSettings
  'blocked-senders:remove': (sender: SenderKey) => PublicSettings

  /** 現在の状態をまとめて取得する（起動時の初期化用。以降は state:patch で差分が届く） */
  'state:snapshot': () => AppSnapshot
  /** すぐに同期し直す（更新ボタン） */
  'sync:refresh': () => void
  /** 会話画面で開いている会話をメインに伝える（その会話の履歴を優先して取得・更新する） */
  'sync:watch': (target: { source: Source; conversationId: string } | null) => void
  /** メッセージを送信する（返信を含む）。返信先が受信箱にあれば自動で対応済みにする */
  'message:send': (input: SendMessageInput) => SendMessageResult
  /** 受信箱の対応状況を変える（設定で ON ならサービス側も既読にする） */
  'inbox:set-status': (input: SetInboxStatusInput) => SetInboxStatusResult

  'app:open-external': (url: string) => void
}

export type ApiChannel = keyof ApiContract
export type ApiArgs<C extends ApiChannel> = Parameters<ApiContract[C]>
export type ApiReturn<C extends ApiChannel> = ReturnType<ApiContract[C]>

export const API_CHANNELS = [
  'settings:get',
  'settings:update',
  'slack:connect',
  'slack:connect-oauth',
  'slack:disconnect',
  'chatwork:connect',
  'chatwork:disconnect',
  'github:connect',
  'github:connect-oauth',
  'github:disconnect',
  'atlassian:connect',
  'atlassian:disconnect',
  'notion:connect',
  'notion:connect-oauth',
  'notion:disconnect',
  'knowledge:refresh',
  'jira:create',
  'jira:update',
  'jira:comment',
  'blocked-senders:add',
  'blocked-senders:remove',
  'state:snapshot',
  'sync:refresh',
  'sync:watch',
  'message:send',
  'inbox:set-status',
  'app:open-external'
] as const satisfies readonly ApiChannel[]

/** メイン → レンダラーの状態差分イベント */
export const STATE_PATCH_CHANNEL = 'state:patch'

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: ApiErrorPayload }

/** preload が window.dashboard に公開する API */
export interface DashboardBridge {
  platform: string
  invoke<C extends ApiChannel>(channel: C, ...args: ApiArgs<C>): Promise<IpcResult<ApiReturn<C>>>
  /** 状態差分の購読。戻り値を呼ぶと解除する */
  subscribe(listener: (event: StateEvent) => void): () => void
}
