import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { InboxStatus } from '@omni-desk/contracts'
import { markReplied, pruneInboxStates, setInboxStatus, type InboxStates } from '../inbox-state'
import type { StateHub } from './hub'

/**
 * 受信箱の対応状況の保存と配信。メッセージの ID と状態・時刻だけを保存する（本文は含めない）。
 */
export class InboxStateService {
  private states: InboxStates = {}
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly hub: StateHub) {
    this.states = this.load()
    this.hub.setInboxStates(this.states)
  }

  private get file(): string {
    return join(app.getPath('userData'), 'inbox-state.json')
  }

  private load(): InboxStates {
    try {
      if (existsSync(this.file)) return pruneInboxStates(JSON.parse(readFileSync(this.file, 'utf8')), Date.now())
    } catch (error) {
      console.error('[inbox] 対応状況を読み込めませんでした', error)
    }
    return {}
  }

  set(ids: readonly string[], status: InboxStatus, until?: number): void {
    this.update(setInboxStatus(this.states, ids, status, { now: Date.now(), until }))
  }

  /** 返信済みと分かったもの（アプリから返信した / サービス側で返信していた）を対応済みにする */
  replied(ids: readonly string[]): void {
    this.update(markReplied(this.states, ids, Date.now()))
  }

  private update(next: InboxStates): void {
    if (next === this.states) return
    this.states = next
    this.hub.setInboxStates(next)
    this.scheduleSave()
  }

  private scheduleSave(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.save()
    }, 1_000)
  }

  /** 終了時にも呼ぶ */
  save(): void {
    try {
      const data = pruneInboxStates(this.states, Date.now())
      mkdirSync(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 })
      renameSync(tmp, this.file)
    } catch (error) {
      console.error('[inbox] 対応状況を保存できませんでした', error)
    }
  }
}
