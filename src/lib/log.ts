/**
 * 客户端诊断日志。只在 DevTools 的 Verbose 级别显示，不含账号、密码、cookie 等敏感值。
 * 排查登录/解析问题时可在这里加事件，服务端对应 server/core/index.ts 的请求日志。
 */
export function debug(event: string, data: Record<string, unknown> = {}): void {
  console.debug('[s1]', event, data)
}
