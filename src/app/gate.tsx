import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAppToken } from '@/lib/api'
import { fetchConfig } from '@/lib/config'
import { errorMessage } from '@/lib/errors'
import { TokenForm } from '@/features/auth/TokenForm'
import { useDeferredLoading } from '@/lib/useDeferredLoading'

/**
 * 全局前置检查：拿到部署能力（是否需要令牌）与本机令牌。
 * 未填令牌时只渲染引导页，避免后续请求全部 401。
 */
export function Gate({ children }: { children: ReactNode }) {
  const config = useQuery({ queryKey: ['config'], queryFn: fetchConfig, staleTime: 10 * 60 * 1000 })
  const token = useQuery({ queryKey: ['app-token'], queryFn: getAppToken })
  const showPending = useDeferredLoading(config.isPending || token.isPending)

  if (config.isPending || token.isPending) {
    if (!showPending) return null
    return (
      <div className="mt-10 space-y-2">
        <div className="h-4 w-1/3 animate-pulse rounded bg-panel-light" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-panel-light" />
      </div>
    )
  }

  if (config.isError) {
    return (
      <div className="mt-10 space-y-2 text-center">
        <p className="text-body text-danger">{errorMessage(config.error)}</p>
        <button
          type="button"
          onClick={() => void config.refetch()}
          className="rounded-md border border-line px-3 py-1.5 text-ui text-text"
        >
          重试
        </button>
      </div>
    )
  }

  if (config.data.authRequired && !token.data) return <TokenForm />

  return <>{children}</>
}
