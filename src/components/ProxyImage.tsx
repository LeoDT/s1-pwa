import { useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, ImageOff } from 'lucide-react'
import { ImageLightbox } from './ImageLightbox'
import { loadImage } from '@/lib/imageStore'
import { usePrefs } from '@/lib/usePrefs'
import { cn } from '@/lib/utils'

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error' }

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
  const [state, setState] = useState<State>({ status: 'idle' })
  const [lightboxOpen, setLightboxOpen] = useState(false)

  useEffect(() => {
    setState({ status: 'idle' })
    setLightboxOpen(false)
  }, [src])

  useEffect(() => {
    const element = containerRef.current
    if (!element || state.status !== 'idle') return
    // 省流量模式只作用于正文大图；表情行内图照常加载
    if (dataSaver && !inline) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState({ status: 'loading' })
          observer.disconnect()
        }
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [state.status, dataSaver, inline])

  useEffect(() => {
    if (state.status !== 'loading') return
    let alive = true
    loadImage(src).then(
      (url) => {
        if (alive) setState({ status: 'ready', url })
      },
      () => {
        if (alive) setState({ status: 'error' })
      },
    )
    return () => {
      alive = false
    }
  }, [state.status, src])

  if (inline) {
    return (
      <span ref={containerRef} className="inline-block align-middle">
        {state.status === 'ready' ? (
          <img src={state.url} alt={alt} className="inline size-6 align-middle" />
        ) : (
          <span className="inline-block size-6 align-middle" />
        )}
      </span>
    )
  }

  const openLightbox = (event: React.SyntheticEvent) => {
    // 正文图片可能被上游 <a> 包着，阻止冒泡避免同时打开链接
    event.preventDefault()
    event.stopPropagation()
    setLightboxOpen(true)
  }

  const reveal = (event: React.SyntheticEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setState({ status: 'loading' })
  }

  return (
    <span ref={containerRef} className={cn('my-2 block', className)}>
      {state.status === 'ready' ? (
        <span
          role="button"
          tabIndex={0}
          aria-label="查看大图"
          onClick={openLightbox}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') openLightbox(event)
          }}
          className="block w-full cursor-zoom-in"
        >
          <img src={state.url} alt={alt} className="block w-full rounded-sm" loading="lazy" />
        </span>
      ) : null}

      {state.status === 'error' ? (
        <span className="relative flex min-h-[120px] w-full items-center justify-center rounded-sm border border-line bg-panel-light">
          <button
            type="button"
            onClick={() => setState({ status: 'loading' })}
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

      {state.status === 'idle' && dataSaver ? (
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

      {(state.status === 'loading' || (state.status === 'idle' && !dataSaver)) && (
        <span className="block min-h-[120px] w-full animate-pulse rounded-sm bg-panel-light" />
      )}

      {state.status === 'ready' ? (
        <ImageLightbox
          url={state.url}
          alt={alt}
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
        />
      ) : null}
    </span>
  )
}
