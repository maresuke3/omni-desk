import { useState, type ReactNode } from 'react'
import { CalendarDays, ExternalLink, Eye, EyeOff, FileText, FolderGit2, Inbox, KeyRound, Monitor, Moon, Plus, ShieldCheck, Sun, Ticket, TriangleAlert } from 'lucide-react'
import {
  buildGitHubAuthorizeUrl,
  buildNotionAuthorizeUrl,
  buildSlackAuthorizeUrl,
  SLACK_USER_SCOPES,
  type OAuthConnectInput,
  type ThemePreference
} from '@omni-desk/contracts'
import { Avatar, Button, PageHeader, Segmented, SOURCE_LABEL, SourceMark } from '@omni-desk/ui'
import { cn } from '@omni-desk/ui'
import { actions, openExternal, useAsyncAction, useRateStatus, useSettings } from '@omni-desk/client'

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
  hint,
  secret = true
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  hint?: ReactNode
  secret?: boolean
}) {
  const [visible, setVisible] = useState(false)
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium">{label}</span>
      <span className="flex h-9 items-center gap-2 rounded-lg border border-line bg-sunken px-3 focus-within:border-accent focus-within:bg-panel">
        <KeyRound className="size-3.5 shrink-0 text-fg-subtle" />
        <input
          type={!secret || visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="selectable w-full bg-transparent font-mono text-[12.5px] outline-none placeholder:font-sans placeholder:text-fg-subtle"
        />
        {secret && (
          <button type="button" onClick={() => setVisible((v) => !v)} className="text-fg-subtle hover:text-fg" title={visible ? '隠す' : '表示'}>
            {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        )}
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

type SlackMode = 'user' | 'oauth' | 'session'

function OAuthFields({
  value,
  onChange,
  redirectPlaceholder,
  requireHttps,
  buildAuthorizeUrl,
  steps
}: {
  value: OAuthConnectInput
  onChange: (next: OAuthConnectInput) => void
  redirectPlaceholder: string
  requireHttps: boolean
  buildAuthorizeUrl: (params: { clientId: string; redirectUri: string; state: string }) => string
  steps: ReactNode
}) {
  const validRedirect = requireHttps
    ? /^https:\/\//i.test(value.redirectUri.trim())
    : /^https?:\/\//i.test(value.redirectUri.trim())

  const openAuthorize = () => {
    const state = crypto.randomUUID()
    onChange({ ...value, state })
    openExternal(buildAuthorizeUrl({ clientId: value.clientId, redirectUri: value.redirectUri, state }))
  }

  return (
    <>
      <Steps>{steps}</Steps>
      <div className="grid gap-3 sm:grid-cols-2">
        <SecretInput
          label="Client ID"
          value={value.clientId}
          onChange={(clientId) => onChange({ ...value, clientId })}
          placeholder="Client ID"
          secret={false}
        />
        <SecretInput
          label="Client Secret"
          value={value.clientSecret}
          onChange={(clientSecret) => onChange({ ...value, clientSecret })}
          placeholder="Client Secret"
        />
      </div>
      <SecretInput
        label={requireHttps ? 'Redirect URL（https:// 必須）' : 'Redirect URL'}
        value={value.redirectUri}
        onChange={(redirectUri) => onChange({ ...value, redirectUri })}
        placeholder={redirectPlaceholder}
        secret={false}
      />
      <div>
        <Button type="button" size="sm" disabled={!value.clientId.trim() || !validRedirect} onClick={openAuthorize}>
          <ExternalLink className="size-3.5" />
          ブラウザで認可ページを開く
        </Button>
      </div>
      <SecretInput
        label="リダイレクト URL または認可コード"
        value={value.codeOrUrl}
        onChange={(codeOrUrl) => onChange({ ...value, codeOrUrl })}
        placeholder={`${redirectPlaceholder}?code=...`}
        hint="認可後に表示されたアドレスバーの URL 全体をそのまま貼り付けられます（Client ID / Secret は保存されません）。"
      />
    </>
  )
}

const EMPTY_OAUTH: OAuthConnectInput = { clientId: '', clientSecret: '', redirectUri: '', codeOrUrl: '' }

function SlackSettings() {
  const settings = useSettings()
  // 入力中のトークンは画面ローカルに持ち、ストアやディスクには置かない
  const connect = useAsyncAction(actions.connectSlack)
  const connectOAuth = useAsyncAction(actions.connectSlackOAuth)
  const disconnect = useAsyncAction(actions.disconnectSlack)
  const [disconnectingUrl, setDisconnectingUrl] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [mode, setMode] = useState<SlackMode>('user')
  const [token, setToken] = useState('')
  const [cookie, setCookie] = useState('')
  const [oauth, setOauth] = useState<OAuthConnectInput>(EMPTY_OAUTH)

  const workspaces = settings.slackWorkspaces ?? (settings.slack ? [settings.slack] : [])
  const showForm = workspaces.length === 0 || adding
  const activePending = mode === 'oauth' ? connectOAuth.pending : connect.pending
  const activeError = mode === 'oauth' ? connectOAuth.error : connect.error
  const canSubmit =
    mode === 'oauth'
      ? Boolean(oauth.clientId.trim() && oauth.clientSecret.trim() && oauth.redirectUri.trim() && oauth.codeOrUrl.trim())
      : Boolean(token.trim() && (mode !== 'session' || cookie.trim()))

  return (
    <Card
      title="Slack"
      icon={<SourceMark source="slack" size="md" />}
      description="複数ワークスペースのメンション・チャンネル・DM・To-dos を集約して表示します"
    >
      <div className="space-y-4">
        {workspaces.length > 0 && (
          <div className="divide-y divide-line">
            {workspaces.map((conn) => (
              <div key={`${conn.teamUrl}:${conn.userId}`} className="py-2.5 first:pt-0 last:pb-0">
                <ConnectedRow
                  name={conn.teamName}
                  detail={`${conn.userName} · ${conn.authType === 'session' ? 'ブラウザセッション（To-dos 対応）' : 'ユーザートークン（To-dos 非対応）'}`}
                  onDisconnect={() => {
                    setDisconnectingUrl(conn.teamUrl)
                    void disconnect.run(conn.teamUrl).finally(() => setDisconnectingUrl(null))
                  }}
                  pending={disconnect.pending && disconnectingUrl === conn.teamUrl}
                />
              </div>
            ))}
          </div>
        )}

        {workspaces.length > 0 && !adding && (
          <div>
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" />
              ワークスペースを追加
            </Button>
          </div>
        )}

        {showForm && (
          <form
            className="space-y-4 border-t border-line pt-4 first:border-t-0 first:pt-0"
            onSubmit={(e) => {
              e.preventDefault()
              if (mode === 'oauth') {
                void connectOAuth.run(oauth).then((ok) => {
                  if (ok) {
                    setOauth(EMPTY_OAUTH)
                    setAdding(false)
                  }
                })
                return
              }
              void connect.run({ token, cookie: mode === 'session' ? cookie : undefined }).then((ok) => {
                if (ok) {
                  setToken('')
                  setCookie('')
                  setAdding(false)
                }
              })
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'user', label: 'ユーザートークン（xoxp）' },
                  { value: 'oauth', label: 'OAuth 認可（公式 API）' },
                  { value: 'session', label: 'ブラウザセッション（To-dos 対応）' }
                ]}
              />
              {workspaces.length > 0 && (
                <button type="button" onClick={() => setAdding(false)} className="text-[12px] text-fg-subtle hover:text-fg">
                  キャンセル
                </button>
              )}
            </div>

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
            ) : mode === 'oauth' ? (
              <OAuthFields
                value={oauth}
                onChange={setOauth}
                redirectPlaceholder="https://example.com/slack/callback"
                requireHttps
                buildAuthorizeUrl={buildSlackAuthorizeUrl}
                steps={
                  <>
                    <li>
                      <a className="text-accent-text hover:underline" href="#" onClick={(e) => (e.preventDefault(), openExternal('https://api.slack.com/apps'))}>
                        api.slack.com/apps
                      </a>{' '}
                      でアプリを作成し、「OAuth &amp; Permissions → Redirect URLs」に HTTPS の URL（例: ngrok URL やダミー HTTPS URL）を登録
                    </li>
                    <li>Client ID / Client Secret / Redirect URL を入力し、「ブラウザで認可ページを開く」からワークスペースを認可</li>
                    <li>リダイレクト先の URL 全体（または <code className="rounded bg-sunken px-1">code</code> の値）を下に貼り付けて保存</li>
                  </>
                }
              />
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
              <Button type="submit" variant="primary" loading={activePending} disabled={!canSubmit}>
                接続をテストして保存
              </Button>
              <span className="text-[11.5px] text-fg-subtle">トークンは OS のキーチェーンで暗号化して保存されます</span>
            </div>
            <ErrorText error={activeError} />
          </form>
        )}
      </div>
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
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-line-strong'
      )}
    >
      <span
        className={cn(
          'pointer-events-none absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0'
        )}
      />
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
  const list = settings.blockedSenders ?? []

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

function GitHubSettings() {
  const settings = useSettings()
  const connect = useAsyncAction(actions.connectGitHub)
  const connectOAuth = useAsyncAction(actions.connectGitHubOAuth)
  const disconnect = useAsyncAction(actions.disconnectGitHub)
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [mode, setMode] = useState<'token' | 'oauth'>('token')
  const [token, setToken] = useState('')
  const [label, setLabel] = useState('')
  const [oauth, setOauth] = useState<OAuthConnectInput>(EMPTY_OAUTH)

  const accounts = settings.githubAccounts ?? (settings.github ? [settings.github] : [])
  const showForm = accounts.length === 0 || adding
  const activePending = mode === 'oauth' ? connectOAuth.pending : connect.pending
  const activeError = mode === 'oauth' ? connectOAuth.error : connect.error
  const canSubmit =
    mode === 'oauth'
      ? Boolean(oauth.clientId.trim() && oauth.clientSecret.trim() && oauth.redirectUri.trim() && oauth.codeOrUrl.trim())
      : Boolean(token.trim())

  return (
    <Card
      title="GitHub"
      icon={<FolderGit2 className="size-5 text-fg-muted" />}
      description="個人用・会社用など複数のトークンを登録でき、PR・Issue・Organization リポジトリを集約します"
    >
      <div className="space-y-4">
        {accounts.length > 0 && (
          <div className="divide-y divide-line">
            {accounts.map((conn, idx) => {
              const accountId = conn.id ?? conn.login
              return (
                <div key={`${accountId}:${idx}`} className="py-2.5 first:pt-0 last:pb-0">
                  <ConnectedRow
                    name={conn.label ? `${conn.name}（${conn.label}）` : conn.name}
                    detail={`@${conn.login}`}
                    avatarUrl={conn.avatarUrl}
                    onDisconnect={() => {
                      setDisconnectingId(accountId)
                      void disconnect.run(accountId).finally(() => setDisconnectingId(null))
                    }}
                    pending={disconnect.pending && disconnectingId === accountId}
                  />
                </div>
              )
            })}
          </div>
        )}

        {accounts.length > 0 && !adding && (
          <div>
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" />
              トークン / アカウントを追加
            </Button>
          </div>
        )}

        {showForm && (
          <form
            className="space-y-4 border-t border-line pt-4 first:border-t-0 first:pt-0"
            onSubmit={(e) => {
              e.preventDefault()
              if (mode === 'oauth') {
                void connectOAuth.run(oauth).then((ok) => {
                  if (ok) {
                    setOauth(EMPTY_OAUTH)
                    setAdding(false)
                  }
                })
                return
              }
              void connect.run({ token, label: label.trim() || undefined }).then((ok) => {
                if (ok) {
                  setToken('')
                  setLabel('')
                  setAdding(false)
                }
              })
            }}
          >
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'token', label: 'Personal Access Token（直打ち）' },
                { value: 'oauth', label: 'OAuth 認可' }
              ]}
            />
            {mode === 'token' ? (
              <div className="space-y-3">
                <SecretInput
                  label="ラベル（任意）"
                  value={label}
                  onChange={setLabel}
                  placeholder="例: 個人用 / 会社用"
                  secret={false}
                />
                <SecretInput
                  label="Personal Access Token"
                  value={token}
                  onChange={setToken}
                  placeholder="ghp_... / github_pat_..."
                  hint="repo / read:user スコープを持つトークンを入力してください（Organization 用トークンも追加できます）。"
                />
              </div>
            ) : (
              <OAuthFields
                value={oauth}
                onChange={setOauth}
                redirectPlaceholder="http://localhost:3000/github/callback"
                requireHttps={false}
                buildAuthorizeUrl={buildGitHubAuthorizeUrl}
                steps={
                  <>
                    <li>GitHub の Developer Settings → OAuth Apps でアプリを作成し、Authorization callback URL を登録</li>
                    <li>Client ID / Client Secret / Redirect URL を入力し、「ブラウザで認可ページを開く」から認可</li>
                    <li>リダイレクト先の URL 全体（または <code className="rounded bg-sunken px-1">code</code>）を貼り付けて保存</li>
                  </>
                }
              />
            )}
            <div className="flex items-center gap-3">
              <Button type="submit" variant="primary" loading={activePending} disabled={!canSubmit}>
                接続をテストして保存
              </Button>
              {accounts.length > 0 && (
                <Button type="button" size="sm" onClick={() => setAdding(false)}>
                  キャンセル
                </Button>
              )}
            </div>
            <ErrorText error={activeError} />
          </form>
        )}
      </div>
    </Card>
  )
}

