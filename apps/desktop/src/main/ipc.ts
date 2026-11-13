import { ipcMain, nativeTheme, shell, type IpcMainInvokeEvent } from 'electron'
import { verifyChatwork } from '@omni-desk/connector-chatwork'
import { AppError, toErrorPayload } from '@omni-desk/connector-core'
import { verifySlack } from '@omni-desk/connector-slack'
import type {
  ApiArgs,
  ApiChannel,
  ApiReturn,
  IpcResult,
  PublicSettings,
  InboxItemRef,
  InboxStatus,
  ReplyTarget,
  SendMessageInput,
  SetInboxStatusInput,
  Source
} from '@omni-desk/contracts'
import { parseBlockedSender, parseSenderKey } from './blocked-senders'
import { assertInboxId } from './inbox-state'
import { settings } from './settings'
import type { StateHub } from './sync/hub'
import type { InboxStateService } from './sync/inbox'
import type { SyncManager } from './sync/manager'

type Handler<C extends ApiChannel> = (...args: ApiArgs<C>) => ApiReturn<C> | Promise<ApiReturn<C>>

function handle<C extends ApiChannel>(
  channel: C,
  isTrusted: (event: IpcMainInvokeEvent) => boolean,
  fn: Handler<C>
): void {
  ipcMain.handle(channel, async (event, ...args): Promise<IpcResult<ApiReturn<C>>> => {
    if (!isTrusted(event)) {
      return { ok: false, error: { code: 'unknown', message: 'Untrusted sender' } }
    }
    try {
      return { ok: true, data: await fn(...(args as ApiArgs<C>)) }
    } catch (error) {
      if (!(error instanceof AppError)) console.error(`[ipc] ${channel}`, error)
      return { ok: false, error: toErrorPayload(error) }
    }
  })
}

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError('invalid_input', `${label}を入力してください`)
  }
  return value.trim()
}

const SOURCES: readonly Source[] = ['slack', 'chatwork']
const CONVERSATION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const NATIVE_ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

function parseTarget(input: unknown): { source: Source; conversationId: string } {
  if (!isRecord(input)) throw new AppError('invalid_input', '会話の指定が不正です')
  const { source, conversationId } = input
  if (typeof source !== 'string' || !SOURCES.includes(source as Source)) {
    throw new AppError('invalid_input', 'サービスの指定が不正です')
  }
  if (typeof conversationId !== 'string' || !CONVERSATION_ID_RE.test(conversationId)) {
    throw new AppError('invalid_input', '会話 ID が不正です')
  }
  return { source: source as Source, conversationId }
}

/** レンダラーからの送信内容は信用せず、ここで形を検証する（本文の長さなどはエンジン側で検証） */
function parseSendInput(input: unknown): SendMessageInput {
  const target = parseTarget(input)
  const raw = input as Record<string, unknown>
  if (typeof raw.text !== 'string') throw new AppError('invalid_input', 'メッセージを入力してください')
  let replyTo: ReplyTarget | undefined
  if (raw.replyTo !== undefined) {
    const r = raw.replyTo
    if (
      !isRecord(r) ||
      typeof r.messageId !== 'string' ||
      !NATIVE_ID_RE.test(r.messageId) ||
      typeof r.authorId !== 'string' ||
      !NATIVE_ID_RE.test(r.authorId) ||
      typeof r.authorName !== 'string' ||
      (r.threadId !== undefined && (typeof r.threadId !== 'string' || !NATIVE_ID_RE.test(r.threadId)))
    ) {
      throw new AppError('invalid_input', '返信先の指定が不正です')
    }
    replyTo = {
      messageId: r.messageId,
      authorId: r.authorId,
      authorName: r.authorName.replace(/[[\]\n]/g, ' ').slice(0, 100),
      threadId: r.threadId as string | undefined
    }
  }
  return { ...target, text: raw.text, replyTo }
}

const STATUSES: readonly InboxStatus[] = ['open', 'done', 'snoozed']

