import { handleApi } from '../core/index'
import type { CoreEnv } from '../core/env'
import { json } from '../core/http'

interface AssetsBinding {
  fetch: (request: Request) => Promise<Response>
}

export interface Env extends CoreEnv {
  ASSETS: AssetsBinding
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, { env })
      } catch (error) {
        console.error('api_error', error instanceof Error ? error.message : String(error))
        return json(
          { ok: false, code: 'internal_error', message: '服务器内部错误' },
          { status: 500 },
        )
      }
    }

    return env.ASSETS.fetch(request)
  },
}