function AtlassianSettings() {
  const settings = useSettings()
  const connect = useAsyncAction(actions.connectAtlassian)
  const disconnect = useAsyncAction(actions.disconnectAtlassian)
  const [binaryPath, setBinaryPath] = useState('acli')
  const [siteUrl, setSiteUrl] = useState('')
  const conn = settings.atlassian

  return (
    <Card
      title="Atlassian CLI（Jira / Confluence）"
      icon={<Ticket className="size-5 text-fg-muted" />}
      description="acli を通じて Jira チケットの検索・作成・編集・コメントや Confluence 資料を取得します"
    >
      {conn ? (
        <ConnectedRow
          name={conn.siteUrl || 'Atlassian CLI'}
          detail={`${conn.binaryPath} · ${conn.version}`}
          onDisconnect={() => void disconnect.run()}
          pending={disconnect.pending}
        />
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void connect.run({ binaryPath, siteUrl: siteUrl.trim() || undefined })
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <SecretInput label="acli バイナリパス" value={binaryPath} onChange={setBinaryPath} placeholder="acli" secret={false} />
            <SecretInput
              label="Atlassian サイト URL（任意）"
              value={siteUrl}
              onChange={setSiteUrl}
              placeholder="https://your-domain.atlassian.net"
              secret={false}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" loading={connect.pending} disabled={!binaryPath.trim()}>
              acli の接続を確認して保存
            </Button>
          </div>
          <ErrorText error={connect.error} />
        </form>
      )}
    </Card>
  )
}

