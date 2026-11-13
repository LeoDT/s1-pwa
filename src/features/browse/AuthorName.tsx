import { useState } from 'react'
import { AuthorDialog } from './AuthorDialog'

interface AuthorNameProps {
  name: string
  uid: number | null
}

/** 作者名：有 uid 时可点，按需读取发帖数与鹅。 */
export function AuthorName({ name, uid }: AuthorNameProps) {
  const [open, setOpen] = useState(false)
  const label = name || '匿名'

  if (!uid) {
    return <span className="min-w-0 truncate text-meta font-medium text-text">{label}</span>
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="查看作者信息"
        aria-label={`查看 ${label} 的作者信息`}
        className="min-w-0 truncate text-meta font-medium text-text underline decoration-line decoration-dotted underline-offset-4 transition-colors duration-[var(--motion-press)] hover:text-link-hover hover:decoration-solid hover:decoration-current"
      >
        {label}
      </button>
      {open ? <AuthorDialog uid={uid} fallbackName={label} onClose={() => setOpen(false)} /> : null}
    </>
  )
}
