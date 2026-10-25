# S1 Reader PWA

Stage1st（Discuz X3.5）只读阅读器 PWA：用 S1 账号登录、按板块浏览、记住每帖读到哪一楼。
服务端只做**薄代理 + 阅读进度存储**，不保存凭证、不解析 HTML。

设计文档见 [`docs/`](./docs/)：总览 / 架构 / 设计系统 / 数据模型 / 解析规范 / 路线图。

## 当前进度

| 里程碑 | 状态 |
|---|---|
| M0 骨架 | ✅ Vite + React 19 + Tailwind v4 + Worker（`/api/config`、`/api/health`）+ SPA 资源绑定 |
| M1 代理与登录 | ✅ `/api/proxy`（白名单 / 3xx→JSON / Set-Cookie 暴露）、IndexedDB 凭证罐、登录页解析与提交、登录态检测、访问令牌引导、设置面板 |
| M2 浏览 | ✅ 板块列表（含置顶过滤/无限滚动/徽章）、帖子页（楼层/引用跳转/图片/附件/分页）、小屏单栏 + 大屏双栏 |
| M2.5 App 式浏览 | ✅ 无后退/刷新按钮、顶栏滚动收起、下拉刷新、滑动返回回列表、板块条贴列表底部 |
| 体验整改 | ✅ 板块管理内联在设置抽屉、大屏整体居中限宽、左栏当前帖子激活态、列表无限滚动、顶栏固定 `Stage1st` + 标题进正文 |
| M3 阅读进度 | ⏳ D1、身份探针、楼层定位 |
| M4 图片与附件 | ⏳ 基础通道已通（`/api/img` + blob + Cache API）；剩灯箱、省流量模式、缓存统计/清理 |
| M5 PWA 打磨 | ⏳ manifest / Service Worker / 真机细节 |

## 环境要求

- Node.js ≥ 20（开发用 26 验证）
- pnpm 11
- 本地开发的端口：Web `5180`，Worker `8787`

> pnpm 11 默认拦截依赖的 postinstall，仓库已在 `pnpm-workspace.yaml` 里放行 `esbuild` 与 `workerd`，无需手动 approve。

## 本地开发

```bash
pnpm install
cp .dev.vars.example .dev.vars   # 按需填写，可留空
pnpm dev                         # 同时起 vite(5180) 与 wrangler dev(8787)
```

打开 <http://localhost:5180/>。`/api/*` 由 Vite 代理到 `http://127.0.0.1:8787`。

`.dev.vars` 支持两个变量（都只在服务端使用）：

| 变量 | 作用 | 留空时 |
|---|---|---|
| `ACCESS_TOKEN` | 访问令牌，防止他人白用你的代理 | 关闭鉴权（本地调试推荐留空） |
| `HISTORY_SECRET` | 历史分区派生密钥（M3 启用） | M3 前不影响 |

## 常用命令

```bash
pnpm dev          # 前端 + Worker
pnpm dev:web      # 只起前端
pnpm dev:api      # 只起 Worker
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest（解析器夹具单测）
pnpm build        # 构建 dist/
pnpm fixtures     # 重新抓取 tests/fixtures 的真实页面
pnpm smoke        # 真实 Chromium 打开首页检查渲染与 console 错误（需先 pnpm dev）
pnpm deploy       # build + wrangler deploy
```

## 部署到 Cloudflare

```bash
# 1. 建库并执行迁移
pnpm wrangler d1 create s1pwa
#    把输出的 database_id 填进 wrangler.jsonc 的 d1_databases
pnpm wrangler d1 execute s1pwa --file=migrations/0001_init.sql --remote

# 2. 设置密钥
pnpm wrangler secret put ACCESS_TOKEN      # 随便生成一串高强度随机值
pnpm wrangler secret put HISTORY_SECRET    # openssl rand -base64 32

# 3. 部署
pnpm deploy
```

部署后在 PWA 里打开首次引导页，把 `ACCESS_TOKEN` 填进去即可。
换域名/换 Worker 无需改代码；`.workers.dev` 在国内网络可能不稳定，可后续绑自有域名。

## 排障

| 现象 | 原因 / 处理 |
|---|---|
| 登录返回 `S1 拒绝了这次请求（Discuz 安全校验）` / 503「含有非法字符」 | Discuz `_xss_check()`：登录 POST 的 query 缺 `formhash` 时会把 body 解码两次后扫 `( ) ' " < >`。客户端已把 `formhash` 放进 query 规避；若仍出现，看 worker 日志里的 `upstream_5xx` 一行（含上游 URL，不含密码） |
| 登录提示「密码错误次数过多，请 15 分钟后重新登录」 | S1 按 IP 锁定 15 分钟。别连续重试；确认**安全提问**选对（选错同样计入失败）。UI 会显示倒计时并禁用提交 |
| 看不到 IndexedDB 里的数据 | `localhost:5180` 与 `127.0.0.1:5180` 是**两个不同源**，各有独立存储。统一用 `http://localhost:5180`；登录成功后在 Application → IndexedDB → `s1read` 里能看到 `kv`（session/appToken）与 `jar`（S1 cookie） |
| 详情页怎么返回 | 在详情页横向滑动（左右都行）。没有返回按钮；返回总是回到该帖所属板块的列表，并恢复页码与滚动位置。见 `docs/navigation.md` |
| 想看请求细节 | 终端里 worker 每个请求打一行 `{"path","method","status","upstream","ms"}`；浏览器 DevTools 的 Verbose 级别有 `[s1]` 前缀的客户端日志（不含凭证） |

## 安全边界

- S1 凭证只存在浏览器 IndexedDB，请求时通过 `X-S1-Cookie` 交给 Worker 转发，Worker 不落盘、不打日志。
- Worker 只向 `stage1st.com` 及其子域转发凭证；第三方图床一律剥离。
- 帖子正文经 DOMPurify 清洗后由 DOM→React 映射渲染，不使用 `innerHTML`。
- `HISTORY_SECRET` 让 D1 里只有 `HMAC(uid)`，没有明文身份。

## 目录结构

```
src/            前端（React + TanStack Router/Query）
  app/          Shell / Gate / 路由
  features/     auth / home / settings / status
  lib/          api / proxy / cookieJar / session / db / prefs / parser
server/
  core/         纯 Request→Response（代理、鉴权、路由）
  cf/           Cloudflare 适配层（assets 绑定，后续接 D1）
shared/         前后端共享类型
migrations/     D1 SQL
tests/          解析器夹具与单测
docs/           设计文档
```
