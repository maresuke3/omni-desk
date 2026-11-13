import { useState, type ReactNode } from 'react'
import { Eye, EyeOff, Inbox, KeyRound, Monitor, Moon, ShieldCheck, Sun, TriangleAlert } from 'lucide-react'
import type { SlackAuthType, ThemePreference } from '@omni-desk/contracts'
import { Avatar, Button, PageHeader, Segmented, SOURCE_LABEL, SourceMark } from '@omni-desk/ui'
import { cn } from '@omni-desk/ui'
import { actions, openExternal, useAsyncAction, useRateStatus, useSettings } from '@omni-desk/client'

const SLACK_USER_SCOPES = [
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
]

function Card({ title, icon, description, children }: { title: string; icon: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        {icon}
        <div>
          <h2 className="text-[14px] font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-[12.5px] text-fg-muted">{description}</p>}
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

function SecretInput({
  label,
  value,
  onChange,
  placeholder,
  hint
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  hint?: ReactNode
}) {
  const [visible, setVisible] = useState(false)
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium">{label}</span>
      <span className="flex h-9 items-center gap-2 rounded-lg border border-line bg-sunken px-3 focus-within:border-accent focus-within:bg-panel">
        <KeyRound className="size-3.5 shrink-0 text-fg-subtle" />
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="selectable w-full bg-transparent font-mono text-[12.5px] outline-none placeholder:font-sans placeholder:text-fg-subtle"
        />
        <button type="button" onClick={() => setVisible((v) => !v)} className="text-fg-subtle hover:text-fg" title={visible ? '隠す' : '表示'}>
          {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
      </span>
      {hint && <span className="mt-1.5 block text-[11.5px] leading-relaxed text-fg-subtle">{hint}</span>}
    </label>
  )
}

function ConnectedRow({
  name,
  detail,
  avatarUrl,
  onDisconnect,
  pending
}: {
  name: string
  detail: ReactNode
  avatarUrl?: string
  onDisconnect: () => void
  pending: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={name} url={avatarUrl} size={36} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-medium">
          {name}
          <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-px text-[11px] font-medium text-success">
            <ShieldCheck className="size-3" />
            接続済み
          </span>
        </p>
        <p className="truncate text-[12px] text-fg-muted">{detail}</p>
      </div>
      <Button variant="danger" size="sm" onClick={onDisconnect} loading={pending}>
        接続を解除
      </Button>
    </div>
  )
}

function ErrorText({ error }: { error: Error | null }) {
  if (!error) return null
  return <p className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error.message}</p>
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1 pl-5 text-[12.5px] leading-relaxed text-fg-muted marker:text-fg-subtle">{children}</ol>
}

function SlackSettings() {
  const settings = useSettings()
  // 入力中のトークンは画面ローカルに持ち、ストアやディスクには置かない
  const connect = useAsyncAction(actions.connectSlack)
  const disconnect = useAsyncAction(actions.disconnectSlack)
  const [mode, setMode] = useState<SlackAuthType>('user')
  const [token, setToken] = useState('')
  const [cookie, setCookie] = useState('')

  const conn = settings.slack
  return (
    <Card
      title="Slack"
      icon={<SourceMark source="slack" size="md" />}
      description="自分宛てのメンション・チャンネル・DM・To-dos を表示します"
    >
      {conn ? (
        <ConnectedRow
          name={conn.teamName}
          detail={`${conn.userName} · ${conn.authType === 'session' ? 'ブラウザセッション（To-dos 対応）' : 'ユーザートークン（To-dos 非対応）'}`}
          onDisconnect={() => void disconnect.run()}
          pending={disconnect.pending}
        />
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void connect.run({ token, cookie: mode === 'session' ? cookie : undefined }).then((ok) => {
              if (ok) {
                setToken('')
                setCookie('')
              }
            })
          }}
        >
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'user', label: 'ユーザートークン（公式 API）' },
              { value: 'session', label: 'ブラウザセッション（To-dos 対応）' }
            ]}
          />

          {mode === 'user' ? (
            <>
              <Steps>
                <li>
                  <a className="text-accent-text hover:underline" href="#" onClick={(e) => (e.preventDefault(), openExternal('https://api.slack.com/apps'))}>
                    api.slack.com/apps
                  </a>{' '}
                  で「From a manifest」を選び、リポジトリの <code className="rounded bg-sunken px-1">docs/slack-app-manifest.yml</code> を貼り付けてアプリを作成
                </li>
                <li>ワークスペースにインストールし、「User OAuth Token（xoxp-…）」をコピー</li>
              </Steps>
              <div className="flex flex-wrap gap-1">
                {SLACK_USER_SCOPES.map((s) => (
                  <span key={s} className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
                    {s}
                  </span>
                ))}
              </div>
              <SecretInput label="User OAuth Token" value={token} onChange={setToken} placeholder="xoxp-..." />
              <p className="text-[11.5px] text-fg-subtle">
                ※ Slack の To-dos は公開 API が無いため、この方式では表示できません。社内でアプリのインストールに管理者承認が必要な場合があります。
              </p>
            </>
          ) : (
            <>
              <div className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning-soft px-3.5 py-3 text-[12.5px] leading-relaxed">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                <p className="text-fg">
                  Slack Web クライアントと同じ認証情報（非公式な方法）を使います。To-dos と未読状態が取得できますが、
                  Slack 側の変更で動かなくなる可能性があります。<b>利用前に社内のセキュリティポリシーを確認してください。</b>
                  ログアウトすると無効になります。
                </p>
              </div>
              <Steps>
                <li>ブラウザで Slack ワークスペース（app.slack.com）を開き、開発者ツールを開く</li>
                <li>
                  Application → Cookies → <code className="rounded bg-sunken px-1">https://app.slack.com</code> の{' '}
                  <code className="rounded bg-sunken px-1">d</code> の値（xoxd-…）をコピー
                </li>
                <li>
                  Console で <code className="rounded bg-sunken px-1">Object.values(JSON.parse(localStorage.localConfig_v2).teams).map(t =&gt; [t.name, t.token])</code>{' '}
                  を実行し、対象ワークスペースの xoxc-… をコピー
                </li>
              </Steps>
              <SecretInput label="セッショントークン" value={token} onChange={setToken} placeholder="xoxc-..." />
              <SecretInput label="d Cookie" value={cookie} onChange={setCookie} placeholder="xoxd-..." />
            </>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" loading={connect.pending} disabled={!token.trim() || (mode === 'session' && !cookie.trim())}>
              接続をテストして保存
            </Button>
            <span className="text-[11.5px] text-fg-subtle">トークンは OS のキーチェーンで暗号化して保存されます</span>
          </div>
          <ErrorText error={connect.error} />
        </form>
      )}
    </Card>
  )
}

