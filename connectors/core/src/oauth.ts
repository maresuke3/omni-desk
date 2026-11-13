import { AppError } from './errors'

/**
 * 貼り付けられたリダイレクト URL または認可コード文字列から `code` を取り出す。
 * URL の場合は `error` パラメータと `state`（指定時）も検証する。
 */
export function extractOAuthCode(codeOrUrl: string, expectedState?: string, serviceLabel = 'OAuth'): string {
  const trimmed = codeOrUrl.trim()
  if (!trimmed) {
    throw new AppError('invalid_input', '認可コードまたはリダイレクト URL を入力してください')
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new AppError('invalid_input', 'リダイレクト URL の形式が正しくありません')
  }

  const oauthError = parsed.searchParams.get('error')
  if (oauthError) {
    throw new AppError('auth_error', `${serviceLabel} の認可がキャンセルまたは拒否されました（${oauthError}）`)
  }

  if (expectedState) {
    const actualState = parsed.searchParams.get('state')
    if (actualState !== expectedState) {
      throw new AppError('auth_error', 'OAuth の state が一致しません。もう一度認可をやり直してください')
    }
  }

  const code = parsed.searchParams.get('code')?.trim()
  if (!code) {
    throw new AppError('invalid_input', 'URL に認可コード（code）が含まれていません')
  }
  return code
}
