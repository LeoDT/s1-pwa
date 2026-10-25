# S1 Reader PWA

Stage1st（Discuz X3.5）只读阅读器 PWA：用 S1 账号登录、按板块浏览、记住每帖读到哪一楼。
服务端只做**薄代理 + 阅读进度存储**，不保存凭证、不解析 HTML。

设计文档见 [`docs/`](./docs/)：总览 / 架构 / 设计系统 / 数据模型 / 解析规范 / 路线图。

## 当前进度

| 里程碑 | 状态 |
|---|---|
| M0 骨架 | ✅ Vite + React 19 + Tailwind v4 + Worker（`/api/config`、`/api/health`）+ SPA 资源绑定 |
| M1 代理与登录 | ✅ `/api/proxy`（白名单 / 3xx→JSON / Set-Cookie 暴露）、IndexedDB 凭证罐、登录页解析与提交、登录态检测、访问令牌引导、设置面板 |
| M2 浏览 | ✅ 板块列表（无限滚动/徽章）、帖子页（楼层/引用跳转/图片/附件/分页）、小屏单栏 + 大屏双栏 |
| M2.5 App 式浏览 | ✅ 无后退/刷新按钮、顶栏滚动收起、下拉刷新、滑动返回回列表、板块条贴列表底部 |
| M3 阅读进度 | ✅ D1、身份探针、楼层定位、历史列表、离线补写 |
| M4 图片与附件 | ✅ `/api/img`、`/api/file`、灯箱、省流量模式、缓存统计/清理 |
| M5 PWA 打磨 | ✅ manifest / Service Worker / 离线壳 / 无障碍 / 表情缓存不过期 |
| M6 部署 | ⏳ 预检脚本、迁移与文档已就绪；实际建库/secret/deploy 需 Cloudflare 登录 |

## 环境要求

- Node.js ≥ 20（开发用 26 验证）
- pnpm 11
- 部署时需要 Cloudflare 账号（Workers + D1）
- 本地开发端口：Web `5180`，Worker `8787`

> pnpm 11 默认拦截依赖的 postinstall，仓库已在 `pnpm-workspace.yaml` 里放行 `esbuild` 与 `workerd`，无需手动 approve。

## 本地开发

```bash
pnpm install
cp .dev.vars.example .dev.vars          # 按需填写，可留空
pnpm exec wrangler d1 migrations apply s1-progress --local
pnpm dev                                # 同时起 vite(5180) 与 wrangler dev(8787)
```

打开 <http://localhost:5180/>。`/api/*` 由 Vite 代理到 `http://127.0.0.1:8787`。

`.dev.vars` 支持两个变量（都只在服务端使用）：

| 变量 | 作用 | 留空时 |
|---|---|---|
| `ACCESS_TOKEN` | 访问令牌，防止他人白用你的代理 | 关闭鉴权（本地调试推荐留空） |
| `HISTORY_SECRET` | 历史分区派生密钥（`HMAC(uid)`） | 历史接口返回 500 |

**改完 `.dev.vars` 必须重启 `pnpm dev`**，wrangler 不会热加载它。

### 验证 PWA / 离线

Vite dev（5180）**不注册 Service Worker**，离线壳只在“构建产物 + Worker 托管 `dist`”时生效：

```bash
pnpm build
pnpm dev:api        # 只起 wrangler，直接访问 http://localhost:8787/
```

每次 `pnpm build` 后都要确认 wrangler 是重启过的：它的 assets 清单在启动时固定，新生成的 `/sw.js` 不会被旧进程发现。

## 常用命令

```bash
pnpm dev          # 前端 + Worker
pnpm dev:web      # 只起前端
pnpm dev:api      # 只起 Worker
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest（解析器 / API / 客户端纯逻辑）
pnpm build        # 构建 dist/ 与 PWA 壳
pnpm preflight    # 部署预检：D1 占位 id、core 平台耦合、迁移/构建产物、.dev.vars
pnpm smoke        # 真实 Chromium 冒烟（需先 pnpm dev）
pnpm fixtures     # 重新抓取 tests/fixtures 的真实页面
pnpm run deploy   # build + preflight + wrangler deploy
```

## 部署到 Cloudflare

> 数据库名统一为 `s1-progress`。`wrangler.jsonc` 里的 `database_id` 是占位 UUID，
> `pnpm preflight` 会拦住未替换的部署。

```bash
# 1. 登录并建库
pnpm exec wrangler login
pnpm exec wrangler d1 create s1-progress
#    把输出的 database_id 填进 wrangler.jsonc 的 d1_databases
#    替换后本地 D1 也会按新 id 建库，需要重新执行一次本地迁移

# 2. 执行迁移（使用迁移表，不要手工 execute 0001）
pnpm exec wrangler d1 migrations apply s1-progress --remote

# 3. 首次部署（此时还没有 secrets；先让 Worker 存在）
pnpm run deploy

# 4. 设置服务端 secrets（每条都会立即创建并部署一个新版本）
pnpm exec wrangler secret put ACCESS_TOKEN      # 例如 openssl rand -hex 32
pnpm exec wrangler secret put HISTORY_SECRET    # 例如 openssl rand -base64 32

# 5. 自检
curl https://<worker>.workers.dev/api/health
curl https://<worker>.workers.dev/api/config
```

