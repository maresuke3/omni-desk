import {
  ChatworkService,
  ChatworkSync,
  demoChatwork,
  CHATWORK_DEMO_ACCOUNT_ID,
  type PersistedChatworkState
} from '@omni-desk/connector-chatwork'
import { AppError, chatworkRateGovernor, type SyncEngine } from '@omni-desk/connector-core'
import { demoSlack, SlackService, SlackSync } from '@omni-desk/connector-slack'
import type { InboxItemRef, SendMessageInput, SendMessageResult, Source } from '@omni-desk/contracts'
import { settings } from '../settings'
import type { StateHub } from './hub'
import type { InboxStateService } from './inbox'
import { encryptedFileStorage, removeStoredState } from './storage'

const chatworkStateName = (accountId: string): string => `chatwork-${accountId}`

/**
 * 同期エンジンの起動・停止を管理する。
 * 接続先（デモ / Slack のユーザー / Chatwork のアカウント）が変わったときだけ作り直し、
 * テーマ変更などでは作り直さない（作り直すとキャッシュを失い、起動時と同じ大量取得が起きるため）。
 */
export class SyncManager {
  private engines: Partial<Record<Source, SyncEngine>> = {}
  private slack: SlackSync | null = null
  private key = ''
  private watched: { source: Source; conversationId: string } | null = null
  private queue: Promise<void> = Promise.resolve()

  constructor(
    private readonly hub: StateHub,
    private readonly inbox: InboxStateService
  ) {
    // サービス側で返信済みと分かった自分宛ては、受信箱で対応済みにする
    hub.onHandled((ids) => inbox.replied(ids))
  }

  /** 設定に合わせてエンジンを揃える（接続先が変わっていなければ何もしない） */
  apply(): Promise<void> {
    this.queue = this.queue.then(() => this.reconcile()).catch((error) => console.error('[sync] 起動に失敗しました', error))
    return this.queue
  }

  private connectionKey(): string {
    const s = settings.toPublic()
    if (s.demoActive) return 'demo'
    return `slack:${s.slack ? `${s.slack.teamUrl}:${s.slack.userId}:${s.slack.authType}` : '-'}|chatwork:${s.chatwork?.accountId ?? '-'}`
  }

  private async reconcile(): Promise<void> {
    const key = this.connectionKey()
    if (key === this.key) return
    this.stopAll()
    this.key = key
    this.hub.resetServices()

    const s = settings.toPublic()
    const intervalMs = s.refreshIntervalSec * 1000

    if (s.demoActive) {
      this.slack = new SlackSync({ provider: demoSlack, sink: this.hub.sink('slack'), intervalMs })
      this.engines.slack = this.slack
      this.engines.chatwork = new ChatworkSync({
        provider: demoChatwork,
        sink: this.hub.sink('chatwork'),
        governor: chatworkRateGovernor(),
        me: { accountId: CHATWORK_DEMO_ACCOUNT_ID, name: 'デモ 太郎' }
      })
    } else {
      const slackSecrets = s.slack ? await settings.slackSecrets() : null
      if (slackSecrets) {
        this.slack = new SlackSync({ provider: new SlackService(slackSecrets), sink: this.hub.sink('slack'), intervalMs })
        this.engines.slack = this.slack
      }
      const cw = s.chatwork ? await settings.chatworkSecrets() : null
      if (cw) {
        // 1 アカウントの API 呼び出しはすべて同じ予算で管理する
        const governor = chatworkRateGovernor()
        this.engines.chatwork = new ChatworkSync({
          provider: new ChatworkService(cw, governor),
          sink: this.hub.sink('chatwork'),
          governor,
          me: { accountId: cw.accountId, name: cw.name, avatarUrl: cw.avatarUrl },
          storage: encryptedFileStorage<PersistedChatworkState>(chatworkStateName(cw.accountId), () => settings.init())
        })
      }
    }
    for (const engine of Object.values(this.engines)) engine.start()
    if (this.watched) this.engines[this.watched.source]?.watch(this.watched.conversationId)
  }

  private stopAll(): void {
    for (const engine of Object.values(this.engines)) engine.stop()
    this.engines = {}
    this.slack = null
  }

  setIntervalSec(sec: number): void {
    this.slack?.setIntervalMs(sec * 1000)
  }

  refresh(): void {
    for (const engine of Object.values(this.engines)) engine.refresh()
  }

  resume(): void {
    for (const engine of Object.values(this.engines)) engine.resume()
  }

  watch(target: { source: Source; conversationId: string } | null): void {
    if (this.watched && this.watched.source !== target?.source) this.engines[this.watched.source]?.watch(null)
    this.watched = target
    if (target) this.engines[target.source]?.watch(target.conversationId)
  }

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    const engine = this.engines[input.source]
    if (!engine) throw new AppError('not_configured', '送信先のサービスが接続されていません')
    const result = await engine.send(input)
    // 返信したメッセージは受信箱で対応済みにする（Message.id は「会話ID:サービス上のID」）
    if (input.replyTo) this.inbox.replied([`${input.conversationId}:${input.replyTo.messageId}`])
    return result
  }

  /** サービス側を既読にする（受信箱で対応済みにしたとき、設定が ON の場合） */
  async markRead(items: readonly InboxItemRef[]): Promise<void> {
    const bySource = new Map<Source, InboxItemRef[]>()
    for (const item of items) bySource.set(item.source, [...(bySource.get(item.source) ?? []), item])
    await Promise.all(
      [...bySource].map(([source, list]) => {
        const engine = this.engines[source]
        if (!engine) throw new AppError('not_configured', 'サービスが接続されていません')
        return engine.markRead(list)
      })
    )
  }

  /** Chatwork の接続解除時に、保存していた同期状態も消す */
  forgetChatwork(accountId: string): void {
    removeStoredState(chatworkStateName(accountId))
  }

  dispose(): void {
    this.stopAll()
  }
}
