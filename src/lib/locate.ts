/**
 * 楼层定位：goto=findpost 的上游 3xx 里带着目标页与 #pid。
 * 见 docs/architecture.md §3.4；结果按 (tid,pid) 缓存在会话内。
 */
import { proxyRedirect, upstreamUrl } from './proxy'

export interface LocatedPost {
  page: number
  pid: number
}

const cache = new Map<string, Promise<LocatedPost | null>>()

export function locatePid(tid: number, pid: number): Promise<LocatedPost | null> {
  const key = `${tid}:${pid}`
  const cached = cache.get(key)
  if (cached) return cached

  const pending = resolveLocate(tid, pid).catch((error: unknown) => {
    cache.delete(key)
    throw error
  })
  cache.set(key, pending)
  return pending
}

/** 从上游重定向地址里取 page 与 #pid；解析不了就退回第 1 页 */
export function parseLocatedUrl(target: string, fallbackPid: number): LocatedPost {
  const url = new URL(target)
  const page = Number.parseInt(url.searchParams.get('page') ?? '', 10)
  const pid = Number.parseInt(/#pid(\d+)/.exec(url.hash)?.[1] ?? '', 10)
  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pid: Number.isFinite(pid) && pid > 0 ? pid : fallbackPid,
  }
}

async function resolveLocate(tid: number, pid: number): Promise<LocatedPost | null> {
  const redirect = await proxyRedirect(
    upstreamUrl('forum.php', { mod: 'redirect', goto: 'findpost', ptid: tid, pid, mobile: 2 }),
  )
  if (!redirect) return null
  return parseLocatedUrl(redirect.url, pid)
}
