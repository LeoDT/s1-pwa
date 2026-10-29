import { createContext, useEffect, useState } from 'react'
import { loadImageDimensions, type ImageDimensions } from './imageDimensions'

const EMPTY_DIMENSIONS: ReadonlyMap<string, ImageDimensions> = new Map()

export const ImageDimensionsContext = createContext(EMPTY_DIMENSIONS)

export function usePreparedImageDimensions(urls: readonly string[]): ReadonlyMap<string, ImageDimensions> | undefined {
  const key = JSON.stringify([...new Set(urls)].sort())
  const [prepared, setPrepared] = useState<{ key: string; dimensions: ReadonlyMap<string, ImageDimensions> }>()

  useEffect(() => {
    if (key === '[]') return
    let alive = true
    void loadImageDimensions(JSON.parse(key) as string[]).then(
      (dimensions) => { if (alive) setPrepared({ key, dimensions }) },
      () => { if (alive) setPrepared({ key, dimensions: EMPTY_DIMENSIONS }) },
    )
    return () => { alive = false }
  }, [key])

  if (key === '[]') return EMPTY_DIMENSIONS
  return prepared?.key === key ? prepared.dimensions : undefined
}
