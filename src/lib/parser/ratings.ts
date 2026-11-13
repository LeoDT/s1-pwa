import type { PostRatings, RatingEntry } from '@shared/types'
import { textOf, type ParsedPage } from './dom'
import { RATINGS, THREAD } from './selectors'

const SUMMARY_RE = /参与人数\s*([\d,]+)/
const SCORE_RE = /战斗力\s*([+-]?\s*\d+)/
const UID_RE = /\buid=(\d+)/

/** 帖子页内联评分：汇总完整，明细最多约 20 条。 */
export function parsePostRatings(element: Element): PostRatings | null {
  const block = element.querySelector(THREAD.ratings)
  if (!block) return null

  const rows = Array.from(block.querySelectorAll('li'))
  const summary = rows.find(
    (row) =>
      !row.querySelector(THREAD.ratingUserLink) &&
      row.querySelector(THREAD.ratingAllLink) !== null &&
      SUMMARY_RE.test(textOf(row)),
  )
  const entries = rows.flatMap((row) => {
    if (row === summary) return []
    const entry = parseInlineEntry(row)
    return entry ? [entry] : []
  })

  if (!summary && entries.length === 0) return null

  const count = summary ? intMatch(SUMMARY_RE, textOf(summary)) : entries.length
  const score = summary ? signedMatch(SCORE_RE, textOf(summary)) : sumScores(entries)

  return {
    count: count ?? entries.length,
    score: score ?? sumScores(entries),
    entries,
  }
}

/** 完整评分列表（mobile=2 的 viewratings 页面）。明细行没有 uid，因此 uid 为 null。 */
export function parseRatingList(page: ParsedPage): RatingEntry[] {
  const list = page.doc.querySelector(RATINGS.list)
  if (!list) return []

  const entries: RatingEntry[] = []
  let last: RatingEntry | null = null

  for (const row of Array.from(list.querySelectorAll(':scope > li'))) {
    const divs = Array.from(row.children).filter((child) => child.tagName === 'DIV')
    const score = signedMatch(SCORE_RE, textOf(row))

    if (score !== null && divs.length >= 3) {
      const userLink = row.querySelector(THREAD.ratingUserLink)
      const uid = Number.parseInt(UID_RE.exec(userLink?.getAttribute('href') ?? '')?.[1] ?? '', 10)
      last = {
        uid: Number.isSafeInteger(uid) && uid > 0 ? uid : null,
        name: textOf(divs[1]),
        score,
        time: textOf(divs[2]) || undefined,
      }
      entries.push(last)
      continue
    }

    // 理由单独占一行，紧跟在对应评分行之后
    if (divs.length === 1 && last) {
      const reason = textOf(divs[0])
      if (reason) last.reason = reason
    }
  }

  return entries
}

function parseInlineEntry(row: Element): RatingEntry | null {
  const link = row.querySelector(THREAD.ratingUserLink)
  if (!link) return null

  const divs = Array.from(row.children).filter((child) => child.tagName === 'DIV')
  const score =
    signedNumber(textOf(divs[1])) ??
    signedMatch(SCORE_RE, textOf(row)) ??
    signedNumber(textOf(row.querySelector(THREAD.ratingScore)))
  if (score === null) return null

  const uid = Number.parseInt(UID_RE.exec(link.getAttribute('href') ?? '')?.[1] ?? '', 10)
  return {
    uid: Number.isSafeInteger(uid) && uid > 0 ? uid : null,
    name: textOf(link),
    score,
    reason: textOf(divs[2] ?? row.querySelector(THREAD.ratingReason)) || undefined,
  }
}

function intMatch(re: RegExp, text: string): number | null {
  const raw = re.exec(text)?.[1]
  if (!raw) return null
  const value = Number.parseInt(raw.replace(/[,\s]/g, ''), 10)
  return Number.isSafeInteger(value) ? value : null
}

function signedMatch(re: RegExp, text: string): number | null {
  return signedNumber(re.exec(text)?.[1])
}

function signedNumber(raw: string | undefined): number | null {
  if (!raw) return null
  const value = Number.parseInt(raw.replace(/\s/g, ''), 10)
  return Number.isSafeInteger(value) ? value : null
}

function sumScores(entries: RatingEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.score, 0)
}
