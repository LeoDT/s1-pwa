# S1 Reader PWA — 设计总览

> 状态：v1 设计定稿（只读阅读器）
> 事实核对基准日：2026-10-25，直接抓取 `https://stage1st.com/2b/` 手机版页面验证

## 1. 定位

一个面向 Stage1st（Discuz X3.5）的 **只读阅读器 PWA**：用 S1 账号登录、按板块浏览帖子、记住每帖读到哪一楼。
服务端只做**薄代理 + 阅读进度存储**，不保存任何 S1 凭证、不解析 HTML。

## 2. 核心约束（来自需求）

| 编号 | 约束 |
|---|---|
| C1 | S1 凭证只存在浏览器端，服务端零存储 |
| C2 | HTML 解析完全在浏览器端，服务端只转发 |
| C3 | 只读：不发帖、不回复、不收藏、不投票 |
| C4 | 阅读历史存服务端（Cloudflare D1），按 S1 用户分区，多设备登录即自动同步 |
| C5 | 部署在 Cloudflare Workers + 静态资源 + D1；架构要能低成本迁到 Node + SQLite |
| C6 | 配色以「红茶Alt」（userstyles.world/style/539）为参考，允许为对比度做小幅调整 |
| C7 | 响应式：小屏单栏（对齐参考截图），大屏两栏，正文宽度 ≤ 800px |
| C8 | 图片默认占满容器宽度 |

## 3. 功能范围

### v1 包含

- S1 账号登录 / 登出 / 登录态检测 / 过期提示
- 常用板块（底部横向滚动 tabs，本地可增删排序）
- 板块帖子列表（分页、隐藏置顶、左侧回复数徽章、已读标记、新增回复数）
- 帖子阅读（楼层号、作者、时间、正文、引用、图片、附件链接、分页、页内跳楼）
- 引用跳转：点引用头部跳到被引用的那一楼；被引用楼若又引用别人，可继续跳
- 阅读进度：独立记录最近进入时间、回复数基线与 pid / 楼号 / 页码位置，下次打开定位到该楼
- 浏览历史页（按最近阅读排序）
- 设置：账号（就地登录/退出）、访问令牌、正文字号、省流量模式、图片缓存管理
- PWA 安装、app shell 离线可用

### v1 明确不做

| 项 | 原因 |
|---|---|
| 发帖 / 回复 / 编辑 / 收藏 | 需求约定只读 |
| 搜索 | Discuz 搜索需 formhash、易触发限制、慢；列表排序已够用 |
| 点评（楼中楼短评） | 手机版 HTML 中 `#comment_*` 全为空容器，需额外 AJAX |
| 评分明细 / 投票交互 / 隐藏内容解锁 | 只读边界，性价比低 |
| 未读/已读精确判定 | 列表 HTML 无未读标记；已读标记与回复数差值语义见 D10 |
| 头像 | 每页 40 次额外图片请求，参考截图亦未展示 |
| 分类标签（#新闻 等） | 与参考截图一致，列表保持干净 |
| 帖内「输入楼层号跳转」 | 楼号不连续（删帖留空），无 pid 映射，只做页码跳转 |
| 帖子内容离线缓存 | v1 离线仅 app shell + 本地历史/板块 |
| 深色模式 | v1 只做亮色（令牌结构预留） |
| 多账号同时在线 | 单 jar 单会话；换账号即换分区，历史自动隔离 |

## 4. 决策记录

