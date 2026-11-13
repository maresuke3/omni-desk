import { AppError, extractOAuthCode } from '@omni-desk/connector-core'
import type { SlackOAuthInput } from '@omni-desk/contracts'

export { extractOAuthCode }

interface OAuthAccessResponse {
  ok: boolean
  error?: string
  authed_user?: {
    access_token?: string
  }
}

/**
 * Slack OAuth 2.0 の認可コードを User OAuth Token（xoxp-...）へ交換する。
 */
export async function exchangeSlackOAuthCode(input: SlackOAuthInput): Promise<string> {
  const code = extractOAuthCode(input.codeOrUrl, input.state, 'Slack')
  const body = new URLSearchParams({
    client_id: input.clientId.trim(),
    client_secret: input.clientSecret.trim(),
    code,
    redirect_uri: input.redirectUri.trim()
  })

  let response: Response
  try {
    response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
  } catch (error) {
    throw new AppError(
      'network',
      error instanceof Error ? `Slack OAuth 通信エラー: ${error.message}` : 'Slack OAuth 通信エラー'
    )
  }

  const data = (await response.json()) as OAuthAccessResponse
  if (!data.ok) {
    const codeName = data.error ?? `http_${response.status}`
    throw new AppError('auth_error', `Slack OAuth トークン交換に失敗しました（${codeName}）`)
  }

  const token = data.authed_user?.access_token?.trim()
  if (!token) {
    throw new AppError(
      'auth_error',
      'User OAuth Token（authed_user.access_token）を取得できませんでした。user_scope が設定されているか確認してください'
    )
  }
  return token
}
