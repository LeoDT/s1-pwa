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

  // —— 小屏：列表 + 翻页
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2', timeout: 30_000 })
  await page.waitForSelector('main .divide-y > button', { timeout: 40_000 })
  const rows = await page.$$eval('main .divide-y > button', (items) => items.length)
  const tabs = await page.$$eval('main nav button', (items) =>
    items.map((item) => item.textContent?.trim()).filter(Boolean),
  )
  console.log(`[list] rows=${rows} tabs=${tabs.join('/')}`)
  await page.screenshot({ path: path.join(shotDir, 'smoke-list-mobile.png') })

  const beforePage = new URL(page.url()).pathname
  await page.click('button[aria-label="下一页"]')
  await page.waitForFunction(
    (previous) => location.pathname !== previous && document.querySelector('main .divide-y > button'),
    { timeout: 40_000 },
    beforePage,
  )
  console.log(`[list] pager ${beforePage} -> ${new URL(page.url()).pathname}`)

  // —— 小屏：帖子
  await page.goto(`${baseUrl}/t/${threadId}`, { waitUntil: 'networkidle2', timeout: 30_000 })
  await page.waitForSelector('article[id^="pid"]', { timeout: 40_000 })
  // 图片是进入视口后才拉取的，外部图床可能较慢
  await sleep(4500)
  const posts = await page.$$eval('article[id^="pid"]', (items) => items.length)
  const blobs = await page.$$eval(
    'article img',
    (items) => items.filter((item) => item.getAttribute('src')?.startsWith('blob:')).length,
  )
  const images = await page.$$eval('article img', (items) => items.length)
  const pager = await page.$eval('main', (el) => /\d+ \/ \d+/.exec(el.innerText)?.[0] ?? '(无页码)')
  console.log(`[thread] posts=${posts} images=${blobs}/${images} pager=${pager}`)
  await page.screenshot({ path: path.join(shotDir, 'smoke-thread-mobile.png') })

  // —— 大屏：双栏
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 })
  await page.goto(`${baseUrl}/t/${threadId}`, { waitUntil: 'networkidle2', timeout: 30_000 })
  await page.waitForSelector('article[id^="pid"]', { timeout: 40_000 })
  await sleep(1000)
  const columns = await page.$eval('main > div', (el) => getComputedStyle(el).gridTemplateColumns)
  const articleWidth = await page.$eval('article', (el) => Math.round(el.getBoundingClientRect().width))
  const sidebarRows = await page.$$eval('main .divide-y > button', (items) => items.length)
  console.log(`[desktop] grid=${columns} sidebar=${sidebarRows} article=${articleWidth}px`)
  await page.screenshot({ path: path.join(shotDir, 'smoke-thread-desktop.png') })

  if (articleWidth > 800) problems.push(`正文宽度 ${articleWidth}px 超过 800px 约束`)

  for (const warning of warnings) console.log('  ⚠ ' + warning)
  console.log(problems.length === 0 ? '✓ 无 console / 网络错误' : `✗ 问题 ${problems.length} 条：`)
  for (const problem of problems) console.log('  ' + problem)
} finally {
  await browser.close()
}

if (problems.length > 0) process.exitCode = 1
