import { useState, type ReactNode } from 'react'
import {
  CalendarDays,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  FolderGit2,
  Inbox,
  KeyRound,
  Monitor,
  Moon,
  Plus,
  ShieldCheck,
  Sun,
  Ticket
} from 'lucide-react'
import {
  buildGitHubAuthorizeUrl,
  buildNotionAuthorizeUrl,
  buildSlackAuthorizeUrl,
  SLACK_USER_SCOPES,
  type OAuthConnectInput,
  type ThemePreference
} from '@omni-desk/contracts'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card as UiCard,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  ListItemButton,
  MenuItem,
  PageHeader,
  Paper,
  Segmented,
  SOURCE_LABEL,
  SourceMark,
  Stack,
  Switch,
  TextField,
  Typography
} from '@omni-desk/ui'
import { actions, openExternal, useAsyncAction, useRateStatus, useSettings } from '@omni-desk/client'

function SectionCard({
  title,
  icon,
  description,
  children
}: {
  title: string
  icon: ReactNode
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <UiCard sx={{ overflow: 'hidden' }}>
      <Stack
        direction="row"
        spacing={2}
        sx={(theme) => ({
          alignItems: 'flex-start',
          borderBottom: `1px solid ${theme.palette.divider}`,
          px: 3,
          py: 2
        })}
      >
        {icon}
        <Box>
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          {description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {description}
            </Typography>
          )}
        </Box>
      </Stack>
      <Box sx={{ px: 3, py: 2 }}>{children}</Box>
    </UiCard>
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
    <TextField
      fullWidth
      label={label}
      type={!secret || visible ? 'text' : 'password'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      helperText={hint}
      slotProps={{
        htmlInput: {
          autoComplete: 'off',
          spellCheck: false
        },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <KeyRound size={16} />
            </InputAdornment>
          ),
          endAdornment: secret ? (
            <InputAdornment position="end">
              <IconButton label={visible ? '隠す' : '表示'} onClick={() => setVisible((v) => !v)}>
                {visible ? <EyeOff size={16} /> : <Eye size={16} />}
              </IconButton>
            </InputAdornment>
          ) : undefined
        }
      }}
    />
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
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
      <Avatar name={name} url={avatarUrl} size={32} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="body1" sx={{ fontWeight: 500 }}>
            {name}
          </Typography>
          <Chip size="small" color="success" variant="outlined" icon={<ShieldCheck size={12} />} label="接続済み" />
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {detail}
        </Typography>
      </Box>
      <Button variant="danger" size="sm" onClick={onDisconnect} loading={pending}>
        接続を解除
      </Button>
    </Stack>
  )
}

function ErrorText({ error }: { error: Error | null }) {
  if (!error) return null
  return (
    <Alert severity="error" sx={{ mt: 2 }}>
      {error.message}
    </Alert>
  )
}

function Steps({ children }: { children: ReactNode }) {
  return (
    <Box component="ol" sx={{ m: 0, pl: 3, display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '12px', color: 'text.secondary' }}>
      {children}
    </Box>
  )
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
    <Stack spacing={2}>
      <Steps>{steps}</Steps>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
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
      </Box>
      <SecretInput
        label={requireHttps ? 'Redirect URL（https:// 必須）' : 'Redirect URL'}
        value={value.redirectUri}
        onChange={(redirectUri) => onChange({ ...value, redirectUri })}
        placeholder={redirectPlaceholder}
        secret={false}
      />
      <Box>
        <Button type="button" size="sm" disabled={!value.clientId.trim() || !validRedirect} onClick={openAuthorize}>
          <ExternalLink size={16} />
          ブラウザで認可ページを開く
        </Button>
      </Box>
      <SecretInput
        label="リダイレクト URL または認可コード"
        value={value.codeOrUrl}
        onChange={(codeOrUrl) => onChange({ ...value, codeOrUrl })}
        placeholder={`${redirectPlaceholder}?code=...`}
        hint="認可後に表示されたアドレスバーの URL 全体をそのまま貼り付けられます（Client ID / Secret は保存されません）。"
      />
    </Stack>
  )
}

