import { proxyJson, upstreamUrl } from './proxy'
import { ParseError } from './parser/errors'

export interface AuthorStats {
  uid: number
  name: string
  /** 总发帖数（主题 + 回复） */
  posts: number | null
  /** 主题数 */
  threads: number | null
  /** 战斗力，单位为鹅 */
  e: number | null
}

interface ProfilePayload {
  Variables?: {
    space?: Record<string, unknown>
  }
}

export function parseAuthorStats(payload: unknown, uid: number): AuthorStats {
  const space = (payload as ProfilePayload | null)?.Variables?.space
  if (!space || typeof space !== 'object') {
    throw new ParseError('structure_changed', '无法读取作者资料')
  }

  const posts = intValue(space.posts)
  const threads = intValue(space.threads)
  const e = intValue(space.extcredits1)

  return {
    uid,
    name: typeof space.username === 'string' ? space.username : '',
    posts,
    threads,
    e,
  }
}

export async function fetchAuthorStats(uid: number): Promise<AuthorStats> {
  const payload = await proxyJson<ProfilePayload>(
    upstreamUrl('api/mobile/index.php', { module: 'profile', uid, version: 1 }),
  )
  return parseAuthorStats(payload, uid)
}

function intValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null
  if (typeof value !== 'string') return null
  const raw = value.replace(/[,\s]/g, '')
  if (!/^-?\d+$/.test(raw)) return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isSafeInteger(parsed) ? parsed : null
}
