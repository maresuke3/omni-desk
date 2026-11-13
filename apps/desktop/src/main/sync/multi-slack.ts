import type { SyncEngine, SyncSink } from '@omni-desk/connector-core'
import { emptyServiceSnapshot, type SendMessageInput, type SendMessageResult, type ServiceSnapshot } from '@omni-desk/contracts'
import { SlackService, SlackSync } from '@omni-desk/connector-slack'
import type { SlackSecrets } from '../settings'

/**
 * 複数の Slack ワークスペースの同期エンジンを束ね、
 * 1 つの `ServiceSnapshot`（`services.slack`）として状態ハブへ統合する。
 */
export class MultiSlackSync implements SyncEngine {
  private readonly entries: { key: string; sync: SlackSync; snap: ServiceSnapshot }[]

  constructor(
    secretsList: SlackSecrets[],
    private readonly sink: SyncSink,
    intervalMs: number
  ) {
    this.entries = secretsList.map((secrets) => {
      const snap = emptyServiceSnapshot()
      const entry = {
        key: secrets.teamUrl,
        snap,
        sync: null as unknown as SlackSync
      }
      const wrappedSink: SyncSink = {
        service: (changes) => {
          Object.assign(entry.snap, changes)
          this.flushMerged()
        },
        history: (conversationId, history) => this.sink.history(conversationId, history),
        handled: (ids) => this.sink.handled(ids)
      }
      entry.sync = new SlackSync({ provider: new SlackService(secrets), sink: wrappedSink, intervalMs })
      return entry
    })
  }

  private flushMerged(): void {
    const snaps = this.entries.map((e) => e.snap)
    const conversations = snaps.flatMap((s) => s.conversations ?? [])
    const inbox = snaps.flatMap((s) => s.inbox ?? []).sort((a, b) => b.createdAt - a.createdAt)
    const tasks = snaps.flatMap((s) => s.tasks ?? [])
    const customEmoji: Record<string, string> = {}
    const aliases: Record<string, string> = {}
    for (const s of snaps) {
      if (s.emoji) {
        Object.assign(customEmoji, s.emoji.custom)
        Object.assign(aliases, s.emoji.aliases)
      }
    }
    const anySyncing = snaps.some((s) => s.phase === 'syncing')
    const firstError = snaps.find((s) => s.error)?.error ?? null
    const allReady = snaps.every((s) => s.phase === 'ready')
    const lastSyncedAt = snaps.reduce<number | null>(
      (max, s) => (s.lastSyncedAt && (!max || s.lastSyncedAt > max) ? s.lastSyncedAt : max),
      null
    )

    this.sink.service({
      phase: anySyncing ? 'syncing' : firstError && conversations.length === 0 ? 'error' : allReady ? 'ready' : 'idle',
      error: firstError,
      lastSyncedAt,
      conversations: snaps.some((s) => s.conversations !== null) ? conversations : null,
      inbox: snaps.some((s) => s.inbox !== null) ? inbox : null,
      tasks: snaps.some((s) => s.tasks !== null) ? tasks : null,
      emoji: { custom: customEmoji, aliases }
    })
  }

  private ownerOf(conversationId: string): SlackSync {
    const found = this.entries.find((e) => e.snap.conversations?.some((c) => c.id === conversationId))
    return (found ?? this.entries[0]).sync
  }

  start(): void {
    for (const e of this.entries) e.sync.start()
  }

  stop(): void {
    for (const e of this.entries) e.sync.stop()
  }

  refresh(): void {
    for (const e of this.entries) e.sync.refresh()
  }

  resume(): void {
    for (const e of this.entries) e.sync.resume()
  }

  setIntervalMs(ms: number): void {
    for (const e of this.entries) e.sync.setIntervalMs(ms)
  }

  watch(conversationId: string | null): void {
    if (!conversationId) {
      for (const e of this.entries) e.sync.watch(null)
      return
    }
    const target = this.ownerOf(conversationId)
    for (const e of this.entries) {
      e.sync.watch(e.sync === target ? conversationId : null)
    }
  }

  send(input: SendMessageInput): Promise<SendMessageResult> {
    return this.ownerOf(input.conversationId).send(input)
  }

  async markRead(items: { conversationId: string; nativeId: string }[]): Promise<void> {
    const bySync = new Map<SlackSync, { conversationId: string; nativeId: string }[]>()
    for (const item of items) {
      const owner = this.ownerOf(item.conversationId)
      bySync.set(owner, [...(bySync.get(owner) ?? []), item])
    }
    await Promise.all([...bySync].map(([sync, list]) => sync.markRead(list)))
  }
}
