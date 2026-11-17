import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  emptyCalendarSnapshot,
  emptyKnowledgeSnapshot,
  emptyMailSnapshot,
  emptyServiceSnapshot,
  routes,
  type AppSnapshot,
  type AtlassianConnectInput,
  type BlockedSender,
  type CalendarCreateInput,
  type CalendarSnapshot,
  type CalendarUpdateInput,
  type ChatworkConnectInput,
  type GitHubConnectInput,
  type GitHubOAuthStartInput,
  type GoogleOAuthStartInput,
  type HistorySnapshot,
  type InboxItemState,
  type InboxStatus,
  type JiraCreateInput,
  type JiraUpdateInput,
  type KnowledgeBoardSnapshot,
  type MailSendInput,
  type MailSnapshot,
  type Message,
  type NotionConnectInput,
  type NotionPageCreateInput,
  type OAuthConnectInput,
  type PublicSettings,
  type Route,
  type SenderKey,
  type SendMessageInput,
  type ServiceSnapshot,
  type SettingsPatch,
  type SlackConnectInput,
  type SlackOAuthInput,
  type Source,
  type StateEvent
} from '@omni-desk/contracts'
import { ApiError, call } from './api'

/**
 * アプリ全体の状態を 1 か所に集めた Zustand ストア。
 *
 * - settings / services / histories: メインプロセスの状態ハブの写し（state:patch で更新される。画面からは書き換えない）
 * - ui: 画面遷移・絞り込みなど画面側だけの状態（ローカルに保存して次回起動時に復元）
 * - drafts / outbox: 入力中の返信と送信状況
 *
 * 書き換えはこのファイルの actions からだけ行う。各画面はセレクターで必要な部分だけ読む。
 */

export type SourceFilter = 'all' | Source
export type InboxPeriod = 'all' | 'today' | '7d' | '30d'

export interface UiState {
  route: Route
  inboxFilter: SourceFilter
  /** 受信箱のタブ（未対応 / あとで / 対応済み） */
  inboxStatus: InboxStatus
  inboxPeriod: InboxPeriod
  /** 受信箱の検索語（保存しない） */
  inboxQuery: string
  /** 受信箱で選択中のメッセージ（キーボード操作の対象。保存しない） */
  inboxSelected: string | null
  /** 「あとで」のメニューを開いているメッセージ（保存しない） */
  inboxSnoozeFor: string | null
  tasksStatus: 'open' | 'done'
  tasksFilter: SourceFilter
}

/** 画面下に出す通知（「対応済みにしました [元に戻す]」など） */
export interface Toast {
  id: number
  message: string
  tone: 'info' | 'warning' | 'danger'
  /** 元に戻せる操作か */
  undoable: boolean
}

/** 直前の受信箱の操作（元に戻す用） */
interface InboxUndo {
  items: Message[]
  previous: Record<string, InboxItemState | undefined>
}

export interface OutboxEntry {
  status: 'sending' | 'failed'
  error?: string
}

export interface AppState {
  /** メインプロセスから初期状態を受け取ったか */
  hydrated: boolean
  seq: number
  settings: PublicSettings | null
  services: Record<Source, ServiceSnapshot>
  knowledge: KnowledgeBoardSnapshot
  calendar: CalendarSnapshot
  mail: MailSnapshot
  histories: Record<string, HistorySnapshot>
  ui: UiState
  /** 入力中の本文（キーは入力欄ごと。例: `reply:chatwork:123:456`） */
  drafts: Record<string, string>
  /** 送信中・送信失敗の状態（キーは drafts と同じ） */
  outbox: Record<string, OutboxEntry>
  /** 直近に送信できた時刻（「送信しました」の表示用） */
  sentAt: Record<string, number>
  /** 受信箱でその場の返信欄を開いているメッセージ（同時に開くのは 1 つ） */
  activeReply: string | null
  /** 受信箱の対応状況（メインの写し。操作時は先に画面へ反映し、メインからの差分で確定する） */
  inboxStates: Record<string, InboxItemState>
  toast: Toast | null
  inboxUndo: InboxUndo | null
}

type SyncedState = Pick<AppState, 'seq' | 'settings' | 'services' | 'knowledge' | 'calendar' | 'mail' | 'histories' | 'inboxStates'>

const initialUi: UiState = {
  route: routes.home(),
  inboxFilter: 'all',
  inboxStatus: 'open',
  inboxPeriod: 'all',
  inboxQuery: '',
  inboxSelected: null,
  inboxSnoozeFor: null,
  tasksStatus: 'open',
  tasksFilter: 'all'
}

