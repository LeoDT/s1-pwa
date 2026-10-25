/**
 * core 层只认这一组字段，Cloudflare / Node 适配层负责填充。
 * 迁移检查：server/core/** 内不得出现 env.DB、caches.default、process.env、waitUntil。
 */
export interface CoreEnv {
  /** 部署级访问令牌；未设置则关闭鉴权 */
  ACCESS_TOKEN?: string
  /** 历史分区派生用；M3 启用 */
  HISTORY_SECRET?: string
}

export interface CoreDeps {
  env: CoreEnv
  /** M3 注入 ProgressStore */
}
