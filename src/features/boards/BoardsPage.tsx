import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus, RotateCcw, X } from 'lucide-react'
import { DEFAULT_BOARDS, saveBoards, type BoardEntry } from '@/lib/boards'
import { fetchForumPage, useBoardTree, useBoards } from '@/features/browse/queries'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'

/** 常用板块管理：勾选/排序/移除（见 docs/overview.md D04） */
export function BoardsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const boards = useBoards()
  const tree = useBoardTree(true)
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
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-medium text-heading">常用板块</h2>
          <button
            type="button"
            onClick={() => void persist([...DEFAULT_BOARDS])}
            disabled={busy}
            className="inline-flex items-center gap-1 text-[13px] text-link disabled:opacity-50"
          >
            <RotateCcw size={13} /> 恢复默认
          </button>
        </div>

        {boards.isPending ? <ListSkeleton rows={3} /> : null}

        {current.length === 0 ? <EmptyState text="还没有板块，从下面的列表里挑几个" /> : null}

        <ul className="divide-y divide-line rounded-md border border-line">
          {current.map((board, index) => (
            <li key={board.fid} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[14px] text-text">{board.name}</span>
              <span className="w-12 shrink-0 text-right text-[11px] text-muted tnum">{board.fid}</span>
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
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-medium text-heading">从 S1 板块树添加</h2>
        {tree.isPending ? <ListSkeleton rows={3} /> : null}
        {tree.isError ? (
          <ErrorState message={errorMessage(tree.error)} onRetry={() => void tree.refetch()} />
        ) : null}

        {tree.data?.map((group) => (
          <div key={group.name} className="space-y-1">
            <h3 className="text-[12.5px] font-medium text-muted">{group.name}</h3>
            <div className="flex flex-wrap gap-2">
              {group.boards.map((board) => {
                const added = currentFids.has(board.fid)
                return (
                  <button
                    key={board.fid}
                    type="button"
                    disabled={added || busy}
                    onClick={() => void persist([...current, { fid: board.fid, name: board.name }])}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[13px]',
                      added
                        ? 'border-line text-muted opacity-60'
                        : 'border-line text-text active:bg-panel-light',
                    )}
                  >
                    {added ? null : <Plus size={13} />}
                    {board.name}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-medium text-heading">手动添加</h2>
        <p className="text-[12.5px] leading-relaxed text-muted">
          手机版板块树只列出 8 个主板块。其它板块（如外野）可以在网页版地址里找到 <code>fid=</code> 后填在这里。
        </p>
        <form
          className="flex gap-2"
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
          <input
            inputMode="numeric"
            value={manualFid}
            onChange={(event) => setManualFid(event.target.value.replace(/[^\d]/g, ''))}
            placeholder="板块 fid"
            className="w-28 rounded-md border border-line bg-canvas px-3 py-2 text-[14px] tnum"
          />
          <button
            type="submit"
            disabled={addingManual || manualFid === ''}
            className="rounded-md bg-accent-strong px-3 py-2 text-[14px] font-medium text-on-accent disabled:opacity-50"
          >
            {addingManual ? '校验中…' : '添加'}
          </button>
        </form>
        {manualError ? <p className="text-[13px] text-danger">{manualError}</p> : null}
      </section>

      <button
        type="button"
        onClick={() => void navigate({ to: '/' })}
        className="text-[13px] text-link underline decoration-line underline-offset-2"
      >
        返回首页
      </button>
    </div>
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
      className="inline-flex size-8 items-center justify-center rounded-md text-muted active:bg-panel-light disabled:opacity-30"
    >
      {children}
    </button>
  )
}