export const useAppStore = create<AppState>()(
  persist(
    (): AppState => ({
      hydrated: false,
      seq: 0,
      settings: null,
      services: { slack: emptyServiceSnapshot(), chatwork: emptyServiceSnapshot() },
      knowledge: emptyKnowledgeSnapshot(),
      calendar: emptyCalendarSnapshot(),
      mail: emptyMailSnapshot(),
      histories: {},
      ui: initialUi,
      drafts: {},
      outbox: {},
      sentAt: {},
      activeReply: null,
      inboxStates: {},
      toast: null,
      inboxUndo: null
    }),
    {
      name: 'omni-desk:ui',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // 保存するのは画面の状態だけ（メッセージ本文・下書き・検索語はディスクに書かない）
      partialize: (s) => ({ ui: { ...s.ui, inboxQuery: '', inboxSelected: null, inboxSnoozeFor: null } }),
      merge: (persisted, current) => ({
        ...current,
        ui: { ...current.ui, ...((persisted as Partial<AppState> | undefined)?.ui ?? {}) }
      })
    }
  )
)

// ------------------------------------------------------------------ メインからの差分の適用（純粋関数）

/** スナップショットより古い差分は捨て、新しい差分だけを適用する */
export function applyStateEvent(state: SyncedState, event: StateEvent): Partial<SyncedState> | null {
  if (event.seq <= state.seq) return null
  switch (event.kind) {
    case 'settings':
      return { seq: event.seq, settings: event.settings }
    case 'service':
      return {
        seq: event.seq,
        services: { ...state.services, [event.source]: { ...state.services[event.source], ...event.changes } }
      }
    case 'knowledge':
      return {
        seq: event.seq,
        knowledge: { ...state.knowledge, ...event.changes }
      }
    case 'calendar':
      return {
        seq: event.seq,
        calendar: { ...state.calendar, ...event.changes }
      }
    case 'mail':
      return {
        seq: event.seq,
        mail: { ...state.mail, ...event.changes }
      }
    case 'history': {
      const histories = { ...state.histories }
      if (event.history) histories[event.key] = event.history
      else delete histories[event.key]
      return { seq: event.seq, histories }
    }
    case 'reset':
      return {
        seq: event.seq,
        settings: event.snapshot.settings,
        services: event.snapshot.services,
        knowledge: event.snapshot.knowledge,
        calendar: event.snapshot.calendar,
        mail: event.snapshot.mail ?? emptyMailSnapshot(),
        histories: event.snapshot.histories,
        inboxStates: event.snapshot.inboxStates
      }
    case 'inbox-states':
      return { seq: event.seq, inboxStates: event.states }
  }
}

/** 対応状況の楽観的な反映（メインの setInboxStatus と同じ規則。確定値はメインからの差分で上書きされる） */
export function applyInboxStatus(
  states: Record<string, InboxItemState>,
  ids: readonly string[],
  status: InboxStatus,
  now: number,
  until?: number
): Record<string, InboxItemState> {
  const next = { ...states }
  for (const id of ids) {
    if (status === 'open') delete next[id]
    else next[id] = { status, until: status === 'snoozed' ? until : undefined, updatedAt: now, reason: 'manual' }
  }
  return next
}

const fromSnapshot = (s: AppSnapshot): SyncedState => ({
  seq: s.seq,
  settings: s.settings,
  services: s.services,
  knowledge: s.knowledge,
  calendar: s.calendar,
  mail: s.mail ?? emptyMailSnapshot(),
  histories: s.histories,
  inboxStates: s.inboxStates
})

let initPromise: Promise<void> | null = null

/**
 * 起動時に 1 回呼ぶ。先に差分の購読を始めてからスナップショットを取り、
 * 取得中に届いた差分は seq で重複を除いて適用する（取りこぼし防止）。
 */
export function initStore(): Promise<void> {
  initPromise ??= (async () => {
    const pending: StateEvent[] = []
    let ready = false
    window.dashboard.subscribe((event) => {
      if (!ready) pending.push(event)
      else useAppStore.setState((s) => applyStateEvent(s, event) ?? s)
    })
    const snapshot = await call('state:snapshot')
    useAppStore.setState({ ...fromSnapshot(snapshot), hydrated: true })
    for (const event of pending) useAppStore.setState((s) => applyStateEvent(s, event) ?? s)
    ready = true
  })()
  return initPromise
}

// ------------------------------------------------------------------ actions

const set = useAppStore.setState
const get = useAppStore.getState

