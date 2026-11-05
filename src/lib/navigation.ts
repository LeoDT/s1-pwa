/**
 * 导航状态：记录每个板块列表的滚动位置，供"总是回到列表"使用。
 * 列表是无限滚动（没有页码），所以只记滚动位置。路由行为见 docs/navigation.md。
 */
export interface ListState {
  fid: number
  scrollTop: number
}

const listStates = new Map<number, ListState>()
let fromList = false

export function rememberListState(fid: number, scrollTop: number): void {
  listStates.set(fid, { fid, scrollTop })
}

export function getListState(fid: number): ListState | undefined {
  return listStates.get(fid)
}

/** 从列表打开详情时标记，用于决定返回时能否直接 pop */
export function markFromList(): void {
  fromList = true
}

export function consumeFromList(): boolean {
  const value = fromList
  fromList = false
  return value
}

interface ThreadFocus {
  tid: number
  page: number
  pid: number
}

let threadFocus: ThreadFocus | null = null

/** 一次性的楼层定位目标；只活在应用内存里，不写 URL。 */
export function setThreadFocus(tid: number, page: number, pid: number): void {
  threadFocus = { tid, page, pid }
}

export function peekThreadFocus(tid: number, page: number): number | null {
  if (!threadFocus || threadFocus.tid !== tid || threadFocus.page !== page) return null
  return threadFocus.pid
}

export function consumeThreadFocus(tid: number, page: number): number | null {
  const pid = peekThreadFocus(tid, page)
  if (pid !== null) threadFocus = null
  return pid
}

export function clearThreadFocus(): void {
  threadFocus = null
}
