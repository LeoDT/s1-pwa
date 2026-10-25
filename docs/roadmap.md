# 路线图与验收

每个里程碑都必须「可部署、可点通」，不做半成品横切。

## M0 骨架（0.5 天）✅

- [x] `pnpm create vite` + React 19 + TS strict + Tailwind v4 + 路径别名
- [x] 设计令牌落地：`src/styles/tokens.css`（design-system.md §9）
- [ ] shadcn/ui 初始化 + 装入 Dialog / Sheet / DropdownMenu / Switch / Toast
- [x] `server/cf/index.ts` 空壳 + `GET /api/config` + `GET /api/health`
- [ ] `wrangler.jsonc`（assets: `dist`，`not_found_handling: single-page-application`，`run_worker_first: ["/api/*"]`）
- [x] 本地双进程：`vite`(5180) + `wrangler dev`(8787)，vite proxy `/api`
- [x] `docs/` 定稿；`.gitignore`（`node_modules dist .wrangler .pi .dev.vars`）

**验收**：`pnpm dev` 打开即见空壳页，`curl localhost:5173/api/health` 返回 `{ok:true}`。

## M1 代理与登录（1 天）✅（真实账号登录待你实测）

- [x] `server/core/proxy.ts`：白名单、UA 固定、`X-S1-Cookie` 转发、3xx→JSON、`X-S1-Set-Cookie` 解析
- [x] `server/core/auth.ts`：`ACCESS_TOKEN` 常数时间比较
- [x] 客户端 `apiFetch()` / `proxyFetch()`（跟随 ≤5 跳、聚合 Set-Cookie）
- [x] IDB `jar` 读写、`appToken` 引导页
- [x] 登录页解析（formhash / 安全提问 / 验证码探测）+ POST + 落地判定
- [x] 登录态检测与「登录已过期」横幅
- [x] 设置 Sheet 骨架（令牌、账号、退出登录）

**验收**：真账号登录成功、刷新后仍登录；清空 jar 后回到未登录态；错误密码显示 S1 原文提示。

## M2 浏览（1.5 天）✅

- [x] parser：板块树 / 列表页 / 帖子页（含引用、图片、附件、分页）
- [x] 列表 UI：`ThreadRow`（徽章、line-clamp、分隔线）+ 内流分页
- [x] 帖子 UI：`PostCard`、`QuoteBlock`、分页条（小屏固定底栏）
- [x] 路由：`/f/$fid/{-$page}`、`/t/$tid/{-$page}`
- [x] 响应式：<1024 单栏 / ≥1024 双栏（左 360 可折叠、右 ≤800）
- [x] 骨架屏、空态、错误态、`upstream_blocked` 文案
- [x] 常用板块：底部横向 tabs + 管理页（勾选/上移/下移/删除），首启预置 5 个

**验收**：任意板块可翻页浏览，任意帖可翻阅 15+ 页，图片不直连上游，大屏双栏可用，刷新后状态不丢。

## M2.5 浏览体验对齐 App（0.5 天）✅

- [x] 取消全局后退按钮与刷新按钮；顶栏只留设置（左侧预留给浏览历史）
- [x] 顶栏：列表页与大屏常驻；只有小屏详情页做浮层收起/展开
- [x] 详情页横向滑动返回，**总是回到该板块列表**（页码 + 滚动位置恢复）
- [x] 导航全部走固定层级：除"列表→详情"外一律 replace，不堆历史
- [x] 列表页下拉刷新（触摸），回到前台自动重取
- [x] 板块条统一贴列表底部：小屏为屏幕底部，大屏为左栏底部
- [x] 详情页页码条统一在内容底部（取消大屏右上角的特殊位置）
- [x] 板块管理入口移入设置抽屉

**验收**：无返回/刷新按钮；滚动时标题收起；下拉刷新可用；滑动返回回到原页码与滚动位置；大屏板块条在左栏底部。

## M3 阅读进度（1 天）✅（真实账号 / 远程 D1 待实测）

- [x] D1 表 + 迁移脚本 + `D1ProgressStore`
- [x] `server/core/identity.ts` 身份探针 + isolate LRU（10min/100）
- [x] `/api/history*` 五个端点（含 LWW upsert）
- [x] 客户端：`progress` 镜像、`outbox` 队列、节流刷新、`keepalive` 落盘
- [x] `locatePid()` + `#pid` 滚动高亮
- [x] 列表徽章：已读态、`+N`
- [x] 历史页（最近阅读、一键清除单条/全部）

**验收**：读到第 12 楼退出，重进直接落到第 12 楼；两台设备（手机+桌面）读到同一位置；断网读两页后联网自动补写。

## M4 图片与附件（1 天）✅

