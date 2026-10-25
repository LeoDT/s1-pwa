import type { Post } from '@shared/types'
import { Content } from '@/components/Content'
import { QuoteBlock } from '@/components/QuoteBlock'
import { UPSTREAM_ROOT } from '@/lib/proxy'
import { cn } from '@/lib/utils'

interface PostCardProps {
  post: Post
  highlighted: boolean
  onOpenPost: (tid: number, pid: number) => void
  onOpenAttachment: (url: string, name: string) => void
  tid: number
}

/** 帖子卡片：正文 + 引用 + 附件（见 docs/design-system.md §5.3） */
export function PostCard({ post, highlighted, onOpenPost, onOpenAttachment, tid }: PostCardProps) {
  const jump = (targetTid: number, pid: number) =>
    onOpenPost(targetTid === 0 ? tid : targetTid, pid)

  return (
    <article
      id={`pid${post.pid}`}
      className={cn(
        'scroll-mt-14 border-b border-line px-4 py-3 transition-shadow duration-300',
        highlighted && 'shadow-[inset_0_0_0_2px_var(--color-flag)]',
      )}
    >
      <header className="mb-1.5 flex items-baseline gap-2 text-[12.5px] text-muted">
        <span className="shrink-0 tnum">
          {post.floor === 1 ? '楼主' : post.floor !== null ? `${post.floor}#` : '—'}
        </span>
        <span className="min-w-0 truncate text-[14px] font-medium text-text">
          {post.authorName || '匿名'}
        </span>
        <span className="ml-auto shrink-0 tnum">{post.postedAt}</span>
      </header>

      {post.editedNote ? <p className="mb-1 text-[12px] text-muted">{post.editedNote}</p> : null}

      {post.hidden ? (
        <p className="text-[15px] text-muted">该楼层内容不可见</p>
      ) : (
        <div className="break-words text-[1rem] leading-[1.75] text-text">
          {post.blocks.map((block, index) =>
            block.kind === 'quote' ? (
              <QuoteBlock key={index} quote={block} base={UPSTREAM_ROOT} onOpenPost={jump} />
            ) : (
              <Content key={index} html={block.html} base={UPSTREAM_ROOT} onOpenPost={jump} />
            ),
          )}
        </div>
      )}

      {post.attachments.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {post.attachments.map((attachment) => (
            <li key={attachment.url}>
              <button
                type="button"
                onClick={() => onOpenAttachment(attachment.url, attachment.name)}
                className="text-[13px] text-link underline decoration-line underline-offset-2"
              >
                附件：{attachment.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}
