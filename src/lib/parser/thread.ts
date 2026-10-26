import type { Attachment, Post, PostBlock, QuoteBlock, ThreadPage } from '@shared/types'
import { countOf, intOf, parsePageInfo, resolveUrl, textOf, type ParsedPage } from './dom'
import { extractTid } from './forum'
import { THREAD } from './selectors'

/** 帖子页（forum.php?mod=viewthread） */
export function parseThreadPage(page: ParsedPage): ThreadPage {
  const doc = page.doc
  const tid = extractTid(page.url) ?? 0
  const fid = Number.parseInt(
    /[?&]fid=(\d+)/.exec(doc.querySelector(THREAD.fidLink)?.getAttribute('href') ?? '')?.[1] ??
      '',
    10,
  )

  const postElements = Array.from(doc.querySelectorAll(THREAD.post))
  const posts = postElements.map((element) => parsePost(element, page.base))

  return {
    tid,
    fid: Number.isFinite(fid) ? fid : 0,
    title: textOf(doc.querySelector('.header h2')),
    replies: readReplies(postElements[0] ?? null, doc),
    opUid: posts[0]?.authorUid ?? null,
    page: parsePageInfo(page).page,
    totalPages: parsePageInfo(page).totalPages,
    posts,
  }
}

function readReplies(firstPost: Element | null, doc: Document): number | null {
  // The reply icon is the most reliable marker on the first page.
  const count = countOf(firstPost?.querySelector(THREAD.replyCount))
  if (count !== null) return count

  // The reliable later-page total is the direct .mtit control under .txtlist, not quoted/body text.
  const totalControl = Array.from(doc.querySelectorAll(THREAD.repliesTotal)).find((control) =>
    Array.from(control.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && /全部回复/.test(node.textContent ?? '')),
  )
  const total = Array.from(totalControl?.children ?? []).find((child) => child.tagName === 'EM')
  return countOf(total)
}

function parsePost(element: Element, base: string): Post {
  const pid = Number.parseInt((element.id ?? '').replace(/\D/g, ''), 10)
  const floorText = textOf(element.querySelector(THREAD.floor))
  const floor = floorText === '' ? null : floorText.includes('楼主') ? 1 : (intOf(element.querySelector(THREAD.floor)) ?? null)

  const authorLink = element.querySelector(THREAD.authorLink)
  const authorName = textOf(authorLink)
  const authorUid = Number.parseInt(
    /\buid=(\d+)/.exec(authorLink?.getAttribute('href') ?? '')?.[1] ?? '',
    10,
  )

  const timeElement = element.querySelector(THREAD.time)
  const postedAt = timeOnly(timeElement)

  const message = element.querySelector(THREAD.message)
  if (!message) {
    return {
      pid,
      floor,
      authorName,
      authorUid: Number.isFinite(authorUid) ? authorUid : null,
      postedAt,
      hidden: true,
      blocks: [],
      images: [],
      attachments: [],
    }
  }

  const editNote = textOf(message.querySelector(THREAD.editNote))
  const body = message.cloneNode(true) as Element
  body.querySelectorAll(THREAD.editNote).forEach((node) => node.remove())

  const images = normalizeImages(body, base)
  const attachments = collectAttachments(body, base)
  const hidden = isBlockedPost(body)
  const blocks = hidden ? [] : splitBlocks(body)

  return {
    pid,
    floor,
    authorName,
    authorUid: Number.isFinite(authorUid) ? authorUid : null,
    postedAt,
    editedNote: editNote.startsWith('本帖最后由') ? editNote : undefined,
    hidden,
    blocks,
    images,
    attachments,
  }
}

/**
 * 被屏蔽帖的结构是「.message 里只有一个不含 blockquote 的 div.quote」，
 * 而正常引用一定是 div.quote > blockquote —— 用它区分，避免把「引用被屏蔽帖」误判。
 */
function isBlockedPost(body: Element): boolean {
  if (!/作者被禁止或删除|内容自动屏蔽/.test(textOf(body))) return false
  const quoteDivs = Array.from(body.children).filter((child) => child.matches('div.quote'))
  return quoteDivs.length === 1 && !quoteDivs[0]?.querySelector('blockquote')
}

