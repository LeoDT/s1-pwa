/**
 * 附件下载：经 /api/file 取回 blob 再触发浏览器下载，避免直连上游掉登录态。
 * 见 docs/architecture.md §3.5、docs/data-model.md §4.5。
 */
import { ApiError, getAppToken } from './api'
import { cookieHeader } from './cookieJar'
import { captureContentRoute, routedContentFetch } from './contentProxy'

interface ErrorBody {
  code?: string
  message?: string
}

export async function downloadAttachment(url: string, fallbackName: string): Promise<void> {
  const headers = new Headers()
  const token = await getAppToken()
  if (token) headers.set('x-app-token', token)

  const cookie = await cookieHeader()
  if (cookie) headers.set('x-s1-cookie', cookie)

  const route = await captureContentRoute()
  const response = await routedContentFetch('/api/file', `?u=${encodeURIComponent(url)}`, { headers }, route)

  if (!response.ok) {
    let body: ErrorBody | null = null
    try {
      body = (await response.json()) as ErrorBody
    } catch {
      // 非 JSON 错误体，用状态码兜底
    }
    throw new ApiError(
      body?.code ?? `http_${response.status}`,
      body?.message ?? `附件下载失败（${response.status}）`,
      response.status,
    )
  }

  const blob = await response.blob()
  const filename = filenameFromDisposition(response.headers.get('content-disposition')) ?? fallbackName
  saveBlob(blob, filename)
}

/** 解析 RFC 5987 / 普通 filename=；解析不了返回 null，由调用方用帖子里的附件名兜底 */
export function filenameFromDisposition(value: string | null): string | null {
  if (!value) return null

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(value)?.[1]
  if (encoded) {
    try {
      return decodeURIComponent(encoded)
    } catch {
      // 落到普通 filename
    }
  }

  const plain = /filename="?([^";]+)"?/i.exec(value)?.[1]
  return plain ? plain.trim() : null
}

function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