- [x] `/api/img` + `/api/file`（SSRF 防护、类型/大小校验、缓存头）
- [x] `imageStore`：Cache API + LRU（7 天 TTL，站内表情除外 / 500MB）+ 并发 6 + 去重
- [x] `ProxyImage`：IntersectionObserver、骨架、失败重试、省流量模式
- [x] `ImageLightbox`：1x/2x、Esc/点空白关闭
- [x] 附件点击 → blob 下载
- [x] 设置页：缓存占用显示 + 清空（顺手接上正文字号/省流量开关）

**验收**：一屏 20+ 张图滚动流畅；二次进入零网络请求（Cache 命中）；附件可下载。

## M5 打磨（0.5 天）✅（真机安装/离线待你实测）

- [x] manifest + 图标（512/192/maskable）+ SW（`vite-plugin-pwa`，app shell）
- [x] iOS 独立模式：safe-area、`100dvh`、边缘滑动（默认关闭，设置内可开启；见实现备注）
- [x] 正文字号 15/16/17/18 生效（`--post-font-size` 用 rem，设置项作用于阅读内容）
- [x] 无障碍抽查：焦点环、触控尺寸、对比度（design-system §1.3）
- [x] 错误文案统一（错误码 → 中文映射表）

**验收**：真机可安装、断网可打开壳、字号切换即时生效、键盘 Tab 可达。
（本地已用 Chromium + 生产构建验证 manifest / SW / 离线壳 / 设置；iOS 主屏与真实断网仍需真机确认。）

## M6 部署与迁移预检（0.5 天）✅（生产已跑通；真机安装/双设备见验收清单）

- [x] `wrangler d1 create s1-progress` + `d1 migrations apply s1-progress --remote`
- [x] `pnpm run deploy` 首次部署（Workers + Static Assets + D1）
- [x] `HISTORY_SECRET` 已设置
- [x] `ACCESS_TOKEN` + `HISTORY_SECRET` 已设置；`/api/config` 返回 `authRequired: true`
- [x] `/api/health` 返回 ok；PWA manifest / SW / 离线壳已在生产 URL 冒烟通过
- [x] 迁移预检：`pnpm preflight`（`server/core` 平台耦合 / 占位 `database_id` / 构建产物 / `.dev.vars`）
- [x] 本地空库迁移验证（`d1 migrations apply s1-progress --local --persist-to .pi/tmp/d1-fresh`）
- [x] README 部署步骤 + 常见问题（登录过期、被限流、换域名、SW 更新、`HISTORY_SECRET`）

**验收**：生产 `/api/health`、`/api/config`、登录与续读已跑通；真机安装、双设备历史、真实断网按验收清单继续。

## 实现备注（与设计的偏差记录）

