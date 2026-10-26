import type { ProgressIndexRow, ProgressRow, ProgressVersion } from './types'

export const READING_SCHEMA_VERSION = 2

export function compareVersions(a: ProgressVersion, b: ProgressVersion): number {
  return a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

function newest<T extends ProgressVersion>(a: T | null, b: T | null): T | null {
  if (!a) return b
  if (!b) return a
  return compareVersions(a, b) >= 0 ? a : b
}

export function emptyProgress(tid: number): ProgressRow {
  return { tid, fid: 0, forumName: '', title: '', metadataVersion: null, openedAt: 0, read: null, position: null }
}

export function progressUpdatedAt(row: ProgressRow): number {
  return Math.max(row.openedAt, row.read?.at ?? 0, row.position?.at ?? 0)
}

export function mergeProgressRows(a: ProgressRow, b: ProgressRow): ProgressRow {
  if (a.tid !== b.tid) throw new Error('Cannot merge different threads')
  const metadataVersion = newest(a.metadataVersion, b.metadataVersion)
  const metadata = metadataVersion === a.metadataVersion ? a : b
  return {
    tid: a.tid,
    fid: metadata.fid,
    forumName: metadata.forumName,
    title: metadata.title,
    metadataVersion,
    openedAt: Math.max(a.openedAt, b.openedAt),
    read: newest(a.read, b.read),
    position: newest(a.position, b.position),
  }
}


export function toProgressIndex(row: ProgressRow): ProgressIndexRow {
  return { tid: row.tid, openedAt: row.openedAt, read: row.read }
}

export function sameProgress(a: ProgressRow, b: ProgressRow): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
