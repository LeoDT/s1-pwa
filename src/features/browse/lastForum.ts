let lastFid: number | null = null

export function rememberFid(fid: number): void {
  lastFid = fid
}

export function getLastFid(): number | null {
  return lastFid
}
