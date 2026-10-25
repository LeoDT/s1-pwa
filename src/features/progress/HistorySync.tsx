import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from '@/features/auth/useSession'
import { flushProgress } from '@/lib/outbox'
import { syncHistoryMirror } from '@/lib/progress'

/**
 * 挂在 Gate 内（拿到访问令牌之后）：启动与恢复联网时重放写队列，
 * 并把最近阅读同步进本地镜像，保证换设备后也能续读。
 */
export function HistorySync() {
  const queryClient = useQueryClient()
  const session = useSession()
  const signedIn = Boolean(session.data)

  useEffect(() => {
    if (!signedIn) return

    let active = true

    const sync = async () => {
      try {
        await flushProgress()
      } catch {
        // 未登录/离线：继续尝试同步镜像
      }
      try {
        await syncHistoryMirror()
      } catch {
        // 未登录/离线：本地镜像照常可用
      }
      if (active) void queryClient.invalidateQueries({ queryKey: ['progress-index'] })
    }

    void sync()
    const onOnline = () => void sync()
    window.addEventListener('online', onOnline)

    return () => {
      active = false
      window.removeEventListener('online', onOnline)
    }
  }, [queryClient, signedIn])

  return null
}
