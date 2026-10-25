/**
 * S1 凭证的浏览器端存放点（IndexedDB `jar`）。服务端只在请求期间过境，不落盘。
 * 见 docs/architecture.md §2。cookie 只会在 worker 向 stage1st.com 及其子域发请求时转发。
 */
import { idbDel, idbGet, idbSet } from './db'

export interface StoredCookie {
  name: string
  value: string
  /** epoch ms；undefined 表示会话 cookie */
  expires?: number
}

interface JarState {
  cookies: StoredCookie[]
}

const JAR_KEY = 'main'

function isAlive(cookie: StoredCookie, now: number): boolean {
  return cookie.expires === undefined || cookie.expires > now
}

export async function loadJar(): Promise<StoredCookie[]> {
  const state = await idbGet<JarState>('jar', JAR_KEY)
  const now = Date.now()
  return (state?.cookies ?? []).filter((cookie) => isAlive(cookie, now))
}

export async function mergeJar(incoming: StoredCookie[]): Promise<void> {
  if (incoming.length === 0) return
  const now = Date.now()
  const merged = new Map((await loadJar()).map((cookie) => [cookie.name, cookie]))

  for (const cookie of incoming) {
    if (isAlive(cookie, now)) merged.set(cookie.name, cookie)
    else merged.delete(cookie.name)
  }

  await idbSet<JarState>('jar', JAR_KEY, { cookies: [...merged.values()] })
}

export async function cookieHeader(): Promise<string | undefined> {
  const cookies = await loadJar()
  if (cookies.length === 0) return undefined
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
}

export async function clearJar(): Promise<void> {
  await idbDel('jar', JAR_KEY)
}
