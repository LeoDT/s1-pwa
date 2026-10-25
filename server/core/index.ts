import pkg from '../../package.json'
import type { AppConfig } from '../../shared/types'
import type { CoreDeps } from './env'
import { checkAppToken, fail, json } from './http'
import { handleImage } from './image'
import { handleProxy } from './proxy'

export const VERSION: string = pkg.version

interface Route {
  method: string
  path: string
  /** 公开接口不需要访问令牌 */
  public?: boolean
  handler: (request: Request, deps: CoreDeps, url: URL) => Response | Promise<Response>
}

const routes: Route[] = [
  {
    method: 'GET',
    path: '/api/health',
    public: true,
    handler: () => json({ ok: true, version: VERSION }),
  },
  {
    method: 'GET',
    path: '/api/config',
    public: true,
    handler: (_request, deps) => {
      const config: AppConfig = {
        authRequired: Boolean(deps.env.ACCESS_TOKEN),
        version: VERSION,
      }
      return json(config)
    },
  },
  {
    method: 'GET',
    path: '/api/proxy',
    handler: (request, deps, url) => handleProxy(request, url, deps),
  },
  {
    method: 'POST',
    path: '/api/proxy',
    handler: (request, deps, url) => handleProxy(request, url, deps),
  },
  {
    method: 'GET',
    path: '/api/img',
    handler: (request, deps, url) => handleImage(request, url, deps),
  },
]

const routeTable = new Map(routes.map((route) => [`${route.method} ${route.path}`, route]))

export async function handleApi(request: Request, deps: CoreDeps): Promise<Response> {
  const started = Date.now()
  const url = new URL(request.url)
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname

  const route = routeTable.get(`${request.method} ${path}`)
  if (route) {
    if (!route.public) {
      const denied = checkAppToken(request, deps.env)
      if (denied) return logged(request, url, denied, started)
    }
    const response = await route.handler(request, deps, url)
    return logged(request, url, response, started)
  }

  // 路径存在但方法不对时给出 405，便于排查
  const pathExists = routes.some((candidate) => candidate.path === path)
  if (pathExists) return logged(request, url, fail(405, 'method_not_allowed', '不支持的请求方法'), started)

  return logged(request, url, fail(404, 'not_found', '未知接口'), started)
}

/**
 * 结构化请求日志。只记路径、状态与耗时；不记查询串（含 tid/pid）、不记任何请求头。
 */
function logged(request: Request, url: URL, response: Response, started: number): Response {
  console.log(
    JSON.stringify({
      path: url.pathname,
      method: request.method,
      status: response.status,
      upstream: response.headers.get('x-upstream-status') ?? undefined,
      error: response.headers.get('x-s1-error') ?? undefined,
      ms: Date.now() - started,
    }),
  )
  return response
}
