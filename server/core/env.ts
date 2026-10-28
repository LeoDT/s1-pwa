import type { ProgressStore } from './store'

/**
 * core 层只认这一组字段，Cloudflare / Node 适配层负责填充。
 * 迁移检查：本目录内不得直访问数据库 binding、平台缓存、进程环境或后台任务接口。
 */
export interface CoreEnv {
  /** 部署级访问令牌；未设置则关闭鉴权 */
  ACCESS_TOKEN?: string
  /** 历史分区派生用；M3 启用 */
  HISTORY_SECRET?: string
}

export interface ProxyDeps {
  fetch?: typeof fetch
}

export interface CoreDeps extends ProxyDeps {
  env: CoreEnv
  store: ProgressStore
}