const EMPTY_OAUTH: OAuthConnectInput = { clientId: '', clientSecret: '', redirectUri: '', codeOrUrl: '' }

function SlackSettings() {
  const settings = useSettings()
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
    <SectionCard
      title="Slack"
      icon={<SourceMark source="slack" size="md" />}
      description="複数ワークスペースのメンション・チャンネル・DM・To-dos を集約して表示します"
    >
      <Stack spacing={2}>
        {workspaces.length > 0 && (
          <Stack divider={<Divider />} spacing={2}>
            {workspaces.map((conn) => (
              <Box key={`${conn.teamUrl}:${conn.userId}`}>
                <ConnectedRow
                  name={conn.teamName}
                  detail={`${conn.userName} · ${conn.authType === 'session' ? 'ブラウザセッション（To-dos 対応）' : 'ユーザートークン（To-dos 非対応）'}`}
                  onDisconnect={() => {
                    setDisconnectingUrl(conn.teamUrl)
                    void disconnect.run(conn.teamUrl).finally(() => setDisconnectingUrl(null))
                  }}
                  pending={disconnect.pending && disconnectingUrl === conn.teamUrl}
                />
              </Box>
            ))}
          </Stack>
        )}

        {workspaces.length > 0 && !adding && (
          <Box>
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus size={16} />
              ワークスペースを追加
            </Button>
          </Box>
        )}

        {showForm && (
          <Stack
            component="form"
            spacing={2}
            sx={(theme) => ({
              borderTop: workspaces.length > 0 ? `1px solid ${theme.palette.divider}` : 'none',
              pt: workspaces.length > 0 ? 2 : 0
            })}
            onSubmit={(e: React.FormEvent) => {
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
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
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
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                  キャンセル
                </Button>
              )}
            </Stack>

            {mode === 'user' ? (
              <Stack spacing={2}>
                <Steps>
                  <li>
                    <a href="#" onClick={(e) => (e.preventDefault(), openExternal('https://api.slack.com/apps'))}>
                      api.slack.com/apps
                    </a>{' '}
                    で「From a manifest」を選び、リポジトリの <code>docs/slack-app-manifest.yml</code> を貼り付けてアプリを作成
                  </li>
                  <li>ワークスペースにインストールし、「User OAuth Token（xoxp-…）」をコピー</li>
                </Steps>
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                  {SLACK_USER_SCOPES.map((s) => (
                    <Chip key={s} size="small" label={s} />
                  ))}
                </Stack>
                <SecretInput label="User OAuth Token" value={token} onChange={setToken} placeholder="xoxp-..." />
                <Typography variant="caption" color="text.disabled">
                  ※ Slack の To-dos は公開 API が無いため、この方式では表示できません。社内でアプリのインストールに管理者承認が必要な場合があります。
                </Typography>
              </Stack>
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
                      <a href="#" onClick={(e) => (e.preventDefault(), openExternal('https://api.slack.com/apps'))}>
                        api.slack.com/apps
                      </a>{' '}
                      でアプリを作成し、「OAuth &amp; Permissions → Redirect URLs」に HTTPS の URL を登録
                    </li>
                    <li>Client ID / Client Secret / Redirect URL を入力し、「ブラウザで認可ページを開く」からワークスペースを認可</li>
                    <li>リダイレクト先の URL 全体（または <code>code</code> の値）を下に貼り付けて保存</li>
                  </>
                }
              />
            ) : (
              <Stack spacing={2}>
                <Alert severity="warning">
                  Slack Web クライアントと同じ認証情報（非公式な方法）を使います。To-dos と未読状態が取得できますが、
                  Slack 側の変更で動かなくなる可能性があります。<strong>利用前に社内のセキュリティポリシーを確認してください。</strong>
                  ログアウトすると無効になります。
                </Alert>
                <Steps>
                  <li>ブラウザで Slack ワークスペース（app.slack.com）を開き、開発者ツールを開く</li>
                  <li>
                    Application → Cookies → <code>https://app.slack.com</code> の <code>d</code> の値（xoxd-…）をコピー
                  </li>
                  <li>
                    Console で <code>Object.values(JSON.parse(localStorage.localConfig_v2).teams).map(t =&gt; [t.name, t.token])</code>{' '}
                    を実行し、対象ワークスペースの xoxc-… をコピー
                  </li>
                </Steps>
                <SecretInput label="セッショントークン" value={token} onChange={setToken} placeholder="xoxc-..." />
                <SecretInput label="d Cookie" value={cookie} onChange={setCookie} placeholder="xoxd-..." />
              </Stack>
            )}

            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Button type="submit" variant="primary" loading={activePending} disabled={!canSubmit}>
                接続をテストして保存
              </Button>
              <Typography variant="caption" color="text.disabled">
                トークンは OS のキーチェーンで暗号化して保存されます
              </Typography>
            </Stack>
            <ErrorText error={activeError} />
          </Stack>
        )}
      </Stack>
    </SectionCard>
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
    <SectionCard
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
              {rate && ` · API 残り ${rate.remaining} / ${rate.limit} 回（5 分）${rate.queued > 0 ? ` · 待機中 ${rate.queued} 件` : ''}`}
            </>
          }
          onDisconnect={() => void disconnect.run()}
          pending={disconnect.pending}
        />
      ) : (
        <Stack
          component="form"
          spacing={2}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault()
            void connect.run({ token }).then((ok) => ok && setToken(''))
          }}
        >
          <Steps>
            <li>
              Chatwork の「サービス連携」→「
              <a
                href="#"
                onClick={(e) => (e.preventDefault(), openExternal('https://www.chatwork.com/service/packages/chatwork/subpackages/api/token.php'))}
              >
                API トークン
              </a>
              」で発行したトークンをコピー（組織によっては管理者の許可が必要です）
            </li>
          </Steps>
          <SecretInput label="API トークン" value={token} onChange={setToken} placeholder="API トークンを貼り付け" />
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Button type="submit" variant="primary" loading={connect.pending} disabled={!token.trim()}>
              接続をテストして保存
            </Button>
            <Typography variant="caption" color="text.disabled">
              API の上限は 5 分あたり 300 回です（アプリ内で予算を管理します）
            </Typography>
          </Stack>
          <ErrorText error={connect.error} />
        </Stack>
      )}
    </SectionCard>
  )
}

