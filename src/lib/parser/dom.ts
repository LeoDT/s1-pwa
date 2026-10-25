/**
 * 解析通用工具：只在浏览器执行（DOMParser 依赖 DOM）。
 * 不做日期解析、不猜楼号、不拼 URL —— 相对地址一律基于 <base href> 或实际请求地址。
 */
import { COMMON, DISCUZ_UID_RE, PAGE_CLASS } from './selectors'

export type PageKind = keyof typeof PAGE_CLASS | 'message' | 'unknown'

export interface ParsedPage {
  doc: Document
  /** 用于解析相对地址的基址 */
  base: string
  kind: PageKind
  /** 实际请求到的地址 */
  url: string
  html: string
}

export function parsePage(html: string, requestUrl: string): ParsedPage {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const baseHref = doc.querySelector(COMMON.base)?.getAttribute('href')
  const base = resolveUrl(baseHref, requestUrl) ?? requestUrl

  const bodyClass = doc.body?.className ?? ''
  const detected = (Object.keys(PAGE_CLASS) as Array<keyof typeof PAGE_CLASS>).find((key) =>
    bodyClass.split(/\s+/).includes(PAGE_CLASS[key]),
  )

  // Discuz 的消息页（无权限/板块不存在/登录失败）沿用原脚本的 body class，
  // 必须先识别成 'message'，否则会被当成正常页面解析出「提示信息」这种垃圾数据
  const isMessagePage = doc.querySelector('.jump_c, #messagetext, .alert_error') !== null
  const kind: PageKind = isMessagePage ? 'message' : (detected ?? 'unknown')

  return { doc, base, kind, url: requestUrl, html }
}

export function resolveUrl(raw: string | null | undefined, base: string): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed.startsWith('javascript:') || trimmed.startsWith('#')) return null
  try {
    const url = new URL(trimmed, base)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

export function textOf(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function intOf(element: Element | null | undefined): number | null {
  const digits = textOf(element).replace(/[^\d]/g, '')
  return digits === '' ? null : Number.parseInt(digits, 10)
}

/** 从页面内联脚本里取登录 uid，0 表示游客 */
export function parseUid(html: string): number {
  const match = DISCUZ_UID_RE.exec(html)
  return match?.[1] ? Number.parseInt(match[1], 10) : 0
}

/** 页面上用于提交表单的 formhash（登录、登出等都需要） */
export function parseFormhash(doc: Document): string | null {
  const value = doc.querySelector('input[name="formhash"]')?.getAttribute('value')
  if (value) return value

  const logoutHref = doc.querySelector(COMMON.logoutLink)?.getAttribute('href')
  const match = logoutHref ? /formhash=([0-9a-zA-Z]+)/.exec(logoutHref) : null
  return match?.[1] ?? null
}

/** 上游错误提示原文（Discuz 用 .alert_error / #messagetext） */
export function errorText(page: ParsedPage): string | null {
  const element = page.doc.querySelector(COMMON.alertError)
  const text = textOf(element)
  return text === '' ? null : text
}

export interface PageInfo {
  page: number
  totalPages: number
}

export function parsePageInfo(page: ParsedPage, fallbackPage = 1): PageInfo {
  const currentText = textOf(page.doc.querySelector(COMMON.pagerCurrent))
  const customValue = page.doc
    .querySelector(COMMON.pagerCustomPage)
    ?.getAttribute('value')

  const current = Number.parseInt(currentText, 10)
  const custom = Number.parseInt(customValue ?? '', 10)
  const fromUrl = Number.parseInt(new URL(page.url).searchParams.get('page') ?? '', 10)

  const resolvedPage = Number.isFinite(current)
    ? current
    : Number.isFinite(custom)
      ? custom
      : Number.isFinite(fromUrl)
        ? fromUrl
        : fallbackPage

  const totalText = textOf(page.doc.querySelector(COMMON.pagerTotal))
  const total = Number.parseInt(totalText.replace(/[^\d]/g, ''), 10)

  return {
    page: resolvedPage,
    totalPages: Number.isFinite(total) && total > 0 ? total : 1,
  }
}
