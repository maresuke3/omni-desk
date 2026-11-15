import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { AppError } from '@omni-desk/connector-core'
import { buildGoogleAuthorizeUrl, GOOGLE_GMAIL_SCOPES } from '@omni-desk/contracts'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export interface GoogleMailOAuthTokens {
  accessToken: string
  refreshToken?: string
  expiresAt: number
}

interface GoogleTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  return { codeVerifier, codeChallenge }
}

async function exchangeCodeForTokens(params: {
  clientId: string
  clientSecret?: string
  redirectUri: string
  code: string
  codeVerifier?: string
}): Promise<GoogleMailOAuthTokens> {
  const body = new URLSearchParams({
    client_id: params.clientId.trim(),
    redirect_uri: params.redirectUri.trim(),
    code: params.code,
    grant_type: 'authorization_code'
  })
  if (params.clientSecret?.trim()) body.set('client_secret', params.clientSecret.trim())
  if (params.codeVerifier) body.set('code_verifier', params.codeVerifier)

  let res: Response
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString()
    })
  } catch (err) {
    throw new AppError(
      'network',
      `Google OAuth トークン交換に失敗しました: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  const data = (await res.json().catch(() => null)) as GoogleTokenResponse | null
  if (!res.ok || !data?.access_token) {
    const reason = data?.error_description ?? data?.error ?? `HTTP ${res.status}`
    throw new AppError('auth_error', `Google OAuth 認可に失敗しました（${reason}）`)
  }

  const expiresInMs = (typeof data.expires_in === 'number' ? data.expires_in : 3600) * 1000
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + expiresInMs
  }
}

const resultHtml = (ok: boolean, message: string): string => `<!doctype html>
<html lang="ja">
<head><meta charset="utf-8" /><title>OmniDesk</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #0f1115; color: #f3f4f6; }
  .card { max-width: 420px; padding: 28px 32px; border-radius: 14px; background: #181b22; border: 1px solid #2a2f3a; text-align: center; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  p { font-size: 13.5px; color: #9ca3af; margin: 0; line-height: 1.6; }
</style>
</head>
<body>
  <div class="card">
    <h1>${ok ? 'OmniDesk との連携が完了しました' : '連携に失敗しました'}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`

/**
 * ローカルループバック HTTP サーバー + PKCE を使って、
 * ブラウザでの「許可」クリックだけで Gmail トークン取得まで完了する。
 */
export async function startGoogleMailLoopbackOAuth(params: {
  clientId: string
  clientSecret?: string
  onOpenUrl: (url: string) => Promise<void> | void
  timeoutMs?: number
}): Promise<GoogleMailOAuthTokens> {
  const { codeVerifier, codeChallenge } = generatePkcePair()
  const state = randomUUID()
  const timeoutMs = params.timeoutMs ?? 180_000

  const { code, redirectUri } = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    let settled = false
    let redirectUri = ''

    const server = createServer((req, res) => {
      const reqUrl = new URL(req.url ?? '/', redirectUri || 'http://127.0.0.1')
      if (reqUrl.pathname !== '/callback') {
        res.writeHead(404).end('Not Found')
        return
      }

      const oauthError = reqUrl.searchParams.get('error')
      const actualState = reqUrl.searchParams.get('state')
      const authCode = reqUrl.searchParams.get('code')?.trim()

      if (oauthError) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(resultHtml(false, `Google の認可がキャンセルまたは拒否されました（${oauthError}）。`))
        finish(new AppError('auth_error', `Google の認可がキャンセルまたは拒否されました（${oauthError}）`))
        return
      }
      if (actualState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(resultHtml(false, '認証パラメータが一致しませんでした。アプリからやり直してください。'))
        finish(new AppError('auth_error', 'OAuth の state が一致しませんでした'))
        return
      }
      if (!authCode) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(resultHtml(false, '認可コードが取得できませんでした。'))
        finish(new AppError('auth_error', 'Google から認可コードが返されませんでした'))
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(resultHtml(true, 'このタブを閉じて OmniDesk にお戻りください。'))
      finish(null, authCode)
    })

    const timer = setTimeout(() => {
      finish(new AppError('auth_error', 'Google 認証がタイムアウトしました（3 分）。もう一度お試しください'))
    }, timeoutMs)

    const finish = (err: Error | null, authCode?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      server.close()
      if (err) reject(err)
      else resolve({ code: authCode!, redirectUri })
    }

    server.on('error', (err) => {
      finish(new AppError('unknown', `ローカル認証サーバーを起動できませんでした: ${err.message}`))
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        finish(new AppError('unknown', 'ローカル認証ポートの取得に失敗しました'))
        return
      }
      redirectUri = `http://127.0.0.1:${addr.port}/callback`
      const authUrl = buildGoogleAuthorizeUrl({
        clientId: params.clientId,
        redirectUri,
        state,
        codeChallenge,
        scopes: GOOGLE_GMAIL_SCOPES
      })
      Promise.resolve(params.onOpenUrl(authUrl)).catch((err) => {
        finish(err instanceof Error ? err : new AppError('unknown', String(err)))
      })
    })
  })

  return exchangeCodeForTokens({
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    redirectUri,
    code,
    codeVerifier
  })
}

export async function refreshGoogleMailAccessToken(params: {
  clientId: string
  clientSecret?: string
  refreshToken: string
}): Promise<{ accessToken: string; expiresAt: number }> {
  const body = new URLSearchParams({
    client_id: params.clientId.trim(),
    refresh_token: params.refreshToken,
    grant_type: 'refresh_token'
  })
  if (params.clientSecret?.trim()) body.set('client_secret', params.clientSecret.trim())

  let res: Response
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString()
    })
  } catch (err) {
    throw new AppError(
      'network',
      `Google アクセストークンの更新に失敗しました: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  const data = (await res.json().catch(() => null)) as GoogleTokenResponse | null
  if (!res.ok || !data?.access_token) {
    const reason = data?.error_description ?? data?.error ?? `HTTP ${res.status}`
    throw new AppError('auth_error', `Google の再認証が必要です（${reason}）`)
  }

  const expiresInMs = (typeof data.expires_in === 'number' ? data.expires_in : 3600) * 1000
  return { accessToken: data.access_token, expiresAt: Date.now() + expiresInMs }
}
