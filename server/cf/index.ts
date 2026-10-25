import { handleApi } from '../core/index'
import type { CoreEnv } from '../core/env'
import { fail, json } from '../core/http'
import { D1ProgressStore, missingTableHint, type D1Database } from './store'

interface AssetsBinding {
  fetch: (request: Request) => Promise<Response>
}

export interface Env extends CoreEnv {
  ASSETS: AssetsBinding
  DB: D1Database
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, { env, store: new D1ProgressStore(env.DB) })
      } catch (error) {
        const hint = missingTableHint(error)
        console.error('api_error', error instanceof Error ? error.message : String(error))
        if (hint) return fail(500, 'db_not_migrated', hint)
        return json(
          { ok: false, code: 'internal_error', message: '服务器内部错误' },
          { status: 500 },
        )
      }
    }

    return env.ASSETS.fetch(request)
  },
}