function ChatworkSettings() {
  const settings = useSettings()
  const connect = useAsyncAction(actions.connectChatwork)
  const disconnect = useAsyncAction(actions.disconnectChatwork)
  const [token, setToken] = useState('')
  const rate = useRateStatus('chatwork')
  const conn = settings.chatwork

  return (
    <Card
      title="Chatwork"
      icon={<SourceMark source="chatwork" size="md" />}
      description="チャット・自分宛てメッセージ・マイタスクを表示します"
    >
      {conn ? (
        <ConnectedRow
          name={conn.name}
          avatarUrl={conn.avatarUrl}
          detail={
            <>
              {conn.organizationName ?? `アカウント ID: ${conn.accountId}`}
              {rate && (
                <span className="text-fg-subtle">
                  {' '}
                  · API 残り {rate.remaining} / {rate.limit} 回（5 分）{rate.queued > 0 && ` · 待機中 ${rate.queued} 件`}
                </span>
              )}
            </>
          }
          onDisconnect={() => void disconnect.run()}
          pending={disconnect.pending}
        />
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void connect.run({ token }).then((ok) => ok && setToken(''))
          }}
        >
          <Steps>
            <li>
              Chatwork の「サービス連携」→「
              <a
                className="text-accent-text hover:underline"
                href="#"
                onClick={(e) => (e.preventDefault(), openExternal('https://www.chatwork.com/service/packages/chatwork/subpackages/api/token.php'))}
              >
                API トークン
              </a>
              」で発行したトークンをコピー（組織によっては管理者の許可が必要です）
            </li>
          </Steps>
          <SecretInput label="API トークン" value={token} onChange={setToken} placeholder="API トークンを貼り付け" />
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" loading={connect.pending} disabled={!token.trim()}>
              接続をテストして保存
            </Button>
            <span className="text-[11.5px] text-fg-subtle">API の上限は 5 分あたり 300 回です（アプリ内で予算を管理します）</span>
          </div>
          <ErrorText error={connect.error} />
        </form>
      )}
    </Card>
  )
}

function Row({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3 first:pt-0 last:pb-0">
      <div>
        <p className="text-[13px] font-medium">{label}</p>
        {description && <p className="text-[12px] text-fg-muted">{description}</p>}
      </div>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-line-strong'
      )}
    >
      <span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  )
}

