import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LogOut, ShieldCheck, Trash2 } from 'lucide-react'
import { BoardsPanel } from '@/features/boards/BoardsPanel'
import { getAppToken, setAppToken } from '@/lib/api'
import { fetchConfig } from '@/lib/config'
import { errorMessage } from '@/lib/errors'
import { clearImageCache, imageCacheStats } from '@/lib/imageStore'
import { getSession, logout } from '@/lib/session'
import { savePrefs } from '@/lib/prefs'
import { usePrefs } from '@/lib/usePrefs'
import { cn } from '@/lib/utils'

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // 焦点落在弹层本身（tabIndex=-1），避免打开瞬间给「关闭」按钮画焦点环
      dialog.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      onClose={onClose}
      onCancel={onClose}
      className="m-0 mt-auto w-full max-w-none bg-transparent p-0 backdrop:bg-black/45 focus:outline-none sm:m-auto sm:max-w-md"
    >
      <div className="flex max-h-[80dvh] flex-col overflow-hidden rounded-t-lg bg-canvas sm:rounded-lg">
        <div className="flex shrink-0 items-center justify-between border-b border-line bg-panel px-4 py-3">
          <h2 className="text-title font-semibold text-heading">设置</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-ui text-text transition-colors duration-[var(--motion-press)] hover:bg-panel-light active:bg-panel-light"
          >
            关闭
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <BoardsPanel active={open} />
          <ReadingSection />
          <AccessTokenSection />
          <AccountSection />
          <StorageSection active={open} />
          <AboutSection />
        </div>
      </div>
    </dialog>
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
      <h3 className="text-ui font-medium text-muted">访问令牌</h3>
      <p className="text-meta leading-relaxed text-muted">
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
          className="min-w-0 flex-1 rounded-md border border-line bg-canvas px-3 py-2 text-body"
        />
        <button
          type="button"
          onClick={() => mutation.mutate(draft.trim())}
          disabled={mutation.isPending || draft.trim() === ''}
          className="rounded-md bg-accent-strong px-3 py-2 text-ui font-medium text-on-accent disabled:opacity-50"
        >
          保存
        </button>
      </div>
      {saved ? <p className="text-meta text-accent-strong">已更新</p> : null}
      {mutation.isError ? (
        <p className="text-meta text-danger">{errorMessage(mutation.error)}</p>
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
      <h3 className="text-ui font-medium text-muted">账号</h3>
      <div className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-ui">
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
          className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-ui text-danger transition-colors duration-[var(--motion-press)] hover:bg-panel-light active:bg-panel-light"
        >
          <LogOut size={16} />
          退出登录
        </button>
      ) : null}
      {mutation.isError ? (
        <p className="text-meta text-danger">{errorMessage(mutation.error)}</p>
      ) : null}
    </section>
  )
}

function AboutSection() {
  const config = useQuery({ queryKey: ['config'], queryFn: fetchConfig })

  return (
    <section className="space-y-2">
      <h3 className="text-ui font-medium text-muted">关于</h3>
      <p className="text-meta text-muted">版本 {config.data?.version ?? '—'}</p>
    </section>
  )
}

const FONT_SIZES = [15, 16, 17, 18]

function ReadingSection() {
  const prefs = usePrefs()

  return (
    <section className="space-y-3">
      <h3 className="text-ui font-medium text-muted">阅读</h3>

      <div className="flex items-center gap-2">
        <span className="text-ui text-text">正文字号</span>
        <div className="ml-auto flex gap-1">
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => savePrefs({ fontSize: size })}
              className={cn(
                'inline-flex size-9 items-center justify-center rounded-md border text-ui transition-colors duration-[var(--motion-press)]',
                prefs.fontSize === size
                  ? 'border-accent-strong font-medium text-accent-strong'
                  : 'border-line text-text hover:bg-panel-light active:bg-panel-light',
              )}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center justify-between gap-3 text-ui text-text">
        <span>
          省流量模式
          <span className="mt-0.5 block text-meta text-muted">正文图片点击后才加载</span>
        </span>
        <input
          type="checkbox"
          checked={prefs.dataSaver}
          onChange={(event) => savePrefs({ dataSaver: event.target.checked })}
          className="size-5 shrink-0 accent-[var(--color-accent-strong)]"
        />
      </label>
    </section>
  )
}

function StorageSection({ active }: { active: boolean }) {
  const [stats, setStats] = useState<{ bytes: number; count: number } | null>(null)
  const [usage, setUsage] = useState<number | null>(null)
  const [cleared, setCleared] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!active) return
    let alive = true

    const refresh = async () => {
      const [nextStats, estimate] = await Promise.all([
        imageCacheStats().catch(() => null),
        navigator.storage?.estimate
          ? navigator.storage.estimate().catch(() => null)
          : Promise.resolve(null),
      ])
      if (!alive) return
      setStats(nextStats)
      setUsage(estimate?.usage ?? null)
    }

    void refresh()
    return () => {
      alive = false
    }
  }, [active])

  const clear = async () => {
    setBusy(true)
    try {
      await clearImageCache()
      setCleared(true)
      setStats({ bytes: 0, count: 0 })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-2">
      <h3 className="text-ui font-medium text-muted">图片缓存</h3>
      <p className="text-meta text-muted">
        {stats ? `本站 ${formatBytes(stats.bytes)} · ${stats.count} 张` : '本站 —'}
        {usage !== null ? ` · 浏览器总占用 ${formatBytes(usage)}` : ''}
      </p>
      <p className="text-meta leading-relaxed text-muted">
        超过 7 天未访问的图片会自动清理，总占用上限 500MB。
      </p>
      <button
        type="button"
        onClick={() => void clear()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-ui text-text transition-colors duration-[var(--motion-press)] hover:bg-panel-light active:bg-panel-light disabled:opacity-50"
      >
        <Trash2 size={16} />
        {cleared ? '图片缓存已清空' : '清空图片缓存'}
      </button>
    </section>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
