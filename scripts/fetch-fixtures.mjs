#!/usr/bin/env node
/**
 * 抓取解析器用的真实页面夹具（公开页面，无需登录）。
 * 用法：pnpm fixtures
 * 结构变化时先更新夹具，再改 src/lib/parser/selectors.ts，最后跑 pnpm test。
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const TARGETS = [
  ['login.html', 'https://stage1st.com/2b/member.php?mod=logging&action=login&mobile=2'],
  ['index.html', 'https://stage1st.com/2b/forum.php?mobile=2'],
  ['forumdisplay-fid6-p1.html', 'https://stage1st.com/2b/forum.php?mod=forumdisplay&fid=6&mobile=2'],
  ['viewthread-1826103-p1.html', 'https://stage1st.com/2b/forum.php?mod=viewthread&tid=1826103&page=1&mobile=2'],
]

const outputDir = path.resolve(import.meta.dirname, '../tests/fixtures')

for (const [name, url] of TARGETS) {
  const response = await fetch(url, { headers: { 'user-agent': UA } })
  if (!response.ok) {
    console.error(`✗ ${name}: HTTP ${response.status}`)
    continue
  }
  const html = await response.text()
  await writeFile(path.join(outputDir, name), html, 'utf8')
  console.log(`✓ ${name} (${html.length} bytes)`)
}