function DisplaySettings() {
  const settings = useSettings()
  const update = useAsyncAction(actions.updateSettings)
  const noneConnected = !settings.slack && !settings.chatwork

  return (
    <Card title="表示と同期" icon={<span className="flex size-7 items-center justify-center rounded-lg bg-sunken"><Monitor className="size-4 text-fg-muted" /></span>}>
      <div className="divide-y divide-line">
        <Row label="テーマ">
          <Segmented<ThemePreference>
            size="sm"
            value={settings.theme}
            onChange={(theme) => void update.run({ theme })}
            options={[
              { value: 'system', label: <><Monitor className="size-3.5" />自動</> },
              { value: 'light', label: <><Sun className="size-3.5" />ライト</> },
              { value: 'dark', label: <><Moon className="size-3.5" />ダーク</> }
            ]}
          />
        </Row>
        <Row
          label="Slack の自動更新の間隔"
          description="短くすると API の利用回数が増えます。Chatwork は変化を検知して自動で取得します"
        >
          <select
            value={settings.refreshIntervalSec}
            onChange={(e) => void update.run({ refreshIntervalSec: Number(e.target.value) })}
            className="h-8 rounded-lg border border-line bg-panel px-2 text-[13px] outline-none focus:border-accent"
          >
            <option value={60}>1 分</option>
            <option value={120}>2 分</option>
            <option value={300}>5 分</option>
            <option value={600}>10 分</option>
          </select>
        </Row>
        <Row
          label="デモデータを表示"
          description={noneConnected ? 'サービス未接続のあいだは自動でデモデータを表示しています' : '接続中のデータの代わりにサンプルを表示します'}
        >
          <Toggle
            checked={settings.demoActive}
            disabled={noneConnected}
            onChange={(demoMode) => void update.run({ demoMode })}
          />
        </Row>
      </div>
    </Card>
  )
}

function InboxSettings() {
  const settings = useSettings()
  const update = useAsyncAction(actions.updateSettings)
  return (
    <Card
      title="受信箱"
      icon={<span className="flex size-7 items-center justify-center rounded-lg bg-sunken"><Inbox className="size-4 text-fg-muted" /></span>}
      description="対応状況（未対応・あとで・対応済み）はこの PC に保存されます"
    >
      <div className="divide-y divide-line">
        <Row
          label="対応済みにしたら、サービス側も既読にする"
          description="Chatwork はルーム単位の既読化のため、そのメッセージより前の未読もまとめて既読になります。Slack をユーザートークン方式で使う場合は、Slack アプリに channels:write・groups:write・im:write・mpim:write の権限が必要です"
        >
          <Toggle checked={settings.markReadOnDone} onChange={(markReadOnDone) => void update.run({ markReadOnDone })} />
        </Row>
      </div>
      <ErrorText error={update.error} />
    </Card>
  )
}

function BlockedSendersSettings() {
  const settings = useSettings()
  const unblock = useAsyncAction(actions.unblockSender)
  // どの行を解除中か（ボタンの読み込み表示用）
  const [unblocking, setUnblocking] = useState<string | null>(null)
  const list = settings.blockedSenders

  return (
    <Card
      title="非表示にする送信者"
      icon={<span className="flex size-7 items-center justify-center rounded-lg bg-sunken"><EyeOff className="size-4 text-fg-muted" /></span>}
      description="受信箱・ホームの「あなた宛て」・サイドバーの件数に含めない送信者です。会話画面では通常どおり表示されます"
    >
      {list.length === 0 ? (
        <p className="text-[12.5px] leading-relaxed text-fg-muted">
          非表示にしている送信者はいません。受信箱のメッセージにカーソルを合わせ、
          <EyeOff className="mx-0.5 inline size-3.5 align-[-2px]" />
          「この送信者を受信箱で非表示」を押すとここに追加されます。
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((s) => {
            const rowKey = `${s.source}:${s.senderId}`
            const pending = unblock.pending && unblocking === rowKey
            return (
              <li key={`${s.source}:${s.senderId}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <SourceMark source={s.source} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{s.name}</p>
                  <p className="truncate text-[11.5px] text-fg-subtle">
                    {SOURCE_LABEL[s.source]} · ID: {s.senderId}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setUnblocking(rowKey)
                    void unblock.run(s)
                  }}
                  loading={pending}
                >
                  解除
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      <ErrorText error={unblock.error} />
    </Card>
  )
}

export function SettingsView() {
  const settings = useSettings()
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="設定" subtitle="サービスの接続と表示の設定" />
      <div className="thin-scroll flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] space-y-5 px-7 py-6">
          {!settings.encryptionAvailable && (
            <p className="rounded-lg bg-danger-soft px-3.5 py-3 text-[12.5px] text-danger">
              OS の暗号化ストレージが利用できないため、トークンを保存できません。
            </p>
          )}
          <SlackSettings />
          <ChatworkSettings />
          <InboxSettings />
          <DisplaySettings />
          <BlockedSendersSettings />
          <p className="pb-4 text-center text-[11.5px] text-fg-subtle">Microsoft Teams・メールの連携は今後追加予定です</p>
        </div>
      </div>
    </div>
  )
}
