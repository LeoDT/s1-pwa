import { useEffect } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import type { BoardGroup, ForumPage, ProgressIndexRow, ProgressVersion, ThreadPage } from '@shared/types'
import { parsePage, type ParsedPage } from '@/lib/parser/dom'
import { assertKind } from '@/lib/parser/errors'
import { parseBoardGroups } from '@/lib/parser/board'
import { parseForumPage } from '@/lib/parser/forum'
import { parseThreadPage } from '@/lib/parser/thread'
import { loadBoards, type BoardEntry } from '@/lib/boards'
import { useSession } from '@/features/auth/useSession'
import { createProgressVersion, loadProgressIndex, subscribeProgress } from '@/lib/progress'
import { proxyFetch, upstreamUrl } from '@/lib/proxy'

async function request(url: string): Promise<ParsedPage> {
  const result = await proxyFetch(url)
  return parsePage(result.html, result.url)
}

export type ObservedForumPage = ForumPage & { observation: ProgressVersion }
export type ObservedThreadPage = ThreadPage & { observation: ProgressVersion }

export async function fetchForumPage(fid: number, page: number): Promise<ObservedForumPage> {
  const observation = createProgressVersion()
  const parsed = await request(
    upstreamUrl('forum.php', {
      mod: 'forumdisplay',
      fid,
      page: page > 1 ? page : undefined,
      mobile: 2,
    }),
  )
  assertKind(parsed, 'forumdisplay')
  return { ...parseForumPage(parsed), observation }
}

export async function fetchThreadPage(tid: number, page: number): Promise<ObservedThreadPage> {
  const observation = createProgressVersion()
  const parsed = await request(
    upstreamUrl('forum.php', {
      mod: 'viewthread',
      tid,
      page: page > 1 ? page : undefined,
      mobile: 2,
    }),
  )
  assertKind(parsed, 'viewthread')
  return { ...parseThreadPage(parsed), observation }
}

export async function fetchBoardTree(): Promise<BoardGroup[]> {
  const parsed = await request(upstreamUrl('forum.php', { mobile: 2 }))
  assertKind(parsed, 'index')
  return parseBoardGroups(parsed)
}

export function useBoards() {
  return useQuery<BoardEntry[]>({ queryKey: ['boards'], queryFn: loadBoards, staleTime: 5 * 60 * 1000 })
}

/** 列表页：首屏 + 滚动到底追加下一页（无限滚动，见 docs/navigation.md §4） */
export function useForumPages(fid: number) {
  return useInfiniteQuery({
    queryKey: ['forum', fid],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchForumPage(fid, pageParam),
    getNextPageParam: (last: ForumPage) => (last.page < last.totalPages ? last.page + 1 : undefined),
    // Board lists are session-cached; users refresh explicitly.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  })
}

export function useThreadPage(tid: number, page: number) {
  return useQuery<ObservedThreadPage>({
    queryKey: ['thread', tid, page],
    queryFn: () => fetchThreadPage(tid, page),
    staleTime: 60 * 1000,
  })
}

/** Lightweight list index is local-only; no server request is needed for list markers. */
export function useProgressIndex() {
  const session = useSession()
  const accountId = session.data?.uid

  const client = useQueryClient()
  useEffect(() => subscribeProgress(() => {
    void client.invalidateQueries({ queryKey: ['progress-index'] })
  }), [client])

  return useQuery<ProgressIndexRow[]>({
    queryKey: ['progress-index', accountId ?? 'guest'],
    queryFn: () => loadProgressIndex(),
    enabled: session.isSuccess,
    staleTime: 60 * 1000,
  })
}

export function useBoardTree(enabled: boolean) {
  return useQuery<BoardGroup[]>({
    queryKey: ['board-tree'],
    queryFn: fetchBoardTree,
    staleTime: 10 * 60 * 1000,
    enabled,
  })
}
