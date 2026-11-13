import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { BoardEntry } from '@/lib/boards'
import { useBoards } from './queries'
import { isShortcutBlocked, moveListFocus, nextBoardFid, type BrowseRegion } from './keyboard'

const EMPTY_BOARDS: BoardEntry[] = []

interface BrowseKeyboardValue {
  enabled: boolean
  region: BrowseRegion
  setRegion: (region: BrowseRegion) => void
  focusedTid: number | null
  setFocusedTid: (tid: number | null) => void
  boardCandidate: number | null
  registerRefresh: (refresh: (() => void) | null) => void
}

const BrowseKeyboardContext = createContext<BrowseKeyboardValue>({
  enabled: false,
  region: 'list',
  setRegion: () => undefined,
  focusedTid: null,
  setFocusedTid: () => undefined,
  boardCandidate: null,
  registerRefresh: () => undefined,
})

export function useBrowseKeyboard(): BrowseKeyboardValue {
  return useContext(BrowseKeyboardContext)
}

interface BrowseKeyboardProviderProps {
  /** 仅宽屏启用；其余宽度下所有快捷键静默 */
  enabled: boolean
  /** 当前列表所属板块；浏览历史时为 null */
  activeFid: number | null
  /** 当前打开的帖子；用于初始焦点与清除板块候选 */
  tid: number | null
  children: ReactNode
}

/**
 * 键盘浏览的共享状态：焦点区域、列表行焦点、板块候选。
 * 打开帖子会切到 content，q 回到 list；刷新与板块加载都会清空行焦点。
 */
export function BrowseKeyboardProvider({
  enabled,
  activeFid,
  tid,
  children,
}: BrowseKeyboardProviderProps) {
  const navigate = useNavigate()
  const boards = useBoards()
  const boardList = boards.data ?? EMPTY_BOARDS
  const [region, setRegion] = useState<BrowseRegion>(tid === null ? 'list' : 'content')
  const [focusedTid, setFocusedTid] = useState<number | null>(null)
  const [boardCandidate, setBoardCandidate] = useState<number | null>(null)
  const refreshRef = useRef<(() => void) | null>(null)

  const registerRefresh = useCallback((refresh: (() => void) | null) => {
    refreshRef.current = refresh
  }, [])

  // 路由里的列表或帖子变了：板块候选失效；帖子关闭后焦点回到列表
  useEffect(() => {
    setBoardCandidate(null)
    if (tid === null) setRegion('list')
  }, [activeFid, tid])

  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (isShortcutBlocked(event)) return
      const key = event.key.toLowerCase()

      if (key === 'r') {
        if (event.repeat) return
        event.preventDefault()
        setFocusedTid(null)
        refreshRef.current?.()
        return
      }

      if (key === 'z') {
        if (event.repeat) return
        event.preventDefault()
        setBoardCandidate((current) => nextBoardFid(boardList, activeFid, current))
        return
      }

      if (key === 'x') {
        if (event.repeat || boardCandidate === null) return
        event.preventDefault()
        setBoardCandidate(null)
        if (boardCandidate === activeFid) return
        setFocusedTid(null)
        setRegion('list')
        void navigate({
          to: '/f/$fid',
          params: { fid: String(boardCandidate) },
          replace: true,
        })
        return
      }

      if (key === 'q' && !event.repeat) {
        if (boardCandidate !== null) {
          event.preventDefault()
          setBoardCandidate(null)
          return
        }
        if (region === 'content') {
          event.preventDefault()
          setRegion('list')
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, boardList, activeFid, boardCandidate, region, navigate])

  const value = useMemo(
    () => ({
      enabled,
      region,
      setRegion,
      focusedTid,
      setFocusedTid,
      boardCandidate,
      registerRefresh,
    }),
    [enabled, region, focusedTid, boardCandidate, registerRefresh],
  )

  return (
    <BrowseKeyboardContext.Provider value={value}>{children}</BrowseKeyboardContext.Provider>
  )
}

interface ListKeyboardOptions {
  /** 当前可选的帖子，顺序与列表一致 */
  tids: readonly number[]
  onOpen: (tid: number) => void
  onRefresh: () => void
  scrollRef: RefObject<HTMLElement | null>
}

/**
 * 挂在列表面板上：region 为 list 时响应 w/s/d；
 * 同时把刷新动作登记给全局的 r（正文区也能刷新列表）。
 */
export function useListKeyboard({
  tids,
  onOpen,
  onRefresh,
  scrollRef,
}: ListKeyboardOptions): void {
  const {
    enabled,
    region,
    setRegion,
    focusedTid,
    setFocusedTid,
    boardCandidate,
    registerRefresh,
  } = useBrowseKeyboard()

  useEffect(() => {
    registerRefresh(onRefresh)
    return () => registerRefresh(null)
  }, [registerRefresh, onRefresh])

  const tidsRef = useRef(tids)
  tidsRef.current = tids
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen

  const interactive = enabled && region === 'list' && boardCandidate === null

  useEffect(() => {
    if (!interactive) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (isShortcutBlocked(event)) return
      const key = event.key.toLowerCase()
      if (key !== 'w' && key !== 's' && key !== 'd') return

      if (key === 'd') {
        if (event.repeat || focusedTid === null) return
        event.preventDefault()
        onOpenRef.current(focusedTid)
        setRegion('content')
        return
      }

      event.preventDefault()
      setFocusedTid(moveListFocus(tidsRef.current, focusedTid, key === 'w' ? -1 : 1))
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [interactive, focusedTid, setFocusedTid, setRegion])

  // 焦点行始终留在可视区域（q 回到列表、继续 w/s 都适用）
  useEffect(() => {
    if (!interactive || focusedTid === null) return
    const row = scrollRef.current?.querySelector('[data-kb-focused="true"]')
    if (row instanceof HTMLElement && typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest' })
    }
  }, [interactive, focusedTid, scrollRef])
}
