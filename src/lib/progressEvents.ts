export interface HistorySyncRequest {
  accountId: number
  pull?: boolean
  ifStale?: boolean
  keepalive?: boolean
}

const listeners = new Set<() => void>()
const syncListeners = new Set<(request: HistorySyncRequest) => void>()
let generation = 0

export function requestHistorySync(request: HistorySyncRequest): void {
  for (const listener of syncListeners) listener(request)
}

export function subscribeHistorySync(listener: (request: HistorySyncRequest) => void): () => void {
  syncListeners.add(listener)
  return () => { syncListeners.delete(listener) }
}

export function subscribeProgress(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function notifyProgress(): void {
  for (const listener of listeners) listener()
}

export function progressGeneration(): number {
  return generation
}

export function invalidateProgressOperations(): void {
  generation += 1
}
