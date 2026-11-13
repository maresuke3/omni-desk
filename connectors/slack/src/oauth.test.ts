import { describe, expect, it } from 'vitest'
import { buildSlackAuthorizeUrl, SLACK_USER_SCOPES } from '@omni-desk/contracts'
import { extractOAuthCode } from './oauth'

describe('slack-oauth', () => {
  it('認可 URL に必要なパラメータと user_scope を含める', () => {
    const url = new URL(
      buildSlackAuthorizeUrl({
        clientId: '123.456',
        redirectUri: 'https://localhost:3000/callback',
        state: 'state-xyz'
      })
    )
    expect(url.origin + url.pathname).toBe('https://slack.com/oauth/v2/authorize')
    expect(url.searchParams.get('client_id')).toBe('123.456')
    expect(url.searchParams.get('redirect_uri')).toBe('https://localhost:3000/callback')
    expect(url.searchParams.get('state')).toBe('state-xyz')
    expect(url.searchParams.get('user_scope')).toBe(SLACK_USER_SCOPES.join(','))
  })

  it('リダイレクト URL から code を抽出し、state を検証する', () => {
    expect(
      extractOAuthCode('https://localhost:3000/callback?code=abc.123&state=s1', 's1')
    ).toBe('abc.123')
    expect(() =>
      extractOAuthCode('https://localhost:3000/callback?code=abc.123&state=wrong', 's1')
    ).toThrow(/state/)
    expect(() =>
      extractOAuthCode('https://localhost:3000/callback?error=access_denied', 's1')
    ).toThrow(/access_denied/)
  })

  it('生の認可コードをそのまま受け取れる', () => {
    expect(extractOAuthCode('  12345.67890.abcdef  ')).toBe('12345.67890.abcdef')
  })
})
