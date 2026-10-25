#!/usr/bin/env node
/**
 * 浏览器冒烟检查：真实 Chromium 跑一遍 列表 → 翻页 → 帖子 → 大屏双栏，
 * 收集 console / 网络错误并截图。
 *
 * 前置：`pnpm dev` 已在运行（Web 5180 / Worker 8787）。
 * 用法：node scripts/smoke-e2e.mjs
 * 环境变量：CHROME_PATH（默认 /usr/bin/chromium）、BASE_URL、SHOT_DIR、THREAD_ID
 */
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'

const baseUrl = process.env.BASE_URL ?? 'http://localhost:5180'
const threadId = process.env.THREAD_ID ?? '1826103'
const executablePath = process.env.CHROME_PATH ?? '/usr/bin/chromium'
const shotDir = path.resolve(process.cwd(), process.env.SHOT_DIR ?? '.pi/tmp')

await mkdir(shotDir, { recursive: true })

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})

const problems = []
const warnings = []
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

try {
  const page = await browser.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text().slice(0, 200)}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  page.on('requestfailed', (request) => {
    const line = `${request.url().slice(0, 120)} ${request.failure()?.errorText ?? ''}`
    // 第三方图床掉线不视为回归，但要可见
    if (request.url().includes('/api/img')) warnings.push(`图片加载失败: ${line}`)
    else problems.push(`requestfailed: ${line}`)
  })

  // —— 小屏：列表 + 无限滚动
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForSelector('main .divide-y > button', { timeout: 40_000 })
  const rows = await page.$$eval('main .divide-y > button', (items) => items.length)
  const tabs = await page.$$eval('main nav button', (items) =>
    items.map((item) => item.textContent?.trim()).filter(Boolean),
  )
  const wordmark = await page.$eval('header', (el) => el.innerText.trim())
  console.log(`[list] rows=${rows} tabs=${tabs.join('/')} header=${wordmark}`)
  await page.screenshot({ path: path.join(shotDir, 'smoke-list-mobile.png') })

  // 滚到底部 → 自动追加下一页（去重后行数必须变多，且标题不重复）
  await page.evaluate(() => {
    const list = document.querySelector('main .overflow-y-auto')
    if (list) list.scrollTop = list.scrollHeight
  })
  await page.waitForFunction(
    (previous) => document.querySelectorAll('main .divide-y > button').length > previous,
    { timeout: 40_000 },
    rows,
  )
  const appended = await page.$$eval('main .divide-y > button', (items) => ({
    rows: items.length,
    unique: new Set(items.map((item) => item.textContent?.trim())).size,
  }))
  console.log(`[list] infinite rows=${appended.rows} unique=${appended.unique}`)
  if (appended.rows !== appended.unique) problems.push('列表追加后出现重复行（tid 去重失效）')

  // —— 小屏：帖子
  await page.goto(`${baseUrl}/t/${threadId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForSelector('article[id^="pid"]', { timeout: 40_000 })
  // 图片是进入视口后才拉取的，外部图床可能较慢
  await sleep(4500)
  const posts = await page.$$eval('article[id^="pid"]', (items) => items.length)
  const threadTitle = await page.$$eval('main h1', (items) => items[0]?.textContent?.trim() ?? '')
  if (!threadTitle) problems.push('详情页正文内没有帖子标题')
  const blobs = await page.$$eval(
    'article img',
    (items) => items.filter((item) => item.getAttribute('src')?.startsWith('blob:')).length,
  )
  const images = await page.$$eval('article img', (items) => items.length)
  const pager = await page.$eval('main', (el) => /\d+ \/ \d+/.exec(el.innerText)?.[0] ?? '(无页码)')
  console.log(`[thread] posts=${posts} images=${blobs}/${images} pager=${pager} title=${threadTitle.slice(0, 16)}…`)
  await page.screenshot({ path: path.join(shotDir, 'smoke-thread-mobile.png') })

  // —— 大屏：双栏居中 + 左栏激活态
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })
  await page.goto(`${baseUrl}/f/4`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForSelector('main .divide-y > button', { timeout: 40_000 })
  await sleep(500)
  const frame = await page.$eval('main > div', (el) => {
    const rect = el.getBoundingClientRect()
    return {
      columns: getComputedStyle(el).gridTemplateColumns,
      left: Math.round(rect.left),
      width: Math.round(rect.width),
    }
  })
  const sidebarRows = await page.$$eval('main .divide-y > button', (items) => items.length)
  await page.screenshot({ path: path.join(shotDir, 'smoke-list-desktop.png') })

  // 点第一条 → 左栏该行应有激活态，正文 ≤ 800px
  await page.click('main .divide-y > button')
  await page.waitForSelector('article[id^="pid"]', { timeout: 40_000 })
  await sleep(800)
  const active = await page.$$eval('main .divide-y > button[aria-current="true"]', (items) =>
    items.map((item) => item.innerText.replace(/\s+/g, ' ').trim()),
  )
  const activeTitle = await page.$eval('main h1', (el) => el.textContent?.trim() ?? '')
  const articleWidth = await page.$eval('article', (el) => Math.round(el.getBoundingClientRect().width))
  console.log(
    `[desktop] grid=${frame.columns} frame=${frame.width}px left=${frame.left}px sidebar=${sidebarRows} active=${active.length} article=${articleWidth}px`,
  )
  await page.screenshot({ path: path.join(shotDir, 'smoke-thread-desktop.png') })

  if (articleWidth > 900) problems.push(`正文宽度 ${articleWidth}px 超过 900px 约束`)
  if (frame.left < 40) problems.push(`宽屏框架没有居中（left=${frame.left}px）`)
  if (frame.width !== 1320) problems.push(`宽屏框架宽度 ${frame.width}px ≠ 1320px`)
  if (active.length !== 1) problems.push(`左栏激活态行数 ${active.length} ≠ 1`)
  if (!active[0]?.includes(activeTitle)) problems.push(`激活行「${active[0]}」与正文标题「${activeTitle}」不一致`)

  for (const warning of warnings) console.log('  ⚠ ' + warning)
  console.log(problems.length === 0 ? '✓ 无 console / 网络错误' : `✗ 问题 ${problems.length} 条：`)
  for (const problem of problems) console.log('  ' + problem)
} finally {
  await browser.close()
}

if (problems.length > 0) process.exitCode = 1
