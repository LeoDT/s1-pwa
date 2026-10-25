import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ChevronDown, Plus, RotateCcw, X } from 'lucide-react'
import { DEFAULT_BOARDS, saveBoards, type BoardEntry } from '@/lib/boards'
import { fetchForumPage, useBoardTree, useBoards } from '@/features/browse/queries'
import { ErrorState, ListSkeleton } from '@/components/states'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'

/**
 * 常用板块管理：勾选/排序/移除（见 docs/overview.md D04）。
 * 直接嵌在设置抽屉里，不再是独立页面（docs/navigation.md §6）。
 */
export function BoardsPanel({ active }: { active: boolean }) {
  const queryClient = useQueryClient()
  const boards = useBoards()
  const [adding, setAdding] = useState(false)
  const tree = useBoardTree(active && adding)
  const [busy, setBusy] = useState(false)
  const [manualFid, setManualFid] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)
  const [addingManual, setAddingManual] = useState(false)

  const persist = async (next: BoardEntry[]) => {
    setBusy(true)
    try {
      await saveBoards(next)
      await queryClient.invalidateQueries({ queryKey: ['boards'] })
    } finally {
      setBusy(false)
    }
  }

  const current = boards.data ?? []
  const currentFids = new Set(current.map((board) => board.fid))

  const move = (index: number, delta: number) => {
    const next = [...current]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    const [item] = next.splice(index, 1)
    if (!item) return
    next.splice(target, 0, item)
    void persist(next)
  }

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-ui font-medium text-muted">常用板块</h3>
        <button
          type="button"
          onClick={() => void persist([...DEFAULT_BOARDS])}
          disabled={busy}
          className="inline-flex items-center gap-1 text-meta text-link disabled:opacity-50"
        >
          <RotateCcw size={12} /> 恢复默认
        </button>
      </div>

      {boards.isPending ? <ListSkeleton rows={3} /> : null}

      {!boards.isPending && current.length === 0 ? (
        <p className="text-meta text-muted">还没有板块，从下面「添加板块」里挑几个。</p>
      ) : null}

      {current.length > 0 ? (
        <ul className="divide-y divide-line rounded-md border border-line">
          {current.map((board, index) => (
            <li key={board.fid} className="flex items-center gap-1 pl-3">
              <span className="min-w-0 flex-1 truncate text-ui text-text">{board.name}</span>
              <span className="w-10 shrink-0 text-right text-meta text-muted tnum">
                {board.fid}
              </span>
              <IconAction label="上移" disabled={busy || index === 0} onClick={() => move(index, -1)}>
                <ArrowUp size={16} />
              </IconAction>
              <IconAction
                label="下移"
                disabled={busy || index === current.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={16} />
              </IconAction>
              <IconAction
                label="移除"
                disabled={busy}
                onClick={() => void persist(current.filter((item) => item.fid !== board.fid))}
              >
                <X size={16} />
              </IconAction>
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={() => setAdding((value) => !value)}
        aria-expanded={adding}
        className="inline-flex items-center gap-1 rounded-md border border-line px-3 py-2 text-ui text-text transition-colors duration-[var(--motion-press)] hover:bg-panel-light active:bg-panel-light"
      >
        <Plus size={14} />
        添加板块
        <ChevronDown size={14} className={cn('text-muted transition-transform', adding && 'rotate-180')} />
      </button>

      {adding ? (
        <div className="space-y-3 pt-1">
          {tree.isPending ? <ListSkeleton rows={2} /> : null}
          {tree.isError ? (
            <ErrorState message={errorMessage(tree.error)} onRetry={() => void tree.refetch()} />
          ) : null}
          {tree.data?.map((group) => (
            <div key={group.name} className="space-y-1">
              <h4 className="text-meta font-medium text-muted">{group.name}</h4>
              <div className="flex flex-wrap gap-1.5">
                {group.boards.map((board) => {
                  const added = currentFids.has(board.fid)
                  return (
                    <button
                      key={board.fid}
                      type="button"
                      disabled={added || busy}
                      onClick={() => void persist([...current, { fid: board.fid, name: board.name }])}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-ui',
                        added ? 'text-muted opacity-60' : 'text-text transition-colors duration-[var(--motion-press)] hover:bg-panel-light active:bg-panel-light',
                      )}
                    >
                      {added ? null : <Plus size={12} />}
                      {board.name}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          <form
            className="space-y-1.5"
            onSubmit={(event) => {
              event.preventDefault()
              const fid = Number.parseInt(manualFid, 10)
              if (!Number.isFinite(fid) || fid <= 0) {
                setManualError('请输入数字 fid')
                return
              }
              if (currentFids.has(fid)) {
                setManualError('这个板块已经在列表里了')
                return
              }
              setAddingManual(true)
              setManualError(null)
              void fetchForumPage(fid, 1)
                .then((forum) => persist([...current, { fid, name: forum.name || `板块 ${fid}` }]))
                .then(() => setManualFid(''))
                .catch((error: unknown) => setManualError(errorMessage(error)))
                .finally(() => setAddingManual(false))
            }}
          >
            <p className="text-meta leading-relaxed text-muted">
              手机版板块树只列出 8 个主板块。其它板块（如外野）可以在网页版地址里找到{' '}
              <code>fid=</code> 后填在这里。
            </p>
            <div className="flex gap-2">
              <input
                inputMode="numeric"
                value={manualFid}
                onChange={(event) => setManualFid(event.target.value.replace(/[^\d]/g, ''))}
                placeholder="板块 fid"
                aria-label="板块 fid"
                className="w-28 rounded-md border border-line bg-canvas px-3 py-2 text-ui tnum"
              />
              <button
                type="submit"
                disabled={addingManual || manualFid === ''}
                className="rounded-md bg-accent-strong px-3 py-2 text-ui font-medium text-on-accent disabled:opacity-50"
              >
                {addingManual ? '校验中…' : '添加'}
              </button>
            </div>
            {manualError ? <p className="text-meta text-danger">{manualError}</p> : null}
          </form>
        </div>
      ) : null}
    </section>
  )
}

function IconAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-9 items-center justify-center rounded-md text-muted transition-colors duration-[var(--motion-press)] hover:bg-panel-light active:bg-panel-light disabled:opacity-30"
    >
      {children}
    </button>
  )
}
