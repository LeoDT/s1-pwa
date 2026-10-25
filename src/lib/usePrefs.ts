import { useSyncExternalStore } from 'react'
import { getPrefs, subscribePrefs, type Prefs } from './prefs'

/** 偏好是全局单例：设置页修改后，阅读区/图片立即跟着变 */
export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribePrefs, getPrefs)
}
