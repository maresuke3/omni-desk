#!/usr/bin/env node
/**
 * モノレポの依存境界チェック（マイクロフロントエンドの独立性を機械的に守る）。
 *
 *  - 各パッケージが import してよいワークスペースパッケージを「種類」ごとに制限する
 *  - import しているワークスペースパッケージは package.json に宣言されていること
 *  - 相対パスでパッケージの外に出る import をしないこと
 *
 * 使い方: pnpm lint:boundaries
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GROUPS = ['apps', 'packages', 'connectors', 'features']

/** 種類 → import してよい種類（'*' は制限なし） */
const ALLOWED = {
  app: ['*'],
  contracts: [],
  ui: ['contracts'],
  client: ['contracts'],
  'message-kit': ['contracts', 'ui', 'client'],
  feature: ['contracts', 'ui', 'client', 'message-kit'],
  'connector-core': ['contracts'],
  connector: ['contracts', 'connector-core']
}

function kindOf(group, dirName) {
  if (group === 'apps') return 'app'
  if (group === 'features') return 'feature'
  if (group === 'connectors') return dirName === 'core' ? 'connector-core' : 'connector'
  return dirName
}

// ---------------------------------------------------------------- collect packages
const packages = []
for (const group of GROUPS) {
  const groupDir = join(ROOT, group)
  if (!existsSync(groupDir)) continue
  for (const dirName of readdirSync(groupDir)) {
    const dir = join(groupDir, dirName)
    const pkgPath = join(dir, 'package.json')
    if (!existsSync(pkgPath)) continue
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    const kind = kindOf(group, dirName)
    if (!(kind in ALLOWED)) {
      console.error(`未知のパッケージ種別です: ${relative(ROOT, dir)}（scripts/check-boundaries.mjs の ALLOWED に追加してください）`)
      process.exit(1)
    }
    const declared = new Set(
      Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }).filter((n) =>
        n.startsWith('@omni-desk/')
      )
    )
    packages.push({ name: pkg.name, dir, kind, declared })
  }
}
const byName = new Map(packages.map((p) => [p.name, p]))

// ---------------------------------------------------------------- scan sources
function* sourceFiles(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'out' || entry === 'dist') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* sourceFiles(full)
    else if (/\.(ts|tsx|mts|css)$/.test(entry)) yield full
  }
}

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]|@import\s+['"]([^'"]+)['"]/g

const errors = []
for (const pkg of packages) {
  const allowed = ALLOWED[pkg.kind]
  const srcDir = join(pkg.dir, 'src')
  if (!existsSync(srcDir)) continue
  for (const file of sourceFiles(srcDir)) {
    const text = readFileSync(file, 'utf8')
    const rel = relative(ROOT, file)
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2] ?? m[3] ?? m[4]
      if (spec.startsWith('.')) {
        const target = resolve(dirname(file), spec)
        if (!(target + sep).startsWith(pkg.dir + sep)) {
          errors.push(`${rel}: 相対パスでパッケージ外を参照しています → ${spec}`)
        }
        continue
      }
      if (!spec.startsWith('@omni-desk/')) continue
      const targetName = spec.split('/').slice(0, 2).join('/')
      const target = byName.get(targetName)
      if (!target) {
        errors.push(`${rel}: 存在しないワークスペースパッケージです → ${targetName}`)
        continue
      }
      if (target.name === pkg.name) continue
      if (!allowed.includes('*') && !allowed.includes(target.kind)) {
        errors.push(`${rel}: ${pkg.kind} は ${target.kind}（${targetName}）に依存できません`)
      }
      if (!pkg.declared.has(targetName)) {
        errors.push(`${rel}: ${targetName} が ${relative(ROOT, pkg.dir)}/package.json に宣言されていません`)
      }
    }
  }
}

if (errors.length) {
  console.error(`依存境界の違反が ${errors.length} 件あります:\n`)
  for (const e of errors) console.error(`  ✗ ${e}`)
  process.exit(1)
}
console.log(`依存境界 OK（${packages.length} パッケージ）`)