| ID | 决策 | 备注 |
|---|---|---|
| D01 | 凭证存 **IndexedDB cookie jar**，API 请求经 `X-S1-Cookie` 头带出 | 不用浏览器 cookie jar；worker 不落盘 |
| D02 | 历史分区键 = `HMAC-SHA256(uid, HISTORY_SECRET)`；uid 由 worker 用请求携带的 cookie 探得（内存缓存 10 分钟） | 多设备自动同步；D1 无明文身份、无凭证 |
| D03 | 只读边界 = 正文 + 引用 + 图片 + 附件链接 | |
| D04 | 常用板块存本地 IDB，排序用「上移/下移」按钮 | 不引入拖拽库 |
| D05 | 图片统一经 worker 代理，客户端 `fetch → blob` + Cache API 持久缓存 | 不用 Service Worker 注入头 |
| D06 | worker 强制固定移动端 UA，保证模板唯一 | 客户端 UA 不透传 |
| D07 | worker **不跟随重定向**（图片除外），由客户端处理 3xx | 这是登录拿 Set-Cookie、`findpost` 定位的前提 |
| D08 | `Set-Cookie` 以 `X-S1-Set-Cookie`（base64 JSON）暴露给客户端 | 多值无法通过 JS 读多个 Set-Cookie |
| D09 | 历史缺失时降级链：pid 定位 → 记录页 → 第 1 页；页码超界 → 末页 | |
| D10 | 新回复数 = `max(0, listSnapshot.replies - read.replies)`；已读标记仅由 `openedAt > 0` 决定 | 不涉及楼层；成功刷新帖子内容可用可靠计数更新基线，未知计数保留旧值 |
| D11 | 「读过」标记用绿 `--bnd`，「新增回复」用橙 `--secp` | 两个信号不打架 |
| D12 | 列表不显示作者与分类标签 | 与参考截图一致 |
| D13 | 引用块：有 `goto=findpost&pid=&ptid=` 才可点，否则纯展示 | 已实测 27 个引用块中 23 个带链接 |
| D14 | worker 支持可选 `ACCESS_TOKEN`，**默认开启**，客户端在设置页填写 | `GET /api/config` 探测 |
| D15 | 大屏两栏，左栏 360px 可折叠，右栏内容 `max-width: 800px`；右栏不自动打开上次帖子 | |
| D16 | 路由 `/f/<fid>[/<page>]`、`/t/<tid>[/<page>][#pid]`；除"列表→详情"外一律 replace | 见 navigation.md |
| D17 | 详情页横向滑动返回，**总是回到该板块列表**；不使用浏览器历史栈语义 | 固定层级，无全局后退按钮 |
| D23 | 顶栏为浮层，向下滚动隐藏、向上/回顶显示；列表页同样适用 | 见 navigation.md §3 |
| D24 | 列表页下拉刷新，移除全局刷新按钮；管理入口收进设置 | 见 navigation.md §4/§6 |
| D18 | 服务端零 HTML 解析、零 HTML 缓存 | 避免跨用户泄漏与状态分叉 |
| D19 | 不引入服务端框架，core 层是纯 `Request → Response` | 迁移成本最小化 |
| D20 | 单包（不分 workspace）：`src/` `worker/` `shared/` `docs/` | KISS |
| D21 | 未登录可浏览游客可见内容，但**不记历史**、不显示历史 UI | 无身份即无分区 |
| D22 | 多设备按事件字段组并合：metadata/read/position 各比较 `(at, event UUID)`，`openedAt` 独立取新值 | 元数据由请求版本决定，不按标题文本比较；位置不刷新元数据。UUID 确定性破平，客户端时钟偏差仍可能影响跨设备先后 |

## 5. 技术选型

| 层 | 选择 |
|---|---|
| 前端框架 | React 19 + TypeScript 5.9（strict） |
| 构建 | Vite 8 + `vite-plugin-pwa`（M5 接入） |
| 样式 | Tailwind CSS v4（CSS 变量驱动设计令牌） |
| 组件 | shadcn/ui 源码内联（Radix 无头原语）：Dialog / Sheet / DropdownMenu / Switch / Toast / Tabs |
| 路由 | TanStack Router（代码式路由） |
| 数据 | TanStack Query v5 |
| HTML 解析 | 原生 `DOMParser` + 集中式选择器模块（不引 cheerio） |
| HTML 清洗 | DOMPurify |
| 图标 | lucide-react |
| 服务端 | Cloudflare Workers（`Request → Response` core）+ Static Assets + D1 |
| 测试 | Vitest（parser 夹具单测） |

## 6. 文档索引

| 文件 | 内容 |
|---|---|
| [architecture.md](./architecture.md) | 拓扑、请求流、代理契约、凭证与安全、迁移 seam |
| [design-system.md](./design-system.md) | 色板与对比度、排版、布局线框、组件规格、交互 |
| [data-model.md](./data-model.md) | D1 表结构、API 契约、客户端存储、缓存与写队列 |
| [parser.md](./parser.md) | Discuz 手机版 DOM 选择器规范、DTO、降级与容错、测试 |
| [roadmap.md](./roadmap.md) | 里程碑、验收标准、风险 |

## 7. 术语

- **上游 / upstream**：`stage1st.com` 及其子域。
- **代理**：worker 的 `/api/proxy`、`/api/img`、`/api/file`。
- **楼层 / floor**：Discuz 帖子序号，首楼显示「楼主」，其余为数字；**不保证连续**（删帖会留空）。
- **pid**：单个帖子的全局 ID，是楼层定位的唯一稳定标识。
- **tid / fid**：主题 ID / 版块 ID。
- **userKey**：`HMAC-SHA256(uid, HISTORY_SECRET)`，历史记录分区键；D1 中不含明文 uid。
- **身份探针**：worker 用 cookie 向上游请求一次 `forum.php?mobile=2` 提取 `discuz_uid`，结果在 isolate 内存缓存 10 分钟。
- **访问令牌**：部署级 `ACCESS_TOKEN`，防止他人白用你的代理，与身份无关。
