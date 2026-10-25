import { useEffect, useRef, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { loadImage } from '@/lib/imageStore'
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

/** 进入视口才加载；图片默认占满容器宽度（见 docs/design-system.md §5.5） */
export function ProxyImage({ src, alt = '', className, inline = false }: ProxyImageProps) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const [state, setState] = useState<State>({ status: 'idle' })

  useEffect(() => {
    setState({ status: 'idle' })
  }, [src])

  useEffect(() => {
    const element = containerRef.current
    if (!element || state.status !== 'idle') return

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
  }, [state.status])

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

  return (
    <span ref={containerRef} className={cn('my-2 block', className)}>
      {state.status === 'ready' ? (
        <img src={state.url} alt={alt} className="block w-full rounded-sm" loading="lazy" />
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

      {state.status === 'loading' || state.status === 'idle' ? (
        <span className="block min-h-[120px] w-full animate-pulse rounded-sm bg-panel-light" />
      ) : null}
    </span>
  )
}
