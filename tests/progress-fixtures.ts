import type { ProgressRow, ReadingPosition, ReplyObservation } from '@shared/types'

export const metadata = { tid: 50, fid: 6, forumName: 'board', title: 'thread' }

export function progressRow(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return {
    tid: 50, fid: 6, forumName: 'board', title: 'thread', metadataVersion: null, openedAt: 0,
    read: null, position: null, ...overrides,
  }
}

export function observation(at: number, id: string, replies: number): ReplyObservation {
  return { at, id, replies }
}

export function position(at: number, id: string, pid: number, floor: number | null = pid, page = 1, totalPages = 3): ReadingPosition {
  return { at, id, pid, floor, page, totalPages }
}