/** 首楼的 .mtime 里含阅读/回复数，需要先剔除再取时间 */
function timeOnly(timeElement: Element | null): string {
  if (!timeElement) return ''
  const clone = timeElement.cloneNode(true) as Element
  clone.querySelectorAll('span.y, script').forEach((node) => node.remove())
  return textOf(clone)
}

/** 图片统一取原图地址（zoomfile/file 优先），并绝对化 */
function normalizeImages(body: Element, base: string): string[] {
  const urls: string[] = []

  for (const image of Array.from(body.querySelectorAll('img'))) {
    const raw =
      image.getAttribute('zoomfile') ?? image.getAttribute('file') ?? image.getAttribute('src')
    const absolute = resolveUrl(raw, base)
    if (!absolute) {
      image.remove()
      continue
    }
    // 不写 src：DOMPurify 内部用 innerHTML 解析，带 src 会让浏览器直连原图
    // （绕过代理、撞防盗链、浪费流量）。渲染器只读 data-src 并交给 ProxyImage。
    image.setAttribute('data-src', absolute)
    image.removeAttribute('src')
    for (const attribute of ['zoomfile', 'file', 'onclick', 'onload']) {
      image.removeAttribute(attribute)
    }
    urls.push(absolute)
  }

  return urls
}

function collectAttachments(body: Element, base: string): Attachment[] {
  return Array.from(body.querySelectorAll(THREAD.attachment)).flatMap((link) => {
    const url = resolveUrl(link.getAttribute('href'), base)
    if (!url) return []
    return [{ url, name: textOf(link).replace(/^附件:\s*/, '') || '附件' }]
  })
}

/** 把 .message 拆成「引用块」与「普通 HTML 块」的序列 */
function splitBlocks(body: Element): PostBlock[] {
  trimEdges(body)
  const blocks: PostBlock[] = []
  let buffer: Node[] = []

  const flush = () => {
    if (buffer.length === 0) return
    const container = document.createElement('div')
    for (const node of buffer) container.append(node.cloneNode(true))
    trimEdges(container)
    const html = container.innerHTML
    if (container.textContent?.trim() || container.querySelector('img, video, iframe, svg, table, hr, pre, code, input')) {
      blocks.push({ kind: 'html', html })
    }
    buffer = []
  }

  for (const node of Array.from(body.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).matches(THREAD.quote)) {
      flush()
      blocks.push(parseQuote(node as Element))
    } else {
      buffer.push(node)
    }
  }
  flush()

  return blocks
}

function parseQuote(element: Element): QuoteBlock {
  const link = element.querySelector(THREAD.quoteLink)
  const href = link?.getAttribute('href') ?? ''
  const pid = Number.parseInt(/\bpid=(\d+)/.exec(href)?.[1] ?? '', 10)
  const tid = Number.parseInt(/\bptid=(\d+)/.exec(href)?.[1] ?? '', 10)
  const header = textOf(link)

  const quote = (element.querySelector('blockquote') ?? element).cloneNode(true) as Element
  for (const anchor of Array.from(quote.querySelectorAll(THREAD.quoteLink))) {
    const wrapper = anchor.closest('font')
    if (wrapper) wrapper.remove()
    else anchor.remove()
  }

  trimEdges(quote)

  return {
    kind: 'quote',
    pid: Number.isFinite(pid) ? pid : undefined,
    tid: Number.isFinite(tid) ? tid : undefined,
    header: header === '' ? undefined : header,
    html: quote.innerHTML,
  }
}

/** Follow each outer boundary without trimming the opposite side of nested wrappers. */
function trimEdges(element: Element): void {
  const protectedTags = /^(PRE|CODE|HR)$/
  const isWhitespace = (node: Node) => node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()
  const isBreak = (node: Node) => node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'BR'

  const trimDirection = (parent: Element, leading: boolean): void => {
    while (true) {
      const node = leading ? parent.firstChild : parent.lastChild
      if (!node) return
      if (isWhitespace(node) || isBreak(node)) {
        node.remove()
        continue
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return
      const child = node as Element
      if (protectedTags.test(child.tagName)) return
      trimDirection(child, leading)
      if (child.hasChildNodes() || /^(IMG|INPUT|VIDEO|SVG|TABLE)$/.test(child.tagName)) return
      child.remove()
    }
  }

  // Each pass follows only that side's boundary; interior breaks in a wrapper survive.
  trimDirection(element, true)
  trimDirection(element, false)
}

export type { Post, ThreadPage }
export { resolveUrl as resolveContentUrl }
