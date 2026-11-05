import { type RefObject } from 'react'
import { EDGE_PULL_THRESHOLD, useEdgePull } from './useEdgePull'

export const PULL_THRESHOLD = EDGE_PULL_THRESHOLD

interface PullState {
  pull: number
  refreshing: boolean
}

/** 列表页下拉刷新（仅触摸设备生效） */
export function usePullToRefresh(
  ref: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<unknown>,
  enabled = true,
): PullState {
  const state = useEdgePull(ref, { edge: 'top', onTrigger: onRefresh, enabled })
  return { pull: state.pull, refreshing: state.refreshing }
}