function Row({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={3} sx={{ alignItems: 'center', justifyContent: 'space-between', py: 2 }}>
      <Box>
        <Typography variant="body1" sx={{ fontWeight: 500 }}>
          {label}
        </Typography>
        {description && (
          <Typography variant="caption" color="text.secondary">
            {description}
          </Typography>
        )}
      </Box>
      {children}
    </Stack>
  )
}

function DisplaySettings() {
  const settings = useSettings()
  const update = useAsyncAction(actions.updateSettings)
  const noneConnected = !settings.slack && !settings.chatwork

  return (
    <SectionCard title="表示と同期" icon={<Monitor size={16} />}>
      <Stack divider={<Divider />}>
        <Row label="テーマ">
          <Segmented<ThemePreference>
            size="sm"
            value={settings.theme}
            onChange={(theme) => void update.run({ theme })}
            options={[
              { value: 'system', label: <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><Monitor size={16} /><span>自動</span></Stack> },
              { value: 'light', label: <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><Sun size={16} /><span>ライト</span></Stack> },
              { value: 'dark', label: <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><Moon size={16} /><span>ダーク</span></Stack> }
            ]}
          />
        </Row>
        <Row
          label="Slack の自動更新の間隔"
          description="短くすると API の利用回数が増えます。Chatwork は変化を検知して自動で取得します"
        >
          <TextField
            select
            size="small"
            value={settings.refreshIntervalSec}
            onChange={(e) => void update.run({ refreshIntervalSec: Number(e.target.value) })}
            sx={{ minWidth: 104 }}
          >
            <MenuItem value={60}>1 分</MenuItem>
            <MenuItem value={120}>2 分</MenuItem>
            <MenuItem value={300}>5 分</MenuItem>
            <MenuItem value={600}>10 分</MenuItem>
          </TextField>
        </Row>
        <Row
          label="デモデータを表示"
          description={noneConnected ? 'サービス未接続のあいだは自動でデモデータを表示しています' : '接続中のデータの代わりにサンプルを表示します'}
        >
          <Switch
            checked={settings.demoActive}
            disabled={noneConnected}
            onChange={(_, checked) => void update.run({ demoMode: checked })}
          />
        </Row>
      </Stack>
    </SectionCard>
  )
}

