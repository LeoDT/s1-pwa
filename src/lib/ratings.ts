import type { RatingEntry } from '@shared/types'
import { parsePage, errorText } from './parser/dom'
import { ParseError } from './parser/errors'
import { parseRatingList } from './parser/ratings'
import { proxyFetch, upstreamUrl } from './proxy'

export function formatRatingScore(score: number): string {
  return score > 0 ? `+${score}` : String(score)
}

export async function fetchPostRatings(tid: number, pid: number): Promise<RatingEntry[]> {
  const result = await proxyFetch(
    upstreamUrl('forum.php', { mod: 'misc', action: 'viewratings', tid, pid, mobile: 2 }),
  )
  const page = parsePage(result.html, result.url)
  if (page.kind === 'message') {
    throw new ParseError('structure_changed', errorText(page) ?? '无法读取评分列表')
  }

  const entries = parseRatingList(page)
  if (entries.length === 0) {
    throw new ParseError('structure_changed', '评分列表为空或页面结构变化')
  }
  return entries
}
