/**
 * 导航状态：记录每个板块列表的页码与滚动位置，供"总是回到列表"使用。
 * 路由行为见 docs/navigation.md。
 */
export interface ListState {
  fid: number
  page: number
  scrollTop: number
}

const listStates = new Map<number, ListState>()
let fromList = false

export function rememberListState(fid: number, page: number, scrollTop: number): void {
  listStates.set(fid, { fid, page, scrollTop })
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