function InboxSettings() {
  const settings = useSettings()
  const update = useAsyncAction(actions.updateSettings)
  return (
    <SectionCard
      title="受信箱"
      icon={<Inbox size={16} />}
      description="対応状況（未対応・あとで・対応済み）はこの PC に保存されます"
    >
      <Row
        label="対応済みにしたら、サービス側も既読にする"
        description="Chatwork はルーム単位の既読化のため、そのメッセージより前の未読もまとめて既読になります。Slack をユーザートークン方式で使う場合は、Slack アプリに channels:write・groups:write・im:write・mpim:write の権限が必要です"
      >
        <Switch
          checked={settings.markReadOnDone}
          onChange={(_, checked) => void update.run({ markReadOnDone: checked })}
        />
      </Row>
      <ErrorText error={update.error} />
    </SectionCard>
  )
}

function BlockedSendersSettings() {
  const settings = useSettings()
  const unblock = useAsyncAction(actions.unblockSender)
  const [unblocking, setUnblocking] = useState<string | null>(null)
  const list = settings.blockedSenders ?? []

  return (
    <SectionCard
      title="非表示にする送信者"
      icon={<EyeOff size={16} />}
      description="受信箱・ホームの「あなた宛て」・サイドバーの件数に含めない送信者です。会話画面では通常どおり表示されます"
    >
      {list.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          非表示にしている送信者はいません。受信箱のメッセージにカーソルを合わせ、「この送信者を受信箱で非表示」を押すとここに追加されます。
        </Typography>
      ) : (
        <Stack divider={<Divider />} spacing={2}>
          {list.map((s) => {
            const rowKey = `${s.source}:${s.senderId}`
            const pending = unblock.pending && unblocking === rowKey
            return (
              <Stack key={rowKey} direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <SourceMark source={s.source} size="md" />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body1" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.name}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    {SOURCE_LABEL[s.source]} · ID: {s.senderId}
                  </Typography>
                </Box>
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
              </Stack>
            )
          })}
        </Stack>
      )}
      <ErrorText error={unblock.error} />
    </SectionCard>
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
    <SectionCard
      title="GitHub"
      icon={<FolderGit2 size={16} />}
      description="個人用・会社用など複数のトークンを登録でき、PR・Issue・Organization リポジトリを集約します"
    >
      <Stack spacing={2}>
        {accounts.length > 0 && (
          <Stack divider={<Divider />} spacing={2}>
            {accounts.map((conn, idx) => {
              const accountId = conn.id ?? conn.login
              return (
                <Box key={`${accountId}:${idx}`}>
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
                </Box>
              )
            })}
          </Stack>
        )}

        {accounts.length > 0 && !adding && (
          <Box>
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus size={16} />
              トークン / アカウントを追加
            </Button>
          </Box>
        )}

        {showForm && (
          <Stack
            component="form"
            spacing={2}
            sx={(theme) => ({
              borderTop: accounts.length > 0 ? `1px solid ${theme.palette.divider}` : 'none',
              pt: accounts.length > 0 ? 2 : 0
            })}
            onSubmit={(e: React.FormEvent) => {
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
              <Stack spacing={2}>
                <SecretInput label="ラベル（任意）" value={label} onChange={setLabel} placeholder="例: 個人用 / 会社用" secret={false} />
                <SecretInput
                  label="Personal Access Token"
                  value={token}
                  onChange={setToken}
                  placeholder="ghp_... / github_pat_..."
                  hint="repo / read:user スコープを持つトークンを入力してください（Organization 用トークンも追加できます）。"
                />
              </Stack>
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
                    <li>リダイレクト先の URL 全体（または <code>code</code>）を貼り付けて保存</li>
                  </>
                }
              />
            )}
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Button type="submit" variant="primary" loading={activePending} disabled={!canSubmit}>
                接続をテストして保存
              </Button>
              {accounts.length > 0 && (
                <Button type="button" size="sm" onClick={() => setAdding(false)}>
                  キャンセル
                </Button>
              )}
            </Stack>
            <ErrorText error={activeError} />
          </Stack>
        )}
      </Stack>
    </SectionCard>
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
    <SectionCard
      title="Atlassian CLI（Jira / Confluence）"
      icon={<Ticket size={16} />}
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
        <Stack
          component="form"
          spacing={2}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault()
            void connect.run({ binaryPath, siteUrl: siteUrl.trim() || undefined })
          }}
        >
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            <SecretInput label="acli バイナリパス" value={binaryPath} onChange={setBinaryPath} placeholder="acli" secret={false} />
            <SecretInput
              label="Atlassian サイト URL（任意）"
              value={siteUrl}
              onChange={setSiteUrl}
              placeholder="https://your-domain.atlassian.net"
              secret={false}
            />
          </Box>
          <Box>
            <Button type="submit" variant="primary" loading={connect.pending} disabled={!binaryPath.trim()}>
              acli の接続を確認して保存
            </Button>
          </Box>
          <ErrorText error={connect.error} />
        </Stack>
      )}
    </SectionCard>
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
    <SectionCard
      title="Notion"
      icon={<FileText size={16} />}
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
        <Stack
          component="form"
          spacing={2}
          onSubmit={(e: React.FormEvent) => {
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
                  <li>リダイレクト先の URL 全体（または <code>code</code>）を貼り付けて保存</li>
                </>
              }
            />
          )}
          <Box>
            <Button type="submit" variant="primary" loading={activePending} disabled={!canSubmit}>
              接続をテストして保存
            </Button>
          </Box>
          <ErrorText error={activeError} />
        </Stack>
      )}
    </SectionCard>
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
    <SectionCard
      title="Google 連携"
      icon={<CalendarDays size={16} />}
      description="連携対象: Google Calendar・Gmail（今後 Google サービスを順次追加予定）。複数アカウントをまとめて連携できます"
    >
      <Stack spacing={2}>
        {accounts.length > 0 && (
          <Stack divider={<Divider />} spacing={2}>
            {accounts.map((acc) => (
              <Box key={acc.id}>
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
              </Box>
            ))}
          </Stack>
        )}

        {accounts.length > 0 && !adding && (
          <Box>
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus size={16} />
              Google アカウントを追加
            </Button>
          </Box>
        )}

        {showForm && (
          <Stack
            spacing={2}
            sx={(theme) => ({
              borderTop: accounts.length > 0 ? `1px solid ${theme.palette.divider}` : 'none',
              pt: accounts.length > 0 ? 2 : 0
            })}
          >
            <Typography variant="body2" color="text.secondary">
              ボタンを押すとブラウザで Google の認証画面が開き、許可するだけで Google Calendar と Gmail がまとめて連携されます。
            </Typography>

            <SecretInput label="ラベル（任意）" value={label} onChange={setLabel} placeholder="例: 仕事用 / 個人用" secret={false} />

            {!hasDefaults && !showCustom && (
              <Alert severity="warning">
                既定の OAuth クライアントが未設定です。リポジトリ直下の <code>.env.local</code> に{' '}
                <code>OMNI_GOOGLE_CLIENT_ID</code> を設定するか、下の「別の OAuth アプリを使う」から入力してください。
              </Alert>
            )}

            {(showCustom || !hasDefaults) && (
              <Paper
                variant="outlined"
                sx={(theme) => ({
                  p: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  bgcolor: theme.palette.mode === 'dark' ? '#12151a' : '#f6f7f9'
                })}
              >
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
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
                </Box>
                <Typography variant="caption" color="text.disabled">
                  ※ リダイレクト URI の手入力や URL のコピペは不要です（ローカルの一時ポートで自動受信します）。
                </Typography>
              </Paper>
            )}

            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
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
                <ExternalLink size={16} />
                {startOAuth.pending ? 'ブラウザで認証を待機中…' : 'Google アカウントと連携'}
              </Button>
              {accounts.length > 0 && (
                <Button type="button" size="sm" onClick={() => setAdding(false)}>
                  キャンセル
                </Button>
              )}
              {hasDefaults && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowCustom((v) => !v)}>
                  {showCustom ? '詳細設定を閉じる' : '別の OAuth アプリを使う'}
                </Button>
              )}
            </Stack>
            <ErrorText error={startOAuth.error} />
          </Stack>
        )}
      </Stack>
    </SectionCard>
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
    <Stack sx={{ height: '100%' }}>
      <PageHeader title="設定" subtitle="サービスの接続と表示の設定" />
      <Stack direction={{ xs: 'column', md: 'row' }} sx={{ minHeight: 0, flex: 1 }}>
        <Box
          component="nav"
          aria-label="設定の目次"
          sx={(theme) => ({
            flexShrink: 0,
            borderBottom: { xs: `1px solid ${theme.palette.divider}`, md: 'none' },
            borderRight: { md: `1px solid ${theme.palette.divider}` },
            bgcolor: theme.palette.background.paper,
            width: { md: 208 },
            overflowY: { md: 'auto' },
            px: 2,
            py: 2
          })}
        >
          <Stack direction={{ xs: 'row', md: 'column' }} spacing={2} sx={{ overflowX: { xs: 'auto', md: 'visible' } }}>
            {(['integrations', 'app'] as const).map((group) => (
              <Stack key={group} direction={{ xs: 'row', md: 'column' }} spacing={0.5} sx={{ flexShrink: 0 }}>
                <Typography
                  variant="caption"
                  color="text.disabled"
                  sx={{ display: { xs: 'none', md: 'block' }, px: 1, pb: 0.5, fontWeight: 600 }}
                >
                  {group === 'integrations' ? 'サービス連携' : 'アプリ設定'}
                </Typography>
                {sections
                  .filter((s) => s.group === group)
                  .map((item) => {
                    const active = activeId === item.id
                    return (
                      <ListItemButton
                        key={item.id}
                        selected={active}
                        onClick={() => scrollTo(item.id)}
                        sx={{ borderRadius: 1, px: 1, py: 0.5, minHeight: 32, justifyContent: 'space-between', gap: 1, whiteSpace: 'nowrap' }}
                      >
                        <Stack direction="row" spacing={1} sx={{ minWidth: 0, alignItems: 'center' }}>
                          {item.group === 'integrations' && (
                            <Box
                              component="span"
                              sx={(theme) => ({
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                flexShrink: 0,
                                bgcolor: item.connected ? theme.palette.success.main : theme.palette.divider
                              })}
                            />
                          )}
                          <Typography variant="body2" sx={{ fontWeight: active ? 600 : 400 }}>
                            {item.label}
                          </Typography>
                        </Stack>
                        {item.status && <Chip size="small" label={item.status} />}
                      </ListItemButton>
                    )
                  })}
              </Stack>
            ))}
          </Stack>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          <Stack spacing={3} sx={{ mx: 'auto', maxWidth: 760, px: 3, py: 3 }}>
            {!settings.encryptionAvailable && (
              <Alert severity="error">OS の暗号化ストレージが利用できないため、トークンを保存できません。</Alert>
            )}
            <Box id="settings-slack"><SlackSettings /></Box>
            <Box id="settings-chatwork"><ChatworkSettings /></Box>
            <Box id="settings-github"><GitHubSettings /></Box>
            <Box id="settings-atlassian"><AtlassianSettings /></Box>
            <Box id="settings-notion"><NotionSettings /></Box>
            <Box id="settings-google"><GoogleSettings /></Box>
            <Box id="settings-inbox"><InboxSettings /></Box>
            <Box id="settings-display"><DisplaySettings /></Box>
            <Box id="settings-blocked"><BlockedSendersSettings /></Box>
            <Typography variant="caption" color="text.disabled" sx={{ pb: 2, textAlign: 'center' }}>
              Microsoft Teams・その他メール（IMAP / Microsoft 365 等）の連携は今後追加予定です
            </Typography>
          </Stack>
        </Box>
      </Stack>
    </Stack>
  )
}