| 项 | 说明 |
|---|---|
| 端口 | Web 用 5180（5173/5174 在本机被占用），Worker 用 8787 |
| 依赖安装 | pnpm 11 用 `pnpm-workspace.yaml` 的 `allowBuilds` 放行 `esbuild`/`workerd` |
| 消息页 | 登录失败等使用 Discuz 消息页 `.jump_c`，已纳入错误文案选择器 |
| 设置面板 | 先用原生 `<dialog>` 实现底部抽屉（自带焦点陷阱与 Esc），暂不引 Radix |
| Discuz XSS 校验 | 登录 POST 的 query 额外带 `formhash`，绕开 body 双重解码扫描（见 parser.md §3.1） |
| 上游 5xx | 不再透传 Discuz 错误页，转成 `upstream_error` / `upstream_blocked` + 可读文案，并在 worker 日志留 `upstream_5xx` 诊断 |
| 路由 | 用两条静态路由（`/f/$fid` + `/f/$fid/$page`）代替可选参数 `{-$page}`，避免依赖版本特性 |
| 板块树 | 手机版只列 8 个板块，故额外提供「手动输入 fid」入口（抓一页校验 + 取标题） |
| 消息页 | `parsePage` 新增 `kind: 'message'`（优先于 body.class 判定），避免把「提示信息」当板块名 |
| 被屏蔽帖 | 以「只有一个不含 blockquote 的 div.quote」判定，避免误伤引用被屏蔽帖的楼层 |
| 图片 | 为让 M2 可验收，`/api/img` 与 `ProxyImage`（blob + Cache API）提前实现；灯箱/省流量/缓存统计仍留 M4 |
| 手势 | `usePullToRefresh` / `useSwipeBack` 用 ref 持有回调，避免父组件重渲染导致监听重装、手势被打断（实测踩到） |
| 返回 | 从列表进详情时 push 一次并 `markFromList()`；返回优先 `history.back()`（保留滚动），深链则 replace 到列表 |
| 图片直连 | 正文图片只输出 `data-src`：DOMPurify 的 `innerHTML` 解析阶段会让带 `src` 的图片被浏览器直接请求（实测确认），必须避免 |
| 列表分页 | 列表页改为**无限滚动**（IntersectionObserver + 追加，按 tid 去重，刷新回第 1 页）；URL 只保留 fid，`/f/<fid>/<page>` 路由删除。详情页仍按钮翻页 |
| 大屏框架 | 双栏整体居中限宽 `--frame-w: 1160px`（360 + 800），顶栏内容与框架同宽；修复宽屏下列表与正文被拉开的问题 |
| 顶栏标题 | 顶栏固定显示 `Stage1st`（不再由页面设置标题）；帖子标题作为内容内的 h1，随正文滚动 |
| 板块管理 | 从独立页 `/boards` 改为设置抽屉内就地编辑（板块树只在展开「添加板块」时请求） |
| 排版 | 字号收敛为 4 档 **rem**（12/14/16/20，根字号固定 16）：删除 12.5/13/15/17；正文 16/1.75；帖子标题 20/600；`--post-font-size` 用 rem 接上设置（只缩放阅读内容，UI 不变）；上游 `<font size>` 也映射到 rem |
| 动效 | 只做反馈：按下/悬停 140ms、抽屉 240ms（`--motion-*` 令牌）；**不做**入场动画/滚动场景/视差；`prefers-reduced-motion` 全局降为 0.01ms |
| 框架宽度 | 大屏框架加宽到 `--frame-w: 1320px`（左栏 420 + 正文 900），顶栏内容同宽；列表/板块条字号独立于正文（列表 14、板块 12） |
| 大屏刷新 | 无触摸手势，故板块条右侧与详情页底栏右侧各加一个刷新按钮（列表 = 回第 1 页；详情 = 重取当前页） |
| 滚动条 | 全局细滚动条（thumb `--color-line`，hover 强调色）；设置抽屉改为「固定标题 + 内容区滚动」，滚动条不再盖住标题 |
| 图片失败 | 失败态右下角加「打开原图」小字链接（直连上游原图） |
| tailwind-merge | 自定义字号档（text-meta/ui/body/title）需要在 `cn()` 里登记成 font-size 组，否则会被当成颜色与 `text-text` 冲突而被丢掉 |
| 空行 | 上游正文的连续空 `<br>` **不做归一**（用户选择保留作者原始留白） |
| 左栏激活态 | 大屏当前打开的帖子行加 `--color-panel-light` 底 + 3px 强调色竖条 + `aria-current` |
| 路由参数 | core 路由表支持 `:name` 单段占位符（编译成正则），`/api/history/index` 先于 `/:tid` 注册；方法不符仍返回 405 |
| D1 配置 | 已创建 `s1-progress` 并回填真实 `database_id`；换账号/重建库时替换，preflight 拦截占位 UUID。本地用 `pnpm exec wrangler d1 migrations apply s1-progress --local` |
| 游客态 | 进度写入与历史请求都挂在 `useSession()` 之后；未登录只读本地镜像，不产生 401 请求。历史页离线时退回本地镜像 |
| 跨设备续读 | 启动/恢复联网时 `HistorySync` 拉最近 100 条写入本地镜像，列表点开即可续读；列表徽章只用轻量 `/api/history/index` |
| 退出登录 | 同时清本地 `progress` 镜像与 `outbox`，避免换账号串数据 |
| 回复快照 | `ProgressRow.replies` 只在进入帖子时取一次，本次阅读内翻页/刷新不更新（`newReplies = 列表回复数 - 快照`） |
| 浏览历史 | 不是独立页面：`/history` 与 `/history/t/…` 复用 `BrowseLayout`，小屏占满、大屏占左栏，底部板块条常驻；行样式与板块列表共用 `ListRow`；从历史进入的详情页翻页/引用跳转都留在 `/history/t/…` |
| 激活色 | 历史按钮（`aria-current="page"`）、板块 tab、帖子行激活/已读徽章统一用 `--color-accent-strong` 文字，与左侧 3px 竖条一致 |
| 图片缓存 | Cache API 本身无 TTL：用 `imgMeta.lastUsed` 自己做 7 天过期 + 500MB LRU；启动时与新图入库后各跑一次。站内表情（`static.stage1st.com/image/smiley/`）不做 7 天过期，但仍参与 LRU |
| 上游抓取 | `/api/img` 与 `/api/file` 共用 `fetchUpstreamAsset()`：手动跟重定向、逐跳 SSRF 校验、大小上限、cookie 仅发上游域 |
| 附件 | 经 `/api/file` 取 blob 后 `a[download]` 触发下载；文件名优先 `Content-Disposition`，兜底用帖子里的附件名 |
| 数据库名 | 统一 `s1-progress`（`wrangler.jsonc` 的 `database_name`）；真实 `database_id` 已回填，换账号/重建库时需替换，占位 UUID 由 preflight 拦截 |
| 迁移方式 | 用 `d1 migrations apply s1-progress --remote`（有 `d1_migrations` 记录，可重复执行），不再手工 `d1 execute --file` |
| 部署命令 | 文档统一 `pnpm run deploy`，避免 `pnpm deploy` 与 pnpm 自身 deploy 命令混淆；`deploy` 内先 build + preflight |
| 首次部署顺序 | 先 `pnpm run deploy` 让 Worker 存在，再 `wrangler secret put`（会立即创建并部署新版本）；避免对全新 Worker 直接 `secret put` 的平台差异 |
| 首次静态资源部署 | 全新 Worker 直接部署 assets 时遇到过 `assets-upload-session` 500（code 10013）；先用无 assets 的临时配置部署同名 Worker，再正常 deploy 即成功 |
| 部署预检 | `scripts/preflight.mjs`：检查占位 `database_id`、`server/core` 平台耦合、`dist/index.html`/`sw.js`/manifest、迁移文件、`.dev.vars` 未被 git 跟踪 |
| 本地 D1 | 空库迁移在 `.pi/tmp/d1-fresh` 验证通过（`progress` + `idx_progress_recent` + `d1_migrations`） |
| PWA 本地验证 | Vite dev 不注册 SW；必须 `pnpm build` 后用 wrangler 托管 `dist`，且每次构建后重启 wrangler（assets 清单启动时固定） |
| README | 补齐 M3–M5 状态、本地 D1/PWA 验证、部署步骤、secrets 注意事项、排障（登录过期/限流/换域名/SW 更新） |
| PWA 壳 | `vite-plugin-pwa` 用 `generateSW`：预缓存构建产物 + `navigateFallback: /index.html`；**`/api/*` 不经过 SW 缓存**（图片仍由 Cache API 自己管），断网时深链回壳、数据请求走现有错误态 |
| PWA 图标 | 192/512（any）+ 512 maskable + iOS 180 `apple-touch-icon`；manifest `display: standalone`、theme/background 用设计令牌；`index.html` 只保留 favicon 与 apple-touch-icon 链接，manifest link 由插件注入 |
| 持久化存储 | 启动时调用 `navigator.storage.persist()`（失败/被拒绝忽略），降低 Cache/IDB 被系统回收的概率 |
| 滑动返回 | `edgeSwipe` 偏好已接线，默认 **false**（避免与 iOS 原生边缘手势叠加）；设置 → 阅读内可开关，真机确认后再决定是否调整默认值 |
| 无障碍 | 图标按钮（历史删除、字号档位、板块排序/删除、灯箱、详情刷新）统一到 44px；设置抽屉补 `aria-labelledby`，灯箱补 `aria-label`/`aria-modal`；全局 `:focus-visible` 沿用设计令牌 |
| 错误文案 | 补齐 `bad_request` / `bad_response` / `method_not_allowed` / `not_found`；`upstream_*` / `http_*` 仍优先展示服务端具体原因 |

