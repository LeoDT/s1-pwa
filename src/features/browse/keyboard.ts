/**
 * 键盘浏览的纯逻辑与共享文案。
 * 见 docs/navigation.md §7；只在宽屏（≥1024）启用。
 */
export type BrowseRegion = 'list' | 'content'

export const KEYBOARD_HINT = 'w/s 选择 · d 打开 · r 刷新 · z/x 切换板块'

export const SHORTCUT_GROUPS = [
  {
    title: '帖子列表',
    items: [
      { keys: 'w / s', label: '上下选择帖子' },
      { keys: 'd', label: '打开帖子' },
    ],
  },
  {
    title: '帖子内容',
    items: [
      { keys: 'w / s', label: '上下滚动' },
      { keys: 'a / d', label: '上一页 / 下一页' },
      { keys: 'q', label: '回到列表' },
    ],
  },
  {
    title: '通用',
    items: [
      { keys: 'r', label: '刷新列表' },
      { keys: 'z', label: '切换板块' },
      { keys: 'x', label: '打开选中的板块' },
      { keys: 'q', label: '取消板块切换' },
    ],
  },
] as const

/** 输入框、下拉框、可编辑区域内不响应快捷键 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target instanceof HTMLElement && target.isContentEditable) return true
  return target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null
}

/** 组合键、输入法、弹层打开时让出按键 */
export function isShortcutBlocked(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing) return true
  if (event.ctrlKey || event.metaKey || event.altKey) return true
  if (isEditableTarget(event.target)) return true
  return document.querySelector('dialog[open]') !== null
}

/** 列表行焦点移动：无焦点时从第一行开始，边界不循环 */
export function moveListFocus(
  tids: readonly number[],
  focusedTid: number | null,
  delta: -1 | 1,
): number | null {
  if (tids.length === 0) return null
  const index = focusedTid === null ? -1 : tids.indexOf(focusedTid)
  if (index < 0) return tids[0] ?? null
  return tids[Math.min(tids.length - 1, Math.max(0, index + delta))] ?? null
}

/** 板块切换候选：当前板块的下一个，循环 */
export function nextBoardFid(
  boards: readonly { fid: number }[],
  activeFid: number | null,
  candidateFid: number | null,
): number | null {
  if (boards.length === 0) return null
  const from = candidateFid ?? activeFid
  if (from === null) return boards[0]?.fid ?? null
  const index = boards.findIndex((board) => board.fid === from)
  if (index < 0) return boards[0]?.fid ?? null
  return boards[(index + 1) % boards.length]?.fid ?? null
}

/** 正文 w/s 的滚动距离：约 60% 视口高度 */
export function scrollStep(viewportHeight: number): number {
  return Math.round(viewportHeight * 0.6)
}
