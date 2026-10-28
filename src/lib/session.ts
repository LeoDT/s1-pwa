import type { LoginForm, Session } from '@shared/types'
import { idbDel, idbGet, idbTransact } from './db'
import { parsePage, parseUid, type ParsedPage } from './parser/dom'
import { loginErrorMessage, parseLoginForm } from './parser/login'
import { clearJar } from './cookieJar'
import { debug } from './log'
import { clearProgress } from './progress'
import { invalidateProgressOperations, notifyProgress } from './progressEvents'
import { proxyFetch, UPSTREAM_ROOT, upstreamUrl } from './proxy'
import { captureContentRoute, type ContentRouteContext } from './contentProxy'

const SESSION_KEY = 'session'

export class LoginError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'LoginError'
    this.code = code
  }
}

export interface LoginInput {
  username: string
  password: string
  questionid?: string
  answer?: string
}

export interface LoginPage {
  form: LoginForm
  page: ParsedPage
  route: ContentRouteContext
}

const LOGIN_PAGE_URL = upstreamUrl('member.php', {
  mod: 'logging',
  action: 'login',
  mobile: 2,
})

export async function getSession(): Promise<Session | null> {
  return (await idbGet<Session>('kv', SESSION_KEY)) ?? null
}

export async function saveSession(session: Session): Promise<void> {
  let reset = false
  await idbTransact(['kv', 'progress', 'outbox'], 'readwrite', (tx) => {
    const kv = tx.objectStore('kv')
    const current = kv.get(SESSION_KEY)
    const owner = kv.get('readingOwner')
    let ready = 0
    const commit = () => {
      if (++ready !== 2) return
      const previousUid = (current.result as Session | undefined)?.uid ?? (owner.result as number | undefined)
      if (previousUid !== undefined && previousUid !== session.uid) {
        invalidateProgressOperations()
        tx.objectStore('progress').clear()
        tx.objectStore('outbox').clear()
        reset = true
      }
      kv.put(session, SESSION_KEY)
      kv.put(session.uid, 'readingOwner')
    }
    current.onsuccess = commit
    owner.onsuccess = commit
  })
  if (reset) notifyProgress()
}

export async function clearSession(): Promise<void> {
  invalidateProgressOperations()
  await idbDel('kv', SESSION_KEY)
}

/** 抓取登录页并解析表单（安全提问选项、是否有验证码） */
export async function fetchLoginPage(): Promise<LoginPage> {
  const route = await captureContentRoute()
  const result = await proxyFetch(LOGIN_PAGE_URL, undefined, route)
  const page = parsePage(result.html, result.url)
  const form = parseLoginForm(page)
  if (!form) {
    throw new LoginError(
      'login_form_missing',
      loginErrorMessage(page) ?? '无法读取登录表单，S1 可能返回了异常页面',
    )
  }
  route.allowFallback = false
  return { form, page, route }
}

/**
 * 构造登录 POST 请求。
 *
 * 为什么把 formhash 也塞进查询串：Discuz 的 `_xss_check()` 在「POST 且 query 没有 formhash」
 * 时会把 `REQUEST_URI + php://input` 做两次 urldecode 后扫描 `( ) ' " < >`，
 * 一旦密码/答案里含这些字符（或 `%28` 之类序列）就会 503 拒绝。
 * query 带上正确的 formhash 后该分支直接被跳过（源码：`else { $temp = ''; }`）。
 */
export function buildLoginRequest(
  form: LoginForm,
  input: LoginInput,
): { url: string; body: string } {
  const url = new URL(form.action)
  url.searchParams.set('formhash', form.formhash)

  const body = new URLSearchParams({
    formhash: form.formhash,
    referer: UPSTREAM_ROOT,
    fastloginfield: 'username',
    cookietime: '2592000',
    username: input.username,
    password: input.password,
    questionid: input.questionid ?? '0',
    answer: input.answer ?? '',
  })

  return { url: url.toString(), body: body.toString() }
}

export async function submitLogin(form: LoginForm, input: LoginInput, route?: ContentRouteContext): Promise<Session> {
  if (form.captcha) {
    throw new LoginError(
      'captcha_required',
      '当前需要验证码：请先用浏览器登录一次 stage1st.com，再回来重试',
    )
  }

  const request = buildLoginRequest(form, input)
  debug('login:request', { url: request.url })

  const result = await proxyFetch(request.url, { method: 'POST', body: request.body }, route)
  const uid = parseUid(result.html)
  const landed = parsePage(result.html, result.url)
  const upstreamMessage = loginErrorMessage(landed)

  debug('login:post', {
    status: result.status,
    landed: new URL(result.url).pathname,
    kind: landed.kind,
    uid,
    message: upstreamMessage ?? undefined,
  })

  if (uid === 0) {
    throw new LoginError(
      'login_failed',
      upstreamMessage ?? '登录失败，请检查账号、密码与安全提问',
    )
  }

  const session: Session = { uid }
  await saveSession(session)
  debug('login:ok', { uid })
  return session
}

/**
 * 用一次轻量页面请求判断当前登录态：
 * uid≠0 → 已登录；uid=0 → 未登录（清掉本地会话）；请求失败 → 回退到本地缓存。
 */
export async function detectSession(): Promise<Session | null> {
  try {
    const result = await proxyFetch(upstreamUrl('forum.php', { mobile: 2 }))
    const uid = parseUid(result.html)
    if (uid === 0) {
      await clearSession()
      return null
    }
    const session: Session = { uid }
    await saveSession(session)
    return session
  } catch {
    return getSession()
  }
}

export async function logout(): Promise<void> {
  try {
    const result = await proxyFetch(upstreamUrl('forum.php', { mobile: 2 }))
    const page = parsePage(result.html, result.url)
    const href = page.doc.querySelector('a[href*="action=logout"]')?.getAttribute('href')
    if (href) {
      const target = new URL(href, page.base).toString()
      await proxyFetch(target)
    }
  } catch {
    // 上游登出失败不影响本地清理
  }
  await clearJar()
  await clearSession()
  // 本地历史属于当前账号，退出时一并清掉，避免换账号后串数据
  await clearProgress()
}