`/api/health` 应返回 `{ok:true,...}`；配置了 `ACCESS_TOKEN` 时 `/api/config` 返回 `authRequired: true`。
部署后在 PWA 首次引导页填入同一个 `ACCESS_TOKEN`。

### Secrets 注意事项

- `ACCESS_TOKEN` 只保护代理，不是 S1 密码；丢失后可在 Dashboard 重设并在设置里更新。
- `HISTORY_SECRET` **一旦有历史数据就不要随意更换**：它会改变 `userKey`，旧历史将无法关联。
- 两个 secret 都不要写进仓库；本地只放在 gitignored 的 `.dev.vars`。

### 部署后检查

1. `/api/health`、`/api/config` 正常。
2. 填访问令牌 → 登录 S1 → 打开板块与帖子。
3. 读到某楼 → 刷新/重进是否回到该楼。
4. 第二台设备登录同一账号，历史是否同步。
5. 安装到主屏 → 断网重开，应用壳可打开并显示网络错误。
6. 检查 Worker 日志无凭证、无 500。

## 排障

| 现象 | 原因 / 处理 |
|---|---|
| 历史接口 500，或日志 `服务端未配置 HISTORY_SECRET` | 本地 `.dev.vars` 未填/未重启；线上执行 `wrangler secret put HISTORY_SECRET` |
| 部署前提示 `database_id 仍是占位 UUID` | 先 `wrangler d1 create s1-progress`，把真实 id 填回 `wrangler.jsonc` |
| `wrangler deploy` 报未登录 | `pnpm exec wrangler login`，或设置 `CLOUDFLARE_API_TOKEN` |
| 登录返回 `S1 拒绝了这次请求（Discuz 安全校验）` / 503「含有非法字符」 | Discuz `_xss_check()`：登录 POST 的 query 缺 `formhash` 时会把 body 解码两次后扫 `( ) ' " < >`。客户端已把 `formhash` 放进 query 规避；若仍出现，看 worker 日志里的 `upstream_5xx` 一行（含上游 URL，不含密码） |
| 登录提示「密码错误次数过多，请 15 分钟后重新登录」 | S1 按 IP 锁定 15 分钟。别连续重试；确认**安全提问**选对（选错同样计入失败） |
| 502 `upstream_blocked` / 403 验证页 | S1 触发风控或 Cloudflare 限流：等待一段时间/换网络，别高频刷新；Worker 日志的 `upstream_5xx` 会带上游 URL 与错误页摘要（不含凭证） |
| 401 `token_required` / `token_invalid` | 设置 → 访问令牌重新填写；确认与 `wrangler secret put ACCESS_TOKEN` 一致 |
| 登录过期 / 换设备后要重登 | S1 cookie 只存在浏览器 IndexedDB；清站点数据/换域名/换设备都会丢，重新登录即可，服务端历史仍在 |
| 看不到 IndexedDB 里的数据 | `localhost:5180` 与 `127.0.0.1:5180` 是**两个不同源**，各有独立存储。统一用 `http://localhost:5180` |
| 换域名后像新应用 | 新 origin 有独立的 IndexedDB/Cache；需重新填令牌和登录。已安装的旧 PWA 需重装 |
| Service Worker 不更新 / 离线仍是旧页面 | `autoUpdate` 会接管，但需关闭所有旧标签页再重开；本地构建后**重启 wrangler**，否则 `/sw.js` 会被 SPA fallback 成 HTML |
| 图片大面积失败 | 上游图床/TLS 偶发失败，先重跑；详情看 `/api/img` 的 502 日志。正文图片失败可点「打开原图」 |
| 返回不了列表 | 详情页横向滑动（左右都行）；若与系统手势冲突，可在设置 → 阅读里关闭「横向滑动返回」，用系统返回 |
| 想看请求细节 | Worker 每个请求打一行 `{"path","method","status","upstream","ms"}`；浏览器 DevTools 的 Verbose 级别有 `[s1]` 前缀日志（不含凭证） |

## 安全边界

- S1 凭证只存在浏览器 IndexedDB，请求时通过 `X-S1-Cookie` 交给 Worker 转发，Worker 不落盘、不打日志。
- Worker 只向 `stage1st.com` 及其子域转发凭证；第三方图床一律剥离。
- 帖子正文经 DOMPurify 清洗后由 DOM→React 映射渲染，不使用 `innerHTML`。
- `HISTORY_SECRET` 让 D1 里只有 `HMAC(uid)`，没有明文身份。
- `/api/img`、`/api/file` 有 SSRF 白名单、重定向逐跳校验、类型/大小限制。
- `.dev.vars` 与 `.wrangler/` 均已 gitignore；部署预检会确认 `.dev.vars` 未被跟踪。

## 目录结构

```
src/
  app/          Shell / Gate / 路由 / 顶栏
  components/   正文渲染、图片、灯箱、分页、状态组件
  features/     auth / browse / history / boards / progress / settings / status
  lib/          api / proxy / session / db / imageStore / prefs / parser / progress
server/
  core/         纯 Request→Response（代理、鉴权、身份、历史、图片/附件、路由）
  cf/           Cloudflare 适配层（D1、assets、env）
shared/         前后端共享类型
migrations/     D1 SQL 迁移
scripts/        fixtures / smoke / preflight
public/         图标与 PWA 资源
tests/          解析器夹具与单测
docs/           设计文档
```
