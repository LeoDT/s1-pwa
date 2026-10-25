/** 只放行公网 http(s)；拒绝回环/私网/链路本地/元数据地址（SSRF 防线） */
export function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (!host) return false
  if (host === 'localhost' || host.endsWith('.localhost')) return false
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa')) return false
  if (host.startsWith('[') || host.includes(':')) return false // IPv6 字面量一律拒绝

  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!match) return true // 普通域名

  const [a, b] = [Number(match[1]), Number(match[2])]
  if (a === 0 || a === 10 || a === 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a >= 224) return false
  return true
}
