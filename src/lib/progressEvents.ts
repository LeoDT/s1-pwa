const listeners = new Set<() => void>()
let generation = 0

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