const withSettings = async (p: Promise<PublicSettings>): Promise<PublicSettings> => {
  const settings = await p
  set({ settings })
  return settings
}

const omit = <T>(record: Record<string, T>, key: string): Record<string, T> => {
  const { [key]: _removed, ...rest } = record
  return rest
}

export const actions = {
  // ---- 画面遷移・画面の状態
  navigate(route: Route): void {
    set((s) => ({ ui: { ...s.ui, route } }))
  },
  setUi(patch: Partial<Omit<UiState, 'route'>>): void {
    // 値が変わらないときは状態を作り直さない（購読している画面の無駄な再描画・更新ループを防ぐ）
    const ui = get().ui
    if (Object.entries(patch).every(([k, v]) => ui[k as keyof UiState] === v)) return
    set({ ui: { ...ui, ...patch } })
  },

  // ---- 設定・接続
  updateSettings: (patch: SettingsPatch) => withSettings(call('settings:update', patch)),
  connectSlack: (input: SlackConnectInput) => withSettings(call('slack:connect', input)),
  connectSlackOAuth: (input: SlackOAuthInput) => withSettings(call('slack:connect-oauth', input)),
  disconnectSlack: (teamUrl?: string) => withSettings(call('slack:disconnect', teamUrl)),
  connectChatwork: (input: ChatworkConnectInput) => withSettings(call('chatwork:connect', input)),
  disconnectChatwork: () => withSettings(call('chatwork:disconnect')),
  connectGitHub: (input: GitHubConnectInput) => withSettings(call('github:connect', input)),
  connectGitHubOAuth: (input: OAuthConnectInput) => withSettings(call('github:connect-oauth', input)),
  startGitHubOAuth: (input?: GitHubOAuthStartInput) => withSettings(call('github:start-oauth', input)),
  disconnectGitHub: (accountId?: string) => withSettings(call('github:disconnect', accountId)),
  connectAtlassian: (input: AtlassianConnectInput) => withSettings(call('atlassian:connect', input)),
  disconnectAtlassian: () => withSettings(call('atlassian:disconnect')),
  connectNotion: (input: NotionConnectInput) => withSettings(call('notion:connect', input)),
  connectNotionOAuth: (input: OAuthConnectInput) => withSettings(call('notion:connect-oauth', input)),
  disconnectNotion: () => withSettings(call('notion:disconnect')),
  startGoogleOAuth: (input?: GoogleOAuthStartInput) => withSettings(call('google:start-oauth', input)),
  disconnectGoogleAccount: (accountId?: string) => withSettings(call('google:disconnect', accountId)),
  startGoogleCalendarOAuth: (input?: GoogleOAuthStartInput) => withSettings(call('google-calendar:start-oauth', input)),
  connectGoogleCalendarOAuth: (input: OAuthConnectInput) => withSettings(call('google-calendar:connect-oauth', input)),
  disconnectGoogleCalendar: () => withSettings(call('google-calendar:disconnect')),
  refreshCalendar: (): void => {
    call('calendar:refresh').catch((error) => console.error(error))
  },
  createCalendarEvent: (input: CalendarCreateInput) => call('calendar:create', input),
  updateCalendarEvent: (calendarId: string, eventId: string, patch: CalendarUpdateInput) =>
    call('calendar:update', { calendarId, eventId, patch }),
  deleteCalendarEvent: (calendarId: string, eventId: string) => call('calendar:delete', { calendarId, eventId }),
  startGoogleMailOAuth: (input?: GoogleOAuthStartInput) => withSettings(call('google-mail:start-oauth', input)),
  disconnectMailAccount: (accountId?: string) => withSettings(call('mail:disconnect', accountId)),
  refreshMail: (query?: string): void => {
    call('mail:refresh', query).catch((error) => console.error(error))
  },
  getMailBody: (accountId: string, messageId: string) => call('mail:get-body', { accountId, messageId }),
  setMailUnread: (accountId: string, messageId: string, unread: boolean) =>
    call('mail:set-unread', { accountId, messageId, unread }),
  archiveMail: (accountId: string, messageId: string) => call('mail:archive', { accountId, messageId }),
  sendMail: (input: MailSendInput) => call('mail:send', input),
  refreshKnowledge: (query?: { jql?: string; docQuery?: string }): void => {
    call('knowledge:refresh', query).catch((error) => console.error(error))
  },
  createNotionPage: (input: NotionPageCreateInput) => call('notion:create-page', input),
  createJiraIssue: (input: JiraCreateInput) => call('jira:create', input),
  updateJiraIssue: (key: string, patch: JiraUpdateInput) => call('jira:update', { key, patch }),
  addJiraComment: (key: string, body: string) => call('jira:comment', { key, body }),
  blockSender: (sender: BlockedSender) => withSettings(call('blocked-senders:add', sender)),
  unblockSender: ({ source, senderId }: SenderKey) =>
    withSettings(call('blocked-senders:remove', { source, senderId })),

  // ---- 同期
  refresh(): void {
    call('sync:refresh').catch((e) => console.error(e))
  },
  watch(target: { source: Source; conversationId: string } | null): void {
    call('sync:watch', target).catch((e) => console.error(e))
  },

  // ---- 受信箱
  /**
   * 対応状況を変える。画面にはすぐ反映し（楽観的更新）、失敗したら元に戻す。
   * 元に戻せるよう直前の状態を覚えておき、通知を出す。
   */
  async setInboxStatus(messages: readonly Message[], status: InboxStatus, until?: number, label?: string): Promise<void> {
    if (!messages.length) return
    const before = get().inboxStates
    const ids = messages.map((m) => m.id)
    set({
      inboxStates: applyInboxStatus(before, ids, status, Date.now(), until),
      inboxUndo: { items: [...messages], previous: Object.fromEntries(ids.map((id) => [id, before[id]])) },
      toast: label ? { id: Date.now(), message: label, tone: 'info', undoable: true } : get().toast,
      activeReply: ids.includes(get().activeReply ?? '') ? null : get().activeReply
    })
    try {
      const res = await call('inbox:set-status', {
        items: messages.map((m) => ({ id: m.id, source: m.source, conversationId: m.conversationId, nativeId: m.nativeId })),
        status,
        until
      })
      if (res.warning) actions.showToast(res.warning, 'warning')
    } catch (error) {
      set({ inboxStates: before, inboxUndo: null })
      actions.showToast(`対応状況を変更できませんでした：${(error as Error).message}`, 'danger')
    }
  },
  /** 直前の受信箱の操作を元に戻す */
  async undoInbox(): Promise<void> {
    const undo = get().inboxUndo
    if (!undo) return
    set({ inboxUndo: null, toast: null })
    // 直前の状態ごとにまとめて戻す（未対応 / 対応済み / あとで〈時刻ごと〉）
    const groups = new Map<string, { status: InboxStatus; until?: number; items: Message[] }>()
    for (const m of undo.items) {
      const prev = undo.previous[m.id]
      const key = prev ? `${prev.status}:${prev.until ?? ''}` : 'open'
      const g = groups.get(key) ?? { status: prev?.status ?? 'open', until: prev?.until, items: [] }
      g.items.push(m)
      groups.set(key, g)
    }
    for (const g of groups.values()) {
      // 過ぎてしまった「あとで」は未対応に戻す
      const status = g.status === 'snoozed' && (g.until ?? 0) <= Date.now() ? 'open' : g.status
      await actions.setInboxStatus(g.items, status, status === 'snoozed' ? g.until : undefined)
    }
    set({ inboxUndo: null })
  },
  showToast(message: string, tone: Toast['tone'] = 'info'): void {
    set({ toast: { id: Date.now(), message, tone, undoable: false } })
  },
  dismissToast(): void {
    set({ toast: null })
  },

  // ---- 返信・送信
  openReply(messageId: string): void {
    set({ activeReply: messageId })
  },
  closeReply(): void {
    set({ activeReply: null })
  },
  setDraft(key: string, text: string): void {
    set((s) => ({ drafts: { ...s.drafts, [key]: text }, outbox: s.outbox[key]?.status === 'failed' ? omit(s.outbox, key) : s.outbox }))
  },
  /** 送信する。成功したら下書きを消し、失敗したら下書きを残してエラーを outbox に記録する */
  async send(key: string, input: SendMessageInput): Promise<boolean> {
    if (get().outbox[key]?.status === 'sending') return false
    set((s) => ({ outbox: { ...s.outbox, [key]: { status: 'sending' } } }))
    try {
      await call('message:send', input)
      set((s) => ({
        drafts: omit(s.drafts, key),
        outbox: omit(s.outbox, key),
        sentAt: { ...s.sentAt, [key]: Date.now() }
      }))
      return true
    } catch (error) {
      const message = error instanceof ApiError || error instanceof Error ? error.message : String(error)
      set((s) => ({ outbox: { ...s.outbox, [key]: { status: 'failed', error: message } } }))
      return false
    }
  }
}
