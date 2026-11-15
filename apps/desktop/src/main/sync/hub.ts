import { BrowserWindow } from 'electron'
import {
  emptyCalendarSnapshot,
  emptyKnowledgeSnapshot,
  emptyMailSnapshot,
  emptyServiceSnapshot,
  historyKey,
  STATE_PATCH_CHANNEL,
  type AppSnapshot,
  type CalendarSnapshot,
  type HistorySnapshot,
  type InboxItemState,
  type KnowledgeBoardSnapshot,
  type MailSnapshot,
  type PublicSettings,
  type ServiceSnapshot,
  type Source,
  type StateEvent,
  type StatePatch
} from '@omni-desk/contracts'
import type { SyncSink } from '@omni-desk/connector-core'

/**
 * メインプロセス側の状態の集約点。同期エンジンの結果をここに集め、差分をレンダラーへ送る。
 * レンダラーの Zustand ストアはこの内容を写したもの（正はこちら）。
 */
export class StateHub {
  private snapshot: AppSnapshot

  constructor(settings: PublicSettings) {
    this.snapshot = {
      seq: 0,
      settings,
      services: { slack: emptyServiceSnapshot(), chatwork: emptyServiceSnapshot() },
      knowledge: emptyKnowledgeSnapshot(),
      calendar: emptyCalendarSnapshot(),
      mail: emptyMailSnapshot(),
      histories: {},
      inboxStates: {}
    }
  }

  private handledListener: ((ids: string[]) => void) | null = null

  /** 同期エンジンが「サービス側で返信済み」と報告したときの受け取り先 */
  onHandled(listener: (ids: string[]) => void): void {
    this.handledListener = listener
  }

  setInboxStates(states: Record<string, InboxItemState>): void {
    this.snapshot = { ...this.snapshot, inboxStates: states }
    this.broadcast({ kind: 'inbox-states', states })
  }

  get(): AppSnapshot {
    return this.snapshot
  }

  setSettings(settings: PublicSettings): void {
    this.snapshot = { ...this.snapshot, settings }
    this.broadcast({ kind: 'settings', settings })
  }

  setKnowledge(changes: Partial<KnowledgeBoardSnapshot>): void {
    this.snapshot = { ...this.snapshot, knowledge: { ...this.snapshot.knowledge, ...changes } }
    this.broadcast({ kind: 'knowledge', changes })
  }

  setCalendar(changes: Partial<CalendarSnapshot>): void {
    this.snapshot = { ...this.snapshot, calendar: { ...this.snapshot.calendar, ...changes } }
    this.broadcast({ kind: 'calendar', changes })
  }

  setMail(changes: Partial<MailSnapshot>): void {
    const prev = this.snapshot.mail ?? emptyMailSnapshot()
    this.snapshot = { ...this.snapshot, mail: { ...prev, ...changes } }
    this.broadcast({ kind: 'mail', changes })
  }

  /** 接続先が変わったときなど、サービスのデータを空にして送り直す */
  resetServices(): void {
    this.snapshot = {
      ...this.snapshot,
      services: { slack: emptyServiceSnapshot(), chatwork: emptyServiceSnapshot() },
      histories: {}
    }
    this.broadcast({ kind: 'reset', snapshot: this.snapshot })
  }

  /** 同期エンジンに渡す書き出し口 */
  sink(source: Source): SyncSink {
    return {
      service: (changes) => this.service(source, changes),
      history: (conversationId, history) => this.history(source, conversationId, history),
      handled: (ids) => this.handledListener?.(ids)
    }
  }

  private service(source: Source, changes: Partial<ServiceSnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      services: { ...this.snapshot.services, [source]: { ...this.snapshot.services[source], ...changes } }
    }
    this.broadcast({ kind: 'service', source, changes })
  }

  private history(source: Source, conversationId: string, history: HistorySnapshot | null): void {
    const key = historyKey(source, conversationId)
    const histories = { ...this.snapshot.histories }
    if (history) histories[key] = history
    else delete histories[key]
    this.snapshot = { ...this.snapshot, histories }
    this.broadcast({ kind: 'history', key, history })
  }

  private broadcast(patch: StatePatch): void {
    const seq = this.snapshot.seq + 1
    this.snapshot = { ...this.snapshot, seq }
    const event: StateEvent = { ...patch, seq }
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(STATE_PATCH_CHANNEL, event)
    }
  }
}