function parseInboxStatusInput(input: unknown): SetInboxStatusInput {
  if (!isRecord(input) || !Array.isArray(input.items) || input.items.length === 0 || input.items.length > 1000) {
    throw new AppError('invalid_input', '対象のメッセージが不正です')
  }
  if (typeof input.status !== 'string' || !STATUSES.includes(input.status as InboxStatus)) {
    throw new AppError('invalid_input', '対応状況の指定が不正です')
  }
  const items: InboxItemRef[] = input.items.map((raw) => {
    const target = parseTarget(raw)
    const r = raw as Record<string, unknown>
    assertInboxId(r.id)
    if (typeof r.nativeId !== 'string' || !NATIVE_ID_RE.test(r.nativeId)) {
      throw new AppError('invalid_input', '対象のメッセージが不正です')
    }
    return { id: r.id, source: target.source, conversationId: target.conversationId, nativeId: r.nativeId }
  })
  const until = typeof input.until === 'number' ? input.until : undefined
  return { items, status: input.status as InboxStatus, until }
}

export function applyTheme(s: PublicSettings = settings.toPublic()): void {
  nativeTheme.themeSource = s.theme
}

export function registerIpc(
  isTrusted: (event: IpcMainInvokeEvent) => boolean,
  hub: StateHub,
  sync: SyncManager,
  inbox: InboxStateService
): void {
  const h = <C extends ApiChannel>(channel: C, fn: Handler<C>): void => handle(channel, isTrusted, fn)

  /** 設定を保存したら、状態ハブ経由で全画面に反映し、必要なら同期エンジンを作り直す */
  const publish = async (next: PublicSettings): Promise<PublicSettings> => {
    hub.setSettings(next)
    await sync.apply()
    return next
  }

  h('settings:get', () => settings.toPublic())
  h('settings:update', async (patch) => {
    const next = settings.update(patch ?? {})
    applyTheme(next)
    sync.setIntervalSec(next.refreshIntervalSec)
    return publish(next)
  })

  h('slack:connect', async (input) => {
    const token = requireString(input?.token, 'Slack トークン')
    const cookie = input?.cookie?.trim() || undefined
    const info = await verifySlack(token, cookie)
    await settings.setSlack(info, token, info.authType === 'session' ? cookie : undefined)
    return publish(settings.toPublic())
  })
  h('slack:disconnect', () => {
    settings.clearSlack()
    return publish(settings.toPublic())
  })
  h('chatwork:connect', async (input) => {
    const token = requireString(input?.token, 'Chatwork API トークン')
    const info = await verifyChatwork(token)
    await settings.setChatwork(info, token)
    return publish(settings.toPublic())
  })
  h('chatwork:disconnect', () => {
    const accountId = settings.toPublic().chatwork?.accountId
    settings.clearChatwork()
    if (accountId) sync.forgetChatwork(accountId)
    return publish(settings.toPublic())
  })

  // 非表示の判定はレンダラー（@omni-desk/client）で行うので、同期エンジンには影響しない
  h('blocked-senders:add', (sender) => publish(settings.blockSender(parseBlockedSender(sender))))
  h('blocked-senders:remove', (sender) => publish(settings.unblockSender(parseSenderKey(sender))))

  h('state:snapshot', () => hub.get())
  h('sync:refresh', () => sync.refresh())
  h('sync:watch', (target) => sync.watch(target === null ? null : parseTarget(target)))
  h('message:send', (input) => sync.send(parseSendInput(input)))
  h('inbox:set-status', async (input) => {
    const { items, status, until } = parseInboxStatusInput(input)
    inbox.set(
      items.map((i) => i.id),
      status,
      until
    )
    if (status !== 'done' || !settings.toPublic().markReadOnDone) return {}
    try {
      await sync.markRead(items)
      return {}
    } catch (error) {
      // 対応済みにはできているので、既読化の失敗は警告として返す
      return { warning: `サービス側を既読にできませんでした：${toErrorPayload(error).message}` }
    }
  })

  h('app:open-external', async (url) => {
    const parsed = new URL(requireString(url, 'URL'))
    if (parsed.protocol !== 'https:') throw new AppError('invalid_input', 'https の URL のみ開けます')
    await shell.openExternal(parsed.toString())
  })
}
