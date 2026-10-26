/**
 * 灯箱状态：应用级单例。
 * 灯箱不属于任何内容节点（正文图常被上游 `<a>` 包着），所以状态放在模块级 store，
 * 由 `ImageLightbox` 在根部渲染唯一一份；`ProxyImage` 只负责 open。
 * 见 docs/design-system.md §5.5。
 */
import { useSyncExternalStore } from 'react'

export interface LightboxImage {
  url: string
  alt: string
}

let current: LightboxImage | null = null
const listeners = new Set<() => void>()

function emit(next: LightboxImage | null): void {
  if (next === current) return
  current = next
  for (const listener of listeners) listener()
}

export function openLightbox(url: string, alt = ''): void {
  emit({ url, alt })
}

export function closeLightbox(): void {
  emit(null)
}

export function getLightboxImage(): LightboxImage | null {
  return current
}

export function subscribeLightbox(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useLightboxImage(): LightboxImage | null {
  return useSyncExternalStore(subscribeLightbox, getLightboxImage)
}
