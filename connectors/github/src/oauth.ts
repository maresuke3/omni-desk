import { AppError, extractOAuthCode } from '@omni-desk/connector-core'
import type { OAuthConnectInput } from '@omni-desk/contracts'

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
