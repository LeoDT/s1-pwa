import { useQuery } from '@tanstack/react-query'
import type { Session } from '@shared/types'
import { detectSession } from '@/lib/session'

const SESSION_STALE_MS = 5 * 60 * 1000

export function useSession() {
  return useQuery<Session | null>({
    queryKey: ['session'],
    queryFn: detectSession,
    staleTime: SESSION_STALE_MS,
  })
}