function NotionSettings() {
  const settings = useSettings()
  const connect = useAsyncAction(actions.connectNotion)
  const connectOAuth = useAsyncAction(actions.connectNotionOAuth)
  const disconnect = useAsyncAction(actions.disconnectNotion)
  const [mode, setMode] = useState<'token' | 'oauth'>('token')
  const [token, setToken] = useState('')
  const [oauth, setOauth] = useState<OAuthConnectInput>(EMPTY_OAUTH)
  const conn = settings.notion

  const activePending = mode === 'oauth' ? connectOAuth.pending : connect.pending
  const activeError = mode === 'oauth' ? connectOAuth.error : connect.error
  const canSubmit =
    mode === 'oauth'
      ? Boolean(oauth.clientId.trim() && oauth.clientSecret.trim() && oauth.redirectUri.trim() && oauth.codeOrUrl.trim())
      : Boolean(token.trim())

  return (
    <Card
      title="Notion"
      icon={<FileText className="size-5 text-fg-muted" />}
      description="ワークスペース内の共有ページ・データベースをナレッジボードに表示します"
    >
      {conn ? (
        <ConnectedRow
          name={conn.workspaceName || conn.name}
          detail={conn.name}
          avatarUrl={conn.avatarUrl}
          onDisconnect={() => void disconnect.run()}
          pending={disconnect.pending}
        />
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (mode === 'oauth') {
              void connectOAuth.run(oauth).then((ok) => {
                if (ok) setOauth(EMPTY_OAUTH)
              })
              return
            }
            void connect.run({ token }).then((ok) => {
              if (ok) setToken('')
            })
          }}
        >
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'token', label: 'Integration Secret（直打ち）' },
              { value: 'oauth', label: 'OAuth 認可（Public Integration）' }
            ]}
          />
          {mode === 'token' ? (
            <SecretInput
              label="Internal Integration Secret"
              value={token}
              onChange={setToken}
              placeholder="ntn_... / secret_..."
              hint="対象ページ / データベースにインテグレーションを「コネクト」しておくと検索できます。"
            />
          ) : (
            <OAuthFields
              value={oauth}
              onChange={setOauth}
              redirectPlaceholder="https://example.com/notion/callback"
              requireHttps
              buildAuthorizeUrl={buildNotionAuthorizeUrl}
              steps={
                <>
                  <li>Notion Integrations で Public Integration を作成し、Redirect URI（https://）を登録</li>
                  <li>OAuth Client ID / Client Secret / Redirect URL を入力し、「ブラウザで認可ページを開く」から対象ページを許可</li>
                  <li>リダイレクト先の URL 全体（または <code className="rounded bg-sunken px-1">code</code>）を貼り付けて保存</li>
                </>
              }
            />
          )}
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" loading={activePending} disabled={!canSubmit}>
              接続をテストして保存
            </Button>
          </div>
          <ErrorText error={activeError} />
        </form>
      )}
    </Card>
  )
}

