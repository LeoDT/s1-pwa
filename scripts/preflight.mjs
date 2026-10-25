#!/usr/bin/env node
/**
 * 部署预检：不联网，只检查本地配置与构建产物。
 * 用法：pnpm preflight（通常在 pnpm build 之后、wrangler deploy 之前）
 */
import { access, readdir, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const root = process.cwd()
const notes = []
const problems = []

const exists = (relative) =>
  access(path.join(root, relative)).then(
    () => true,
    () => false,
  )

const ok = (message) => notes.push(`✓ ${message}`)
const bad = (message) => problems.push(`✗ ${message}`)

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(full)))
    else files.push(full)
  }
  return files
}

// —— D1 绑定：database_id 必须换成真实值
const wrangler = await readFile(path.join(root, 'wrangler.jsonc'), 'utf8')
const databaseName = /"database_name"\s*:\s*"([^"]+)"/.exec(wrangler)?.[1]
const databaseId = /"database_id"\s*:\s*"([^"]*)"/.exec(wrangler)?.[1]

if (!databaseId) {
  bad('wrangler.jsonc 缺少 database_id')
} else if (/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(databaseId) || databaseId.startsWith('replace')) {
  bad(
    'database_id 仍是占位 UUID：先执行 `pnpm exec wrangler d1 create ' +
      `${databaseName ?? 's1-progress'}` +
      '`，把输出的 id 填回 wrangler.jsonc',
  )
} else {
  ok(`D1 绑定已配置（${databaseName ?? 'DB'}）`)
}

// —— 迁移 seam：core 层不得依赖 Cloudflare / Node 运行时
const forbidden = ['env.DB', 'caches.default', 'process.env', 'wrangler', 'waitUntil']
let seamClean = true
for (const file of await walk(path.join(root, 'server/core'))) {
  const text = await readFile(file, 'utf8')
  for (const token of forbidden) {
    if (!text.includes(token)) continue
    seamClean = false
    bad(`${path.relative(root, file)} 出现平台耦合：${token}`)
  }
}
if (seamClean) ok('server/core 无 Cloudflare / Node 平台耦合')

// —— 构建产物：PWA 壳与迁移文件
const artifacts = ['dist/index.html', 'dist/sw.js', 'dist/manifest.webmanifest']
for (const artifact of artifacts) {
  if (await exists(artifact)) ok(`构建产物存在：${artifact}`)
  else bad(`缺少 ${artifact}，先执行 \`pnpm build\``)
}

const migrations = (await readdir(path.join(root, 'migrations')))
  .filter((name) => name.endsWith('.sql'))
  .sort()
if (migrations.length === 0) bad('migrations/ 下没有 SQL 迁移')
else ok(`迁移文件：${migrations.join(', ')}`)

// —— 本地 secrets 不得进入版本库
try {
  execFileSync('git', ['ls-files', '--error-unmatch', '.dev.vars'], {
    cwd: root,
    stdio: 'ignore',
  })
  bad('.dev.vars 已被 git 跟踪，立即移出版本库并轮换其中的 secret')
} catch {
  ok('.dev.vars 未被 git 跟踪')
}

if (problems.length > 0) {
  console.error([...problems, '', ...notes].join('\n'))
  console.error('\n部署预检未通过。')
  process.exitCode = 1
} else {
  console.log([...notes, '', '部署预检通过。'].join('\n'))
}
