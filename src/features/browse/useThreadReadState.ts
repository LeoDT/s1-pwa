import { useEffect, useRef } from 'react'
import { useSession } from '@/features/auth/useSession'
import { recordThreadOpened, recordThreadReplies } from '@/lib/progress'
import type { ObservedThreadPage } from './queries'

/** Tracks opening separately from content observations and position. */
export function useThreadReadState(
  tid: number,
  data: ObservedThreadPage | undefined,
  forumName?: string,
): void {
  const uid = useSession().data?.uid
  const lifecycle = useRef({ tid, uid, generation: 0 })
  if (lifecycle.current.tid !== tid || lifecycle.current.uid !== uid) {
    lifecycle.current = { tid, uid, generation: lifecycle.current.generation + 1 }
  }
  const replyObservation = useRef<{ key: string; saved: boolean; pending: boolean } | null>(null)

  useEffect(() => {
    if (uid == null) return
    void recordThreadOpened({ tid }, undefined, uid).catch(() => undefined)
  }, [tid, uid])

  useEffect(() => {
    const visitGeneration = lifecycle.current.generation
    return () => {
      if (lifecycle.current.generation === visitGeneration) lifecycle.current.generation += 1
    }
  }, [tid, uid])

  // Runs after every render: an IDB failure remains retryable without an unbounded seen-set or timer.
  useEffect(() => {
    if (uid == null || !data || data.tid !== tid) return
    const visitGeneration = lifecycle.current.generation
    const observation = data.observation
    const key = `${visitGeneration}:${uid}:${tid}:${observation.at}:${observation.id}`
    if (replyObservation.current?.key !== key) replyObservation.current = { key, saved: false, pending: false }
    const current = replyObservation.current
    if (current.saved || current.pending) return

    current.pending = true
    void recordThreadReplies(
      { tid, fid: data.fid, forumName, title: data.title },
      { ...observation, replies: data.replies },
      uid,
    ).then((row) => {
      if (lifecycle.current.generation === visitGeneration && lifecycle.current.uid === uid &&
        replyObservation.current === current) {
        current.saved = row !== undefined
      }
    }).catch(() => undefined).finally(() => { current.pending = false })
  })
}
