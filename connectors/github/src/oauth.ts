import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { AppError, extractOAuthCode } from '@omni-desk/connector-core'
import { buildGitHubAuthorizeUrl, type OAuthConnectInput } from '@omni-desk/contracts'

interface GitHubTokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

/** GitHub OAuth 2.0 の認可コードをアクセストークンへ交換する */
export async function exchangeGitHubOAuthCode(input: OAuthConnectInput): Promise<string> {
  const code = extractOAuthCode(input.codeOrUrl, input.state, 'GitHub')
  const body = new URLSearchParams({
    client_id: input.clientId.trim(),
    client_secret: input.clientSecret.trim(),
    code,
    redirect_uri: input.redirectUri.trim()
  })

  let res: Response
  try {
    res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    })
  } catch (error) {
    throw new AppError(
      'network',
      error instanceof Error ? `GitHub OAuth 通信エラー: ${error.message}` : 'GitHub OAuth 通信エラー'
    )
  }

  const data = (await res.json()) as GitHubTokenResponse
  if (data.error || !data.access_token) {
    throw new AppError(
      'auth_error',
      `GitHub OAuth トークン交換に失敗しました（${data.error_description ?? data.error ?? `http_${res.status}`}）`
    )
  }
  return data.access_token.trim()
}

const resultHtml = (ok: boolean, message: string): string => `<!doctype html>
<html lang="ja">
<head><meta charset="utf-8"><title>OmniDesk GitHub 連携</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif; background:#0f1115; color:#eef0f4; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
  .card { background:#171a20; border:1px solid #252a33; border-radius:14px; padding:28px 32px; max-width:440px; text-align:center; }
  h1 { font-size:18px; margin:0 0 10px; color:${ok ? '#38b889' : '#f06a6a'}; }
  p { font-size:13.5px; color:#9ca3af; margin:0; line-height:1.6; }
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
 * ローカルループバック HTTP サーバーを使って、
 * ブラウザでの「Authorize」クリックだけで自動的に GitHub アクセストークン取得まで完了する。
 */
export async function startGitHubLoopbackOAuth(params: {
  clientId: string
  clientSecret: string
  onOpenUrl: (url: string) => Promise<void> | void
  timeoutMs?: number
}): Promise<string> {
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
        res.end(resultHtml(false, `GitHub の認可がキャンセルまたは拒否されました（${oauthError}）。`))
        finish(new AppError('auth_error', `GitHub の認可がキャンセルまたは拒否されました（${oauthError}）`))
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
        finish(new AppError('auth_error', 'GitHub から認可コードが返されませんでした'))
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(resultHtml(true, 'このタブを閉じて OmniDesk にお戻りください。'))
      finish(null, authCode)
    })

    const timer = setTimeout(() => {
      finish(new AppError('auth_error', 'GitHub 認証がタイムアウトしました（3 分）。もう一度お試しください'))
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
      const authUrl = buildGitHubAuthorizeUrl({
        clientId: params.clientId,
        redirectUri,
        state
      })
      Promise.resolve(params.onOpenUrl(authUrl)).catch((err) => {
        finish(err instanceof Error ? err : new Error(String(err)))
      })
    })
  })

  return exchangeGitHubOAuthCode({
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    redirectUri,
    codeOrUrl: code
  })
}
