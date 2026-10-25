import { useQuery } from '@tanstack/react-query'
import type { BoardGroup, ForumPage, ThreadPage } from '@shared/types'
import { parsePage, type ParsedPage } from '@/lib/parser/dom'
import { assertKind } from '@/lib/parser/errors'
import { parseBoardGroups } from '@/lib/parser/board'
import { parseForumPage } from '@/lib/parser/forum'
import { parseThreadPage } from '@/lib/parser/thread'
import { loadBoards, type BoardEntry } from '@/lib/boards'
import { proxyFetch, upstreamUrl } from '@/lib/proxy'

async function request(url: string): Promise<ParsedPage> {
  const result = await proxyFetch(url)
  return parsePage(result.html, result.url)
}

export async function fetchForumPage(fid: number, page: number): Promise<ForumPage> {
  const parsed = await request(
    upstreamUrl('forum.php', {
      mod: 'forumdisplay',
      fid,
      page: page > 1 ? page : undefined,
      mobile: 2,
    }),
  )
  assertKind(parsed, 'forumdisplay')
  return parseForumPage(parsed)
}

export async function fetchThreadPage(tid: number, page: number): Promise<ThreadPage> {
  const parsed = await request(
    upstreamUrl('forum.php', {
      mod: 'viewthread',
      tid,
      page: page > 1 ? page : undefined,
      mobile: 2,
    }),
  )
  assertKind(parsed, 'viewthread')
  return parseThreadPage(parsed)
}

export async function fetchBoardTree(): Promise<BoardGroup[]> {
  const parsed = await request(upstreamUrl('forum.php', { mobile: 2 }))
  assertKind(parsed, 'index')
  return parseBoardGroups(parsed)
}

export function useBoards() {
  return useQuery<BoardEntry[]>({ queryKey: ['boards'], queryFn: loadBoards, staleTime: 5 * 60 * 1000 })
}

export function useForumPage(fid: number, page: number) {
  return useQuery<ForumPage>({
    queryKey: ['forum', fid, page],
    queryFn: () => fetchForumPage(fid, page),
    staleTime: 30 * 1000,
    // 没有刷新按钮，靠回到前台/窗口聚焦时自动重取
    refetchOnWindowFocus: true,
  })
}

export function useThreadPage(tid: number, page: number) {
  return useQuery<ThreadPage>({
    queryKey: ['thread', tid, page],
    queryFn: () => fetchThreadPage(tid, page),
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