## 验收清单（手动，真机）

| 场景 | 期望 |
|---|---|
| iPhone Safari 添加到主屏 | 无地址栏；底部不压手势条；顶栏在刘海下 |
| 小屏列表 | 底部板块 tabs 可横滑；徽章/新回复显示正确 |
| 大屏 | 左右独立滚动；右栏正文 ≤800px；左栏可折叠 |
| 无痕/清数据后 | 需重填访问令牌与登录；服务端历史仍在，重登后恢复 |
| 弱网 | 骨架屏 → 内容；失败有重试 |
| 引用链跳转 | A→B→C 逐层跳，返回键逐层回退 |
| 楼中楼引用不可用 | 无 pid 的引用无箭头、不可点 |

## 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| S1 对 Cloudflare 出口限流/出验证页 | 页面加载失败 | 解析层识别 + 友好提示；必要时加「按用户隔离的短期 HTML 缓存」 |
| S1 模板改版 | 解析全挂 | 选择器集中 + 夹具回归；错误码 `structure_changed` 直接暴露问题 |
| `*.workers.dev` 国内不可达 | 应用打不开 | 绑自定义域名（代码零改动） |
| iOS 清理站点数据 | 掉登录、掉访问令牌 | 历史在服务端；重登即恢复；文档写明 |
| 大图内存 | Safari 崩标签 | 图片 LRU 500MB + objectURL 引用计数 + 灯箱只渲染 1 张 |
| 访问令牌丢失 | 无法访问 | `ACCESS_TOKEN` 可在 CF Dashboard 重设；换令牌后重填即可 |
| D1 免费额度 | 超限写入失败 | 单用户量级远低于额度；写入合并（同帖 5s 节流） |
