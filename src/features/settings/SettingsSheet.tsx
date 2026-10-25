import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ChevronRight, ListOrdered, LogOut, ShieldCheck, Trash2 } from 'lucide-react'
import { getAppToken, setAppToken } from '@/lib/api'
import { fetchConfig } from '@/lib/config'
import { errorMessage } from '@/lib/errors'
import { getSession, logout } from '@/lib/session'

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
      className="m-0 mt-auto w-full max-w-none bg-transparent p-0 backdrop:bg-black/45 sm:m-auto sm:max-w-md"
    >
      <div className="max-h-[80dvh] overflow-y-auto rounded-t-lg bg-canvas pb-[env(safe-area-inset-bottom)] sm:rounded-lg">
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-panel px-4 py-3">
          <h2 className="text-[16px] font-semibold text-heading">设置</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-[14px] text-text active:bg-panel-light"
          >
            关闭
          </button>
        </div>
        <div className="space-y-6 px-4 py-4">
          <BoardsSection onNavigate={onClose} />
          <AccessTokenSection />
          <AccountSection />
          <AboutSection />
        </div>
      </div>
    </dialog>
  )
}

function BoardsSection({ onNavigate }: { onNavigate: () => void }) {
  const navigate = useNavigate()

  return (
    <section className="space-y-2">
      <h3 className="text-[13px] font-medium text-muted">浏览</h3>
      <button
        type="button"
        onClick={() => {
          onNavigate()
          void navigate({ to: '/boards' })
        }}
        className="flex w-full items-center gap-2 rounded-md border border-line px-3 py-2 text-[14px] text-text active:bg-panel-light"
      >
        <ListOrdered size={16} className="text-muted" />
        <span className="flex-1 text-left">常用板块管理</span>
        <ChevronRight size={16} className="text-muted" />
      </button>
    </section>
  )
}

function AccessTokenSection() {
  const queryClient = useQueryClient()
  const token = useQuery({ queryKey: ['app-token'], queryFn: getAppToken })
  const [draft, setDraft] = useState('')
  const [saved, setSaved] = useState(false)

  const mutation = useMutation({
    mutationFn: async (value: string) => {
      await setAppToken(value === '' ? null : value)
      await queryClient.invalidateQueries()
    },
    onSuccess: () => {
      setSaved(true)
      setDraft('')
    },
  })

  return (
    <section className="space-y-2">
      <h3 className="text-[13px] font-medium text-muted">访问令牌</h3>
      <p className="text-[12.5px] leading-relaxed text-muted">
        当前：{token.data ? '已保存' : '未保存'}
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            setSaved(false)
          }}
          placeholder="粘贴新的访问令牌"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-md border border-line bg-canvas px-3 py-2 text-[15px]"
        />
        <button
          type="button"
          onClick={() => mutation.mutate(draft.trim())}
          disabled={mutation.isPending || draft.trim() === ''}
          className="rounded-md bg-accent-strong px-3 py-2 text-[14px] font-medium text-on-accent disabled:opacity-50"
        >
          保存
        </button>
      </div>
      {saved ? <p className="text-[12.5px] text-accent-strong">已更新</p> : null}
      {mutation.isError ? (
        <p className="text-[12.5px] text-danger">{errorMessage(mutation.error)}</p>
      ) : null}
    </section>
  )
}

function AccountSection() {
  const queryClient = useQueryClient()
  const session = useQuery({ queryKey: ['local-session'], queryFn: getSession })

  const mutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await queryClient.invalidateQueries()
    },
  })

  return (
    <section className="space-y-2">
      <h3 className="text-[13px] font-medium text-muted">账号</h3>
      <div className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-[14px]">
        <ShieldCheck size={18} className="text-accent-strong" />
        <span className="text-text">
          {session.data ? `已登录（uid ${session.data.uid}）` : '未登录'}
        </span>
      </div>
      {session.data ? (
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-[14px] text-danger active:bg-panel-light"
        >
          <LogOut size={16} />
          退出登录
        </button>
      ) : null}
      {mutation.isError ? (
        <p className="text-[12.5px] text-danger">{errorMessage(mutation.error)}</p>
      ) : null}
    </section>
  )
}

function AboutSection() {
  const config = useQuery({ queryKey: ['config'], queryFn: fetchConfig })
  const [cleared, setCleared] = useState(false)

  return (
    <section className="space-y-2">
      <h3 className="text-[13px] font-medium text-muted">关于</h3>
      <p className="text-[12.5px] text-muted">版本 {config.data?.version ?? '—'}</p>
      <button
        type="button"
        onClick={async () => {
          await caches.delete('s1-img-v1')
          setCleared(true)
        }}
        className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-[14px] text-text active:bg-panel-light"
      >
        <Trash2 size={16} />
        {cleared ? '图片缓存已清空' : '清空图片缓存'}
      </button>
    </section>
  )
}
