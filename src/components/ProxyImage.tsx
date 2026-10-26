import { useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, ImageOff } from 'lucide-react'
import { openLightbox } from '@/lib/lightbox'
import { isS1Image, loadImage } from '@/lib/imageStore'
import { usePrefs } from '@/lib/usePrefs'
import { cn } from '@/lib/utils'

type Status = 'idle' | 'loading' | 'ready' | 'error'
type State = { src: string; status: Status; url?: string }

interface ProxyImageProps {
  src: string
  alt?: string
  className?: string
  /** 表情等行内小图 */
  inline?: boolean
}

/** 进入视口才加载；省流量模式下先占位，点击才加载（docs/design-system.md §5.5） */
export function ProxyImage({ src, alt = '', className, inline = false }: ProxyImageProps) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const { dataSaver } = usePrefs()
  const [state, setState] = useState<State>({ src, status: 'idle' })
  // 在 render 阶段同步重置，避免 A→B→A 时复活 A 的旧状态。
  if (state.src !== src) setState({ src, status: 'idle' })
  const current: State = state.src === src ? state : { src, status: 'idle' }
  const trusted = isS1Image(src)

  useEffect(() => {
    const element = containerRef.current
    if (!element || current.status !== 'idle') return
    // 省流量模式只作用于正文大图；表情行内图照常加载
    if (dataSaver && !inline) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState({ src, status: 'loading' })
          observer.disconnect()
        }
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [src, current.status, dataSaver, inline])

  useEffect(() => {
    if (!trusted || current.status !== 'loading') return
    let alive = true
    loadImage(src).then(
      (url) => {
        if (alive) setState({ src, status: 'ready', url })
      },
      () => {
        if (alive) setState({ src, status: 'error' })
      },
    )
    return () => {
      alive = false
    }
  }, [src, trusted, current.status])

  const openViewer = (event: React.SyntheticEvent) => {
    if (current.status !== 'ready') return
    // 正文图片可能被上游 <a> 包着，阻止冒泡避免同时打开链接
    event.preventDefault()
    event.stopPropagation()
    openLightbox(trusted ? current.url! : src, alt)
  }

  const reveal = (event: React.SyntheticEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setState({ src, status: 'loading' })
  }

  const image = (current.status === 'loading' || current.status === 'ready') &&
    (!trusted || current.status === 'ready') ? (
      <img
        src={trusted ? current.url : src}
        alt={alt}
        className={inline ? 'inline size-6 align-middle' : 'block w-full rounded-sm'}
        loading="lazy"
        onLoad={!trusted ? () => setState({ src, status: 'ready' }) : undefined}
        onError={!trusted ? () => setState({ src, status: 'error' }) : undefined}
      />
    ) : null

  if (inline) {
    return (
      <span ref={containerRef} className="inline-block align-middle">
        {image ?? <span className="inline-block size-6 align-middle" />}
      </span>
    )
  }

  return (
    <span ref={containerRef} className={cn('my-2 block', className)}>
      {current.status === 'ready' || (!trusted && current.status === 'loading') ? (
        <span
          role={current.status === 'ready' ? 'button' : undefined}
          tabIndex={current.status === 'ready' ? 0 : undefined}
          aria-label={current.status === 'ready' ? '查看大图' : undefined}
          onClick={current.status === 'ready' ? openViewer : undefined}
          onKeyDown={current.status === 'ready' ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') openViewer(event)
          } : undefined}
          className={current.status === 'ready' ? 'block w-full cursor-zoom-in' : 'block'}
        >
          {image}
        </span>
      ) : null}

      {current.status === 'error' ? (
        <span className="relative flex min-h-[120px] w-full items-center justify-center rounded-sm border border-line bg-panel-light">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setState({ src, status: 'loading' })
            }}
            className="inline-flex items-center gap-2 text-ui text-muted"
          >
            <ImageOff size={16} />
            图片加载失败 · 点击重试
          </button>
          <a
            href={src}
            target="_blank"
            rel="noreferrer noopener"
            className="absolute right-2 bottom-1.5 text-meta text-link underline decoration-line underline-offset-2 hover:text-link-hover"
          >
            打开原图
          </a>
        </span>
      ) : null}

      {current.status === 'idle' && dataSaver ? (
        <span
          role="button"
          tabIndex={0}
          onClick={reveal}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') reveal(event)
          }}
          className="flex min-h-[64px] w-full cursor-pointer items-center justify-center gap-2 rounded-sm bg-panel-light text-ui text-muted transition-colors duration-[var(--motion-press)] hover:text-text active:bg-line/40"
        >
          <ImageIcon size={16} />
          图片 · 点击加载
        </span>
      ) : null}

      {current.status === 'loading' || (current.status === 'idle' && !dataSaver) ? (
        <span className="block min-h-[120px] w-full animate-pulse rounded-sm bg-panel-light" />
      ) : null}
    </span>
  )
}
