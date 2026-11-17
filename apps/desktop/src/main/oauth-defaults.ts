import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {}
  const out: Record<string, string> = {}
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (val) out[key] = val
  }
  return out
}

function candidateDirs(): string[] {
  const dirs = new Set<string>()
  for (const start of [process.cwd(), app.getAppPath()]) {
    let cur = resolve(start)
    for (let i = 0; i < 5; i++) {
      dirs.add(cur)
      const parent = dirname(cur)
      if (parent === cur) break
      cur = parent
    }
  }
  return [...dirs]
}

function readGoogleSecretJson(dirs: string[]): { clientId?: string; clientSecret?: string } {
  for (const dir of dirs) {
    const file = join(dir, 'secret.json')
    if (!existsSync(file)) continue
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
        installed?: { client_id?: string; client_secret?: string }
        web?: { client_id?: string; client_secret?: string }
      }
      const block = parsed.installed ?? parsed.web
      const clientId = block?.client_id?.trim() || undefined
      const clientSecret = block?.client_secret?.trim() || undefined
      if (clientId) return { clientId, clientSecret }
    } catch {
      // ignore malformed json
    }
  }
  return {}
}

function loadEnvFiles(): Record<string, string> {
  const dirs = candidateDirs()
  const env: Record<string, string> = {}
  for (const dir of [...dirs].reverse()) {
    for (const file of ['.env', '.env.local']) {
      Object.assign(env, parseEnvFile(join(dir, file)))
    }
  }
  return env
}

export function getGoogleOAuthDefaults(): { clientId?: string; clientSecret?: string } {
  const dirs = candidateDirs()
  const env = loadEnvFiles()
  const fromJson = readGoogleSecretJson(dirs)
  const clientId = process.env.OMNI_GOOGLE_CLIENT_ID?.trim() || env.OMNI_GOOGLE_CLIENT_ID || fromJson.clientId
  const clientSecret =
    process.env.OMNI_GOOGLE_CLIENT_SECRET?.trim() || env.OMNI_GOOGLE_CLIENT_SECRET || fromJson.clientSecret

  return { clientId, clientSecret }
}

export function getGitHubOAuthDefaults(): { clientId?: string; clientSecret?: string } {
  const env = loadEnvFiles()
  const clientId = process.env.OMNI_GITHUB_CLIENT_ID?.trim() || env.OMNI_GITHUB_CLIENT_ID
  const clientSecret = process.env.OMNI_GITHUB_CLIENT_SECRET?.trim() || env.OMNI_GITHUB_CLIENT_SECRET
  return { clientId, clientSecret }
}
