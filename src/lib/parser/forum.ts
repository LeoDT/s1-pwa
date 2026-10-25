import type { ForumPage } from '@shared/types'
import { intOf, parsePageInfo, textOf, type ParsedPage } from './dom'
import { FORUM_LIST } from './selectors'

/** 板块帖子列表页（forum.php?mod=forumdisplay） */
export function parseForumPage(page: ParsedPage): ForumPage {
  const { page: currentPage, totalPages } = parsePageInfo(page)
  const fid = Number.parseInt(new URL(page.url).searchParams.get('fid') ?? '', 10)

  const threads = Array.from(page.doc.querySelectorAll(FORUM_LIST.item)).flatMap((item) => {
    const link = item.querySelector(FORUM_LIST.link)
    const tid = extractTid(link?.getAttribute('href') ?? '')
    const title = textOf(item.querySelector(FORUM_LIST.title))
    if (tid === null || title === '') return []

    const typeTag = textOf(item.querySelector(FORUM_LIST.typeTag)).replace(/^#/, '')

    return [
      {
        tid,
        title,
        replies: intOf(item.querySelector(FORUM_LIST.replies)) ?? 0,
        typeTag: typeTag === '' ? undefined : typeTag,
      },
    ]
  })

  return {
    fid: Number.isFinite(fid) ? fid : 0,
    name: textOf(page.doc.querySelector('.header h2')),
    page: currentPage,
    totalPages,
    threads,
  }
}

export function extractTid(href: string): number | null {
  const fromQuery = /[?&]tid=(\d+)/.exec(href)
  if (fromQuery?.[1]) return Number.parseInt(fromQuery[1], 10)
  const fromPath = /thread-(\d+)-\d+-\d+\.html/.exec(href)
  return fromPath?.[1] ? Number.parseInt(fromPath[1], 10) : null
}
