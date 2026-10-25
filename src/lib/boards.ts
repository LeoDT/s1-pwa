import { idbGet, idbSet } from './db'

export interface BoardEntry {
  fid: number
  name: string
}

const BOARDS_KEY = 'list'

/** 首启预置（与参考截图一致的五个主板块），可在「板块管理」里改 */
export const DEFAULT_BOARDS: BoardEntry[] = [
  { fid: 4, name: '游戏论坛' },
  { fid: 6, name: '动漫论坛' },
  { fid: 48, name: '影视论坛' },
  { fid: 51, name: 'ＰＣ数码' },
  { fid: 157, name: '归墟' },
]

export async function loadBoards(): Promise<BoardEntry[]> {
  const stored = await idbGet<BoardEntry[]>('boards', BOARDS_KEY)
  if (stored && stored.length > 0) return stored
  await idbSet('boards', BOARDS_KEY, DEFAULT_BOARDS)
  return [...DEFAULT_BOARDS]
}

export async function saveBoards(boards: BoardEntry[]): Promise<BoardEntry[]> {
  await idbSet('boards', BOARDS_KEY, boards)
  return boards
}