function GoogleSettings() {
  const settings = useSettings()
  const startOAuth = useAsyncAction(actions.startGoogleOAuth)
  const disconnect = useAsyncAction(actions.disconnectGoogleAccount)
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [label, setLabel] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const accounts =
    settings.googleAccounts ??
    (settings.googleCalendar
      ? [{ id: `google:${settings.googleCalendar.email}`, ...settings.googleCalendar }]
      : [])
  const hasDefaults = Boolean(settings.googleOAuthConfigured)
  const canSubmit = hasDefaults || Boolean(clientId.trim())
  const showForm = accounts.length === 0 || adding

  return (
    <Card
      title="Google 連携"
      icon={<CalendarDays className="size-5 text-fg-muted" />}
      description="連携対象: Google Calendar・Gmail（今後 Google サービスを順次追加予定）。複数アカウントをまとめて連携できます"
    >
      <div className="space-y-4">
        {accounts.length > 0 && (
          <div className="divide-y divide-line">
            {accounts.map((acc) => (
              <div key={acc.id} className="py-2.5 first:pt-0 last:pb-0">
                <ConnectedRow
                  name={acc.label ? `${acc.name || acc.email}（${acc.label}）` : acc.name || acc.email}
                  detail={`${acc.email} · Calendar / Gmail`}
                  avatarUrl={acc.avatarUrl}
                  onDisconnect={() => {
                    setDisconnectingId(acc.id)
                    void disconnect.run(acc.id).finally(() => setDisconnectingId(null))
                  }}
                  pending={disconnect.pending && disconnectingId === acc.id}
                />
              </div>
            ))}
          </div>
        )}

        {accounts.length > 0 && !adding && (
          <div>
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" />
              Google アカウントを追加
            </Button>
          </div>
        )}

        {showForm && (
          <div className="space-y-4 border-t border-line pt-4 first:border-t-0 first:pt-0">
            <p className="text-[12.5px] leading-relaxed text-fg-muted">
              ボタンを押すとブラウザで Google の認証画面が開き、許可するだけで Google Calendar と Gmail がまとめて連携されます。
            </p>

            <SecretInput
              label="ラベル（任意）"
              value={label}
              onChange={setLabel}
              placeholder="例: 仕事用 / 個人用"
              secret={false}
            />

            {!hasDefaults && !showCustom && (
              <p className="rounded-lg border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-[12px] leading-relaxed text-fg">
                既定の OAuth クライアントが未設定です。リポジトリ直下の <code className="rounded bg-sunken px-1">.env.local</code> に{' '}
                <code className="rounded bg-sunken px-1">OMNI_GOOGLE_CLIENT_ID</code> を設定するか、下の「別の OAuth アプリを使う」から入力してください。
              </p>
            )}

            {(showCustom || !hasDefaults) && (
              <div className="space-y-3 rounded-lg border border-line bg-sunken/40 p-3.5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <SecretInput
                    label="Client ID"
                    value={clientId}
                    onChange={setClientId}
                    placeholder="xxxx.apps.googleusercontent.com"
                    secret={false}
                  />
                  <SecretInput
                    label="Client Secret（任意）"
                    value={clientSecret}
                    onChange={setClientSecret}
                    placeholder="GOCSPX-..."
                  />
                </div>
                <p className="text-[11.5px] text-fg-subtle">
                  ※ リダイレクト URI の手入力や URL のコピペは不要です（ローカルの一時ポートで自動受信します）。
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="primary"
                loading={startOAuth.pending}
                disabled={!canSubmit}
                onClick={() =>
                  void startOAuth
                    .run({
                      clientId: clientId.trim() || undefined,
                      clientSecret: clientSecret.trim() || undefined,
                      label: label.trim() || undefined
                    })
                    .then((ok) => {
                      if (ok) {
                        setLabel('')
                        setClientId('')
                        setClientSecret('')
                        setAdding(false)
                      }
                    })
                }
              >
                <ExternalLink className="size-3.5" />
                {startOAuth.pending ? 'ブラウザで認証を待機中…' : 'Google アカウントと連携'}
              </Button>
              {accounts.length > 0 && (
                <Button type="button" size="sm" onClick={() => setAdding(false)}>
                  キャンセル
                </Button>
              )}
              {hasDefaults && (
                <button
                  type="button"
                  onClick={() => setShowCustom((v) => !v)}
                  className="text-[12px] text-fg-subtle hover:text-fg"
                >
                  {showCustom ? '詳細設定を閉じる' : '別の OAuth アプリを使う'}
                </button>
              )}
            </div>
            <ErrorText error={startOAuth.error} />
          </div>
        )}
      </div>
    </Card>
  )
}

interface SettingsSectionItem {
  id: string
  label: string
  group: 'integrations' | 'app'
  status?: string
  connected?: boolean
}

export function SettingsView() {
  const settings = useSettings()
  const [activeId, setActiveId] = useState<string>('slack')

  const slackCount = settings.slackWorkspaces?.length ?? (settings.slack ? 1 : 0)
  const githubCount = settings.githubAccounts?.length ?? (settings.github ? 1 : 0)
  const googleCount = settings.googleAccounts?.length ?? (settings.googleCalendar ? 1 : 0)

  const sections: SettingsSectionItem[] = [
    { id: 'slack', label: 'Slack', group: 'integrations', connected: slackCount > 0, status: slackCount > 0 ? String(slackCount) : undefined },
    { id: 'chatwork', label: 'Chatwork', group: 'integrations', connected: Boolean(settings.chatwork) },
    { id: 'github', label: 'GitHub', group: 'integrations', connected: githubCount > 0, status: githubCount > 0 ? String(githubCount) : undefined },
    { id: 'atlassian', label: 'Atlassian', group: 'integrations', connected: Boolean(settings.atlassian) },
    { id: 'notion', label: 'Notion', group: 'integrations', connected: Boolean(settings.notion) },
    { id: 'google', label: 'Google 連携', group: 'integrations', connected: googleCount > 0, status: googleCount > 0 ? String(googleCount) : undefined },
    { id: 'inbox', label: '受信箱', group: 'app' },
    { id: 'display', label: '表示と同期', group: 'app' },
    { id: 'blocked', label: '非表示にする送信者', group: 'app', status: settings.blockedSenders.length > 0 ? String(settings.blockedSenders.length) : undefined }
  ]

  const scrollTo = (id: string) => {
    setActiveId(id)
    document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="設定" subtitle="サービスの接続と表示の設定" />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* 目次ナビ（広い画面では左サイド目次、狭い画面では上部バー） */}
        <nav
          aria-label="設定の目次"
          className="thin-scroll shrink-0 border-b border-line bg-panel/40 px-4 py-3 md:w-52 md:overflow-y-auto md:border-r md:border-b-0 md:px-3 md:py-5"
        >
          <div className="flex gap-1.5 overflow-x-auto md:flex-col md:gap-4">
            {(['integrations', 'app'] as const).map((group) => (
              <div key={group} className="flex shrink-0 items-center gap-1 md:flex-col md:items-stretch">
                <p className="hidden px-2.5 pb-1 text-[10.5px] font-semibold tracking-wider text-fg-subtle uppercase md:block">
                  {group === 'integrations' ? 'サービス連携' : 'アプリ設定'}
                </p>
                {sections
                  .filter((s) => s.group === group)
                  .map((item) => {
                    const active = activeId === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => scrollTo(item.id)}
                        className={cn(
                          'flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] whitespace-nowrap transition-colors',
                          active ? 'bg-accent/12 font-medium text-accent-text' : 'text-fg-muted hover:bg-hover hover:text-fg'
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {item.group === 'integrations' && (
                            <span
                              className={cn(
                                'size-1.5 shrink-0 rounded-full',
                                item.connected ? 'bg-success' : 'bg-line-strong'
                              )}
                            />
                          )}
                          <span className="truncate">{item.label}</span>
                        </span>
                        {item.status && (
                          <span className="rounded bg-sunken px-1.5 py-px text-[10.5px] text-fg-subtle tabular-nums">
                            {item.status}
                          </span>
                        )}
                      </button>
                    )
                  })}
              </div>
            ))}
          </div>
        </nav>

        <div className="thin-scroll flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[760px] space-y-5 px-7 py-6">
            {!settings.encryptionAvailable && (
              <p className="rounded-lg bg-danger-soft px-3.5 py-3 text-[12.5px] text-danger">
                OS の暗号化ストレージが利用できないため、トークンを保存できません。
              </p>
            )}
            <div id="settings-slack" className="scroll-mt-6"><SlackSettings /></div>
            <div id="settings-chatwork" className="scroll-mt-6"><ChatworkSettings /></div>
            <div id="settings-github" className="scroll-mt-6"><GitHubSettings /></div>
            <div id="settings-atlassian" className="scroll-mt-6"><AtlassianSettings /></div>
            <div id="settings-notion" className="scroll-mt-6"><NotionSettings /></div>
            <div id="settings-google" className="scroll-mt-6"><GoogleSettings /></div>
            <div id="settings-inbox" className="scroll-mt-6"><InboxSettings /></div>
            <div id="settings-display" className="scroll-mt-6"><DisplaySettings /></div>
            <div id="settings-blocked" className="scroll-mt-6"><BlockedSendersSettings /></div>
            <p className="pb-4 text-center text-[11.5px] text-fg-subtle">Microsoft Teams・その他メール（IMAP / Microsoft 365 等）の連携は今後追加予定です</p>
          </div>
        </div>
      </div>
    </div>
  )
}
