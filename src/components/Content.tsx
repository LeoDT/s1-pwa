import DOMPurify from 'dompurify'
import { createElement, Fragment, useMemo, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ProxyImage } from './ProxyImage'
import { classifyLink, type LinkTarget } from '@/lib/links'

const ALLOWED_TAGS = [
  'a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'br', 'p', 'div', 'span', 'font',
  'blockquote', 'ol', 'ul', 'li', 'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'hr', 'img', 'sub', 'sup',
]

const ALLOWED_ATTR = [
  'href', 'src', 'data-src', 'alt', 'title', 'color', 'size', 'face', 'colspan', 'rowspan', 'smilieid',
]

const VOID_TAGS = new Set(['area', 'base', 'col', 'embed', 'link', 'meta', 'source', 'track', 'wbr'])

/** Discuz <font size="1..7"> 映射（rem：12/14/16/18/24/32/48），上限 48px 防刷屏 */
const FONT_SIZE: Record<string, string> = {
  '1': '0.75rem',
  '2': '0.875rem',
  '3': '1rem',
  '4': '1.125rem',
  '5': '1.5rem',
  '6': '2rem',
  '7': '3rem',
}

interface ContentProps {
  html: string
  base: string
  onOpenPost: (tid: number, pid: number) => void
}

/**
 * 帖子正文渲染：DOMPurify 清洗后做 DOM → React 映射。
 * 不用 dangerouslySetInnerHTML，图片必须走 ProxyImage。见 docs/parser.md §7.3。
 */
export function Content({ html, base, onOpenPost }: ContentProps) {
  const fragment = useMemo(
    () => DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true, ALLOWED_TAGS, ALLOWED_ATTR }),
    [html],
  )

  return <>{Array.from(fragment.childNodes).map((node, index) => renderNode(node, index, base, onOpenPost))}</>
}

function renderNode(
  node: Node,
  key: number,
  base: string,
  onOpenPost: (tid: number, pid: number) => void,
  textLink?: (children: ReactNode) => ReactNode,
): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return <Fragment key={key}>{textLink ? textLink(node.textContent) : node.textContent}</Fragment>
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null

  const element = node as Element
  const tag = element.tagName.toLowerCase()

  if (tag === 'img') {
    // 只认 data-src，避免清洗阶段提前加载图片。
    const src = element.getAttribute('data-src')
    if (!src) return null
    return (
      <ProxyImage
        key={key}
        src={src}
        alt={element.getAttribute('alt') ?? ''}
        inline={element.hasAttribute('smilieid')}
      />
    )
  }

  if (tag === 'a') {
    return <ContentLink key={key} element={element} base={base} onOpenPost={onOpenPost} />
  }

  // 空元素不能有 children，React 会直接抛错
  if (tag === 'br') return <br key={key} />
  if (tag === 'hr') return <hr key={key} className="my-3 border-0 border-t border-line" />
  if (VOID_TAGS.has(tag)) return createElement(tag, { key })

  const children = Array.from(element.childNodes).map((child, index) =>
    renderNode(child, index, base, onOpenPost, textLink),
  )

  if (tag === 'font') {
    return (
      <span key={key} style={fontStyle(element)}>
        {children}
      </span>
    )
  }

  if (tag === 'table') {
    return (
      <span key={key} className="my-2 block max-w-full overflow-x-auto">
        <table className="border-collapse text-body">{children}</table>
      </span>
    )
  }

  if (tag === 'td' || tag === 'th') {
    return createElement(
      tag,
      { key, colSpan: Number(element.getAttribute('colspan') ?? '') || undefined, className: 'border border-line px-2 py-1' },
      children,
    )
  }

  if (tag === 'blockquote') {
    return (
      <blockquote key={key} className="my-2 border-l-2 border-line pl-3 text-body text-muted">
        {children}
      </blockquote>
    )
  }

  if (tag === 'pre' || tag === 'code') {
    return createElement(tag, { key, className: 'rounded-sm bg-panel-light px-1 py-0.5 text-ui' }, children)
  }

  return createElement(tag, { key }, children)
}

function fontStyle(element: Element): React.CSSProperties | undefined {
  const style: React.CSSProperties = {}
  const size = FONT_SIZE[element.getAttribute('size') ?? '']
  if (size) style.fontSize = size
  const color = element.getAttribute('color')
  if (color) style.color = color
  const face = element.getAttribute('face')
  if (face) style.fontFamily = face
  return Object.keys(style).length > 0 ? style : undefined
}

interface ContentLinkProps {
  element: Element
  base: string
  onOpenPost: (tid: number, pid: number) => void
}

function ContentLink({ element, base, onOpenPost }: ContentLinkProps) {
  const navigate = useNavigate()
  const href = element.getAttribute('href')
  const target = classifyLink(href, base)
  const imageFreeChildren = !containsInteractiveImage(element)
  const linkText = imageFreeChildren
    ? undefined
    : (content: ReactNode) => renderLink(target, href, content, onOpenPost, navigate)
  const children = Array.from(element.childNodes).map((child, index) =>
    renderNode(child, index, base, onOpenPost, linkText),
  )

  if (target.kind === 'drop') return <span>{children}</span>
  if (!imageFreeChildren) return <>{children}</>

  return renderLink(target, href, children, onOpenPost, navigate)
}

function containsInteractiveImage(element: Element): boolean {
  return Array.from(element.querySelectorAll('img')).some((image) => !image.hasAttribute('smilieid'))
}

function renderLink(
  target: LinkTarget,
  href: string | null,
  children: ReactNode,
  onOpenPost: (tid: number, pid: number) => void,
  navigate: ReturnType<typeof useNavigate>,
): ReactNode {
  if (target.kind === 'external') {
    return <a href={target.href} target="_blank" rel="noopener noreferrer" className="text-link underline decoration-line underline-offset-2 hover:text-link-hover">{children}</a>
  }
  if (target.kind === 'post') {
    return <button type="button" onClick={() => onOpenPost(target.tid, target.pid)} className="text-left text-link underline decoration-line underline-offset-2 hover:text-link-hover">{children}</button>
  }
  if (target.kind === 'thread' || target.kind === 'forum') {
    return (
      <a
        href={href ?? undefined}
        onClick={(event) => {
          event.preventDefault()
          if (target.kind === 'thread') void navigate({ to: '/t/$tid', params: { tid: String(target.tid) } })
          else void navigate({ to: '/f/$fid', params: { fid: String(target.fid) } })
        }}
        className="text-link underline decoration-line underline-offset-2 hover:text-link-hover"
      >{children}</a>
    )
  }
  return <span>{children}</span>
}
