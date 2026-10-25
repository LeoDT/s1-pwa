import { resolveUrl } from './parser/dom'

export type LinkTarget =
  | { kind: 'thread'; tid: number; page?: number; pid?: number }
  | { kind: 'post'; tid: number; pid: number }
  | { kind: 'forum'; fid: number }
  | { kind: 'external'; href: string }
  | { kind: 'drop' }

/**
 * 把上游链接分类成应用内路由/外链。见 docs/parser.md §7.1。
 * 只识别已验证的几种形态，其余一律按外链处理。
 */
export function classifyLink(raw: string | null | undefined, base: string): LinkTarget {
  const absolute = resolveUrl(raw, base)
  if (!absolute) return { kind: 'drop' }

  const url = new URL(absolute)
  const isUpstream = url.hostname === 'stage1st.com' || url.hostname.endsWith('.stage1st.com')
  if (!isUpstream) return { kind: 'external', href: absolute }

  const params = url.searchParams
  const goto = params.get('goto')
  if (params.get('mod') === 'redirect' && goto === 'findpost') {
    const pid = Number.parseInt(params.get('pid') ?? '', 10)
    const tid = Number.parseInt(params.get('ptid') ?? '', 10)
    if (Number.isFinite(pid) && Number.isFinite(tid)) return { kind: 'post', tid, pid }
  }

  const pathThread = /\/thread-(\d+)-(\d+)-\d+\.html$/.exec(url.pathname)
  if (pathThread?.[1]) {
    return {
      kind: 'thread',
      tid: Number.parseInt(pathThread[1], 10),
      page: Number.parseInt(pathThread[2] ?? '', 10) || 1,
    }
  }

  if (params.get('mod') === 'viewthread') {
    const tid = Number.parseInt(params.get('tid') ?? '', 10)
    if (Number.isFinite(tid)) {
      const page = Number.parseInt(params.get('page') ?? '', 10)
      return { kind: 'thread', tid, page: Number.isFinite(page) ? page : undefined }
    }
  }

  if (params.get('mod') === 'forumdisplay') {
    const fid = Number.parseInt(params.get('fid') ?? '', 10)
    if (Number.isFinite(fid)) return { kind: 'forum', fid }
  }

  return { kind: 'external', href: absolute }
}

/** 站内链接去掉 mobile 等参数，便于展示/分享 */
export function cleanUpstreamUrl(absolute: string): string {
  const url = new URL(absolute)
  for (const key of ['mobile', 'extra', 'page', 'formhash', 'handlekey']) {
    url.searchParams.delete(key)
  }
  return url.toString()
}
