import { AppError, extractOAuthCode } from '@omni-desk/connector-core'
import type { OAuthConnectInput } from '@omni-desk/contracts'

interface NotionTokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

/** Notion OAuth 2.0 の認可コードをアクセストークンへ交換する */
export async function exchangeNotionOAuthCode(input: OAuthConnectInput): Promise<string> {
  const code = extractOAuthCode(input.codeOrUrl, input.state, 'Notion')
  const basic = Buffer.from(`${input.clientId.trim()}:${input.clientSecret.trim()}`).toString('base64')

  let res: Response
  try {
    res = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: input.redirectUri.trim()
      })
    })
  } catch (error) {
    throw new AppError(
      'network',
      error instanceof Error ? `Notion OAuth 通信エラー: ${error.message}` : 'Notion OAuth 通信エラー'
    )
  }

  const data = (await res.json()) as NotionTokenResponse
  if (!res.ok || data.error || !data.access_token) {
    throw new AppError(
      'auth_error',
      `Notion OAuth トークン交換に失敗しました（${data.error_description ?? data.error ?? `http_${res.status}`}）`
    )
  }
  return data.access_token.trim()
}
