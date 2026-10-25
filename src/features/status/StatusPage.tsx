import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, XCircle } from 'lucide-react'
import type { AppConfig } from '@shared/types'
import { apiFetch } from '@/lib/api'

const TOKEN_SWATCHES = [
  { name: 'canvas', className: 'bg-canvas' },
  { name: 'panel', className: 'bg-panel' },
  { name: 'panel-light', className: 'bg-panel-light' },
  { name: 'line', className: 'bg-line' },
  { name: 'accent', className: 'bg-accent' },
  { name: 'accent-strong', className: 'bg-accent-strong' },
  { name: 'flag', className: 'bg-flag' },
  { name: 'flag-strong', className: 'bg-flag-strong' },
  { name: 'text', className: 'bg-text' },
  { name: 'muted', className: 'bg-muted' },
  { name: 'link', className: 'bg-link' },
  { name: 'danger', className: 'bg-danger' },
]

export function StatusPage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<{ ok: true; version: string }>('/api/health'),
  })

  const config = useQuery({
    queryKey: ['config'],
    queryFn: () => apiFetch<AppConfig>('/api/config'),
  })

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-[17px] font-semibold text-heading">运行诊断</h2>
        <p className="text-[15px] leading-relaxed text-text">
          前端、Worker、代理与浏览链路均可在此自检。
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-[13px] font-medium text-muted">接口</h3>
        <CheckRow label="GET /api/health" state={health} />
        <CheckRow label="GET /api/config" state={config} />
      </section>

      <section className="space-y-2">
        <h3 className="text-[13px] font-medium text-muted">设计令牌</h3>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {TOKEN_SWATCHES.map((swatch) => (
            <div key={swatch.name} className="overflow-hidden rounded-sm border border-line">
              <div className={`h-10 ${swatch.className}`} />
              <div className="bg-panel-light px-1 py-1 text-center text-[10px] text-muted">
                {swatch.name}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-1 rounded-md border border-line bg-panel-light p-3 text-[13px] leading-relaxed text-text">
        <p className="font-medium text-heading">访问令牌</p>
        <p>
          部署时用 <code className="rounded bg-canvas px-1">wrangler secret put ACCESS_TOKEN</code> 设置；
          设置后本页会显示「需要令牌」，M1 会补上填写入口。
        </p>
      </section>
    </div>
  )
}

interface CheckRowProps {
  label: string
  state: { isPending: boolean; isError: boolean; error: Error | null; data?: unknown }
}

function CheckRow({ label, state }: CheckRowProps) {
  const detail = state.isPending
    ? '请求中…'
    : state.isError
      ? (state.error?.message ?? '失败')
      : JSON.stringify(state.data)

  return (
    <div className="flex items-start gap-2 rounded-md border border-line px-3 py-2">
      {state.isError ? (
        <XCircle size={18} className="mt-0.5 shrink-0 text-danger" />
      ) : (
        <CheckCircle2
          size={18}
          className={`mt-0.5 shrink-0 ${state.isPending ? 'text-muted' : 'text-accent-strong'}`}
        />
      )}
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-heading">{label}</p>
        <p className="break-all text-[12.5px] text-muted tnum">{detail}</p>
      </div>
    </div>
  )
}
