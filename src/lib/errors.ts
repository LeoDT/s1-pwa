import { ApiError } from './api'
import { ParseError } from './parser/errors'
import { LoginError } from './session'

const CODE_MESSAGES: Record<string, string> = {
  bad_request: '请求参数不正确',
  bad_response: '代理返回了无法识别的内容',
  method_not_allowed: '请求方法不受支持',
  not_found: '接口不存在',
  token_required: '请先在设置中填写访问令牌',
  token_invalid: '访问令牌无效，请在设置中更新',
  auth_required: '登录已过期，请重新登录',
  forbidden_host: '代理不允许该地址',
  blocked_address: '代理不允许该地址',
  upstream_timeout: 'S1 响应超时，请稍后重试',
  upstream_error: 'S1 返回异常，请稍后重试',
  upstream_blocked: 'S1 拒绝了这次请求（Discuz 安全校验），换一种网络或稍后重试',
  too_large: '内容过大',
  not_image: '该地址不是图片',
  too_many_redirects: '重定向次数过多',
  structure_changed: '页面结构变化，解析失败',
  internal_error: '服务器内部错误',
}

export function errorMessage(error: unknown): string {
  // 解析层的 message 往往直接来自 Discuz（如「指定的版块不存在」），优先展示
  if (error instanceof ParseError) return error.message

  if (error instanceof LoginError || error instanceof ApiError) {
    // 上游类错误由服务端带回具体原因（如「S1 返回 503」），优先展示
    if (error.code.startsWith('upstream_') || error.code.startsWith('http_')) return error.message
    return CODE_MESSAGES[error.code] ?? error.message
  }
  if (error instanceof DOMException && error.name === 'AbortError') return '请求超时，请重试'
  if (error instanceof TypeError) return '网络不可用，请检查连接'
  if (error instanceof Error && error.message) return error.message
  return '发生未知错误'
}
