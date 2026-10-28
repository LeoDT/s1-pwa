import type { ApiErrorBody } from '@shared/types'
import { getAppToken } from './appToken'

export { getAppToken, setAppToken } from './appToken'

export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

type JsonInit = Omit<RequestInit, 'body'> & { json?: unknown; body?: BodyInit }

export type { JsonInit }

/** 同源 JSON API 调用：自动带访问令牌、统一错误包装。 */
export async function apiFetch<T>(path: string, init: JsonInit = {}): Promise<T> {
  const { json: payload, headers: rawHeaders, ...rest } = init
  const headers = new Headers(rawHeaders)

  const token = await getAppToken()
  if (token) headers.set('x-app-token', token)

  let body = rest.body
  if (payload !== undefined) {
    headers.set('content-type', 'application/json; charset=utf-8')
    body = JSON.stringify(payload)
  }

  const response = await fetch(path, { ...rest, headers, body })
  const text = await response.text()
  const parsed = text ? (JSON.parse(text) as unknown) : null

  if (!response.ok) {
    const error = parsed as Partial<ApiErrorBody> | null
    throw new ApiError(
      error?.code ?? `http_${response.status}`,
      error?.message ?? `请求失败（${response.status}）`,
      response.status,
    )
  }

  return parsed as T
}
