export interface Prefs {
  /** 正文字号（px）：15 | 16 | 17 | 18 */
  fontSize: number
  /** 省流量模式：图片先占位，点击才加载 */
  dataSaver: boolean
  /** 边缘滑动返回（iOS 独立模式实测后再决定默认值） */
  edgeSwipe: boolean
  /** 大屏左栏是否展开 */
  leftPane: boolean
}

export const DEFAULT_PREFS: Prefs = {
  fontSize: 17,
  dataSaver: false,
  edgeSwipe: false,
  leftPane: true,
}

const STORAGE_KEY = 's1r:prefs'

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const parsed = JSON.parse(raw) as Partial<Prefs>
    return { ...DEFAULT_PREFS, ...parsed }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function savePrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...loadPrefs(), ...patch }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  applyPrefs(next)
  return next
}

export function applyPrefs(prefs: Prefs): void {
  document.documentElement.style.setProperty('--post-font-size', `${prefs.fontSize}px`)
}
