import type { CoreDeps } from './env'

export type RouteParams = Record<string, string>

/** 所有处理函数统一签名；用不到的参数直接省略 */
export type RouteHandler = (
  request: Request,
  deps: CoreDeps,
  url: URL,
  params: RouteParams,
) => Response | Promise<Response>

export interface Route {
  method: string
  /** 精确路径；`:name` 表示单段参数，如 `/api/history/:tid` */
  path: string
  /** 公开接口不需要访问令牌 */
  public?: boolean
  handler: RouteHandler
}

export interface CompiledRoute extends Route {
  match(path: string): RouteParams | null
}

export function compileRoutes(routes: Route[]): CompiledRoute[] {
  return routes.map((route) => {
    const keys: string[] = []
    const source = route.path
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/:([A-Za-z_]\w*)/g, (_match, key: string) => {
        keys.push(key)
        return '([^/]+)'
      })
    const pattern = new RegExp(`^${source}$`)

    return {
      ...route,
      match: (path) => {
        const found = pattern.exec(path)
        if (!found) return null

        const params: RouteParams = {}
        keys.forEach((key, index) => {
          params[key] = safeDecode(found[index + 1] ?? '')
        })
        return params
      },
    }
  })
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
