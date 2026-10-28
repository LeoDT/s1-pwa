# 架构与请求流

## 1. 拓扑

```
┌──────────────────────── 浏览器（唯一理解 S1 的地方）────────────────────────┐
│  React App (SPA)                                                             │
│   ├── router       /f /t /history（设置与登录都是弹层，不占路由）              │
│   ├── parser       DOMParser + 集中选择器 → DTO                                │
│   ├── sanitizer    DOMPurify（帖子正文）                                       │
│   ├── apiFetch()   注入 X-App-Token / X-S1-Cookie                             │
│   ├── cookieJar    IndexedDB（S1 凭证唯一存放点）                              │
│   ├── imageStore   fetch → blob + Cache API（LRU 500MB）                       │
│   ├── progress     本地镜像 + 写入队列（离线可续传）                            │
│   └── ServiceWorker 仅 app shell precache                                     │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ 同源 /api/*（无 CORS）
┌───────────────────────────────▼──────────────────────────────────────────────┐
│  Cloudflare Worker                                                           │
│   server/core/   Request → Response                                          │
│     ├── /api/config          能力探测（免鉴权）                                │
│     ├── /api/health                                                          │
│     ├── /api/proxy           HTML 透传（白名单 + UA 固定 + 3xx 不跟随）         │
│     ├── /api/img             图片代理（跟随重定向、Content-Type 校验、缓存）     │
│     ├── /api/file            附件代理（不限 image、不缓存）                      │
│     └── /api/history*        进度读写（cookie→uid→userKey）                     │
│   server/cf/     Cloudflare 适配层（assets 绑定、D1ProgressStore）              │
└───────────────┬───────────────────────────────────────────────┬──────────────┘
                │ fetch（不带 CF 特有 API）                      │ D1
        ┌───────▼────────┐                                ┌─────▼─────┐
        │ stage1st.com   │                                │  progress │
        │ (nginx/php)    │                                └───────────┘
        └────────────────┘
```

只有执行在浏览器里的代码知道 S1 HTML 长什么样。worker 对 HTML **只做字节转发**，唯一例外是 §2.1 身份探针里的一行 `discuz_uid` 正则（取一个数字，不解析正文）。

### 1.1 可选家庭内容代理

默认仍采用上图的同源部署。配置「家庭代理地址」后，`src/lib/contentProxy.ts` 统一探测并路由 `/api/proxy`、`/api/img`、`/api/file`：优先家庭 Node 节点，失败回退 Cloudflare。`/api/config` 与 `/api/history*` 不参与切换。登录表单、提交及跳转固定节点，POST 不跨节点重放。

`server/node/` 复用 core 的三个内容 handler，仅增加 Node HTTP 适配、必选访问令牌、严格 CORS 和原生 fetch 限制，不提供数据库或静态 UI。家庭 health 需鉴权，返回专用服务标识及协议版本，区别于 Cloudflare health。部署与验收见 [家庭代理部署](./home-proxy.md)。

## 2. 凭证模型

| 凭证 | 存放位置 | 生命周期 | 服务端可见性 |
|---|---|---|---|
| S1 登录 cookie（`B7Y9_2f85_*`） | 浏览器 IDB `jar` | 上游 30 天（`cookietime=2592000`） | 仅在请求期间**过境**，不落盘、不写日志 |
| 访问令牌 `ACCESS_TOKEN` | 浏览器 IDB `kv`（用户手填） | 部署级 | worker 持有明文（`wrangler secret`） |
| 历史密钥 `HISTORY_SECRET` | 仅 worker | 部署级 | 用于派生 userKey，客户端不可见 |
| userKey | D1 `progress.user_key` | 永久 | `HMAC-SHA256(uid, HISTORY_SECRET)`，不可逆推 uid |

**硬性规则**：`X-S1-Cookie` 只允许转发给 `stage1st.com` 与其子域；任何第三方图床/外链请求一律剥离 cookie。此规则实现在 core 的单一函数 `upstreamRequest()` 内，不依赖调用方自觉。

### 2.1 身份解析（历史分区）

"按用户 + 多设备自动同步"要求服务端能把凭证映射到用户，但凭证不落盘。做法：

```
1. 客户端每个 /api/history* 请求带 X-S1-Cookie（与代理共用同一个 jar）
2. worker: ck = sha256(cookie) → 查 isolate 内存 LRU（ck → {uid, exp}，TTL 10min，容量 100）
3. 未命中 → 探针 GET https://stage1st.com/2b/forum.php?mobile=2（6.9KB）
     正则 /discuz_uid = '(\d+)'/
     uid == 0 → 401 { code: 'auth_required' }   （前端提示重新登录）
4. userKey = base64url(HMAC-SHA256(uid, HISTORY_SECRET))
5. 换账号 = 换 cookie = 换 uid = 换分区；登出后历史不可读，重新登录即恢复
```

- 探针是 worker **唯一**读取上游 HTML 字段的地方，只取一个数字，不解析正文、不做改写。
- 内存缓存按 isolate 生效，冷启动最多一次探针；探针失败返回 502，客户端保留本地镜像与写队列稍后重试。
- 未登录（uid=0）：浏览照常，历史接口 401，前端隐藏历史相关 UI。

## 3. 请求流

### 3.1 首次启动

```
GET /api/config ──► { authRequired: true, version }
  ├─ 无 appToken → 全屏引导页（填令牌）
  └─ 有 appToken → 读 IDB jar
        ├─ 有 cookie → 进入应用；首次解析页面里的 discuz_uid
        │     ├─ uid≠0 → 已登录：历史/进度可用
        │     └─ uid=0 → 「登录已过期」横幅，游客模式（不记历史）
        └─ 无 cookie → 游客模式 + 引导登录
```

### 3.2 登录

```
1. GET /api/proxy?u=…/member.php?mod=logging&action=login&mobile=2
   → HTML（含 formhash、questionid 选项、是否有验证码字段）；若上游 3xx 则按 §4.3 转 JSON
2. 客户端解析 formhash（+ 若出现 seccode 则提示「请先在网页端登录一次」）
3. POST /api/proxy?u=…member.php?mod=logging&action=login&loginsubmit=yes&loginhash=…&mobile=2
   body: form-encoded  username / password / questionid / answer / cookietime=2592000
   上游 302 → worker 转为 200 JSON { redirect: { status: 302, url } }，headers 带 X-S1-Set-Cookie
4. 客户端先合并 jar（按 name 覆盖，尊重 expires），再 proxyFetch 跟随 redirect
5. 落地页判断：discuz_uid≠0 → 成功；否则取 .alert_error 文案作为失败原因
```

### 3.3 列表 / 帖子

```
GET /api/proxy?u=…/forum.php?mod=forumdisplay&fid=6&page=2&mobile=2   → ForumPage
GET /api/proxy?u=…/forum.php?mod=viewthread&tid=1826103&page=3&mobile=2 → ThreadPage
```

响应体是上游原始 HTML（不改写、不注入）。客户端用 `<base href>` 或请求 URL 解析相对地址。
正文内的链接/图片在渲染时重写（见 parser.md §7）。

### 3.4 楼层定位（恢复阅读进度 / 引用跳转）

```
GET /api/proxy?u=…/forum.php?mod=redirect&goto=findpost&ptid=1826103&pid=43400000&mobile=2
  ◄── 200 { "redirect": { "status": 301,
        "url": "https://stage1st.com/2b/forum.php?mod=viewthread&tid=1826103&page=3&mobile=2#pid43400000" } }
客户端取 url 的 page=3 与 hash → GET /api/proxy?u=…page=3&mobile=2 → HTML
  → 定位 #pid43400000，滚动 + 高亮 800ms
```

实测上游返回的是**相对** `Location`，worker 解析成绝对地址后放进 JSON。客户端从不收到 3xx（见 §4.3“重定向语义”）。

降级链（无法定位时）：记录页 → 第 1 页；记录页 > `总页数` → 末页。

### 3.5 图片 / 附件

```
ProxyImage 按图片域名分通道：
  stage1st.com 或其子域名 → /api/img → Cache API/blob URL（LRU 记账）
  其他域名 → 原始 URL 直接赋给 <img src>，由浏览器原生加载，不 fetch、不 blob、不进入应用缓存
附件（非图片）：fetch('/api/file?u=…') → blob → 触发下载 / 新标签查看
```

- 仅 stage1st.com 及其真实子域名图片进入代理/blob/cache 通道；域名按 hostname 精确或 `.stage1st.com` 后缀判断，拒绝 `stage1st.com.evil` 等伪装域名。外站图直接用原始 URL，由原生 `<img>` 的 `onLoad/onError` 管理状态，绝不代理回退、fetch 或记入应用图片缓存。
- 正文 HTML 里的图片只带 `data-src`（不带 `src`），否则浏览器会在 DOMPurify/HTML 解析阶段直接请求原图，既绕过代理也会撞防盗链。
- 省流量模式：正文图只渲染占位框，点击才加载；行内图照常加载。域名切换时按新 src 重置状态，避免旧请求结果显示为新图。

### 3.6 阅读进度写入

```
列表请求开始时记录该次观察，缓存快照保持不变，直到显式刷新或无限滚动追加。
进入帖子时立即以列表观察写 openedAt（早于帖子加载）；成功取得帖子内容后以可靠回复数更新 read 基线。
位置实际变化时更新 position；read、position、元数据各自带 at + UUID id，并独立合并。位置写入不更新 `metadataVersion`。
先提交本地 IDB progress/outbox 事务，再通知 UI；不等待远端。应用级 HistorySync 统一调度自动同步：先上传 outbox，再拉取并合并服务端字段组。
启动、恢复联网、回到前台、窗口聚焦时同步；前台每 5 秒尝试上传、每 30 秒拉取，后台停止周期任务。历史面板变为可见时，以 10 秒自动拉取新鲜度判断是否同步。
详情仅负责位置观察与每秒本地保存，隐藏/pagehide/卸载时先保存再请求 keepalive 上传。请求携带 UID，全局调度器串行执行并合并待处理请求；自动合并只通知本地查询更新，不重置滚动或生成新的阅读事件。
每帖一条 `{accountId, row}` outbox；上传前检查 owner 与 session，读 cookie 后再检查账号。成功仅在本地整份 payload 未变化时确认删除。
切换 uid 时原子保存 session/`readingOwner` 并清空本地 progress/outbox；expired session 时仍以 owner 识别旧账号。凭证、板块、图片、偏好不受影响。
单帖移除/清空在同一事务同步删除 progress 与 outbox。时间戳来自对应网络请求开始时；读缓存或上传/重试不生成新事件。
```

## 4. 代理契约

### 4.1 请求头

| 头 | 必需 | 说明 |
|---|---|---|
| `X-App-Token` | 部署开启时 | 常数时间比较，失败 401 `token_invalid` |
| `X-S1-Cookie` | 历史接口必需；代理接口已登录时必带 | 形如 `a=b; c=d`，仅转发给白名单上游 |
| `X-Reading-Schema` | 所有 `/api/history*` 必需 | 固定为 `2`；旧版/缺失返回 409，响应 JSON 带 `schemaVersion: 2` |

客户端 UA、`Accept-Encoding`、`Accept-Language` 一律覆盖为固定值：

```
User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1
Accept-Language: zh-CN,zh;q=0.9
Referer: https://stage1st.com/2b/   （仅图片/附件）
```

### 4.2 响应头

| 头 | 说明 |
|---|---|
| `Content-Type` | 原样透传 |
| `Location` | **不再向客户端渗透**（3xx 已转 JSON，见 §4.3） |
| `X-S1-Set-Cookie` | base64url(JSON `[{name,value,expires}]`)，仅上游域 |
| `X-Upstream-Url` | 实际请求的绝对地址（客户端解析相对路径用） |
| `X-Upstream-Status` | 上游状态码 |
| `Content-Disposition` | 附件文件名 |
| `Cache-Control` | `/api/img` → `private, max-age=31536000, immutable`；其余 `no-store` |

Cloudflare 同源部署不需要 CORS；`X-Upstream-Url` 等自定义头在同源下天然可读。可选家庭代理属于跨域例外，仅允许配置的 PWA origin，并通过 `Access-Control-Expose-Headers` 暴露 Cookie、上游状态及附件文件名响应头。

### 4.3 重定向语义

| 上游响应 | worker 返回 | 客户端行为 |
|---|---|---|
| 2xx / 4xx / 5xx | 原状态码 + 原始 body | 直接使用 |
| 3xx | **200** `{ "redirect": { "status": 301, "url": "<绝对地址，保留 #hash>" } }` | `proxyFetch()` 重新编码为 `/api/proxy?u=` 再请求，最多 5 跳，超限报 `too_many_redirects` |

为什么不让浏览器自己跟随：`fetch(..., { redirect: 'manual' })` 得到的是 opaque 响应，前端读不到 `Location`；让浏览器自动跟随又丢失中间跳转目标（而 `findpost` 定位恰恰需要它）。统一「3xx → JSON」后每一跳都可控，也能逐跳收集 `Set-Cookie`。

### 4.4 白名单与 SSRF 防护

| 端点 | 允许的 host | 附加校验 |
|---|---|---|
| `/api/proxy` | `stage1st.com`、`*.stage1st.com` | 仅 `GET`/`POST`；POST body ≤ 16KB；上游超时 15s |
| `/api/img` | 任意公网 host | 协议仅 `http/https`；拒绝私有/环回/链路本地/元数据地址；`Content-Type` 必须 `image/*`；大小 ≤ 12MB；跟随重定向 ≤ 4 跳 |
| `/api/file` | 只允许上游 host | 大小 ≤ 50MB；`no-store` |

拒绝 DNS 解析到私有网段的实现：仅校验 host 字面量 + `dns.resolve` 结果（Workers 侧用 `fetch` 前置检查 host；对 IP 字面量直接比对，域名拒绝明显内网后缀）。宁可少代理，也不做开放代理。

### 4.5 错误码

| code | HTTP | 客户端文案方向 |
|---|---|---|
| `token_required` / `token_invalid` | 401 | 去设置填/改访问令牌 |
| `forbidden_host` | 403 | 内部错误（不该出现） |
| `blocked_address` | 400 | 内部错误 |
| `upstream_timeout` | 504 | S1 响应超时，重试 |
| `upstream_error` | 502 | 上游异常，重试 |
| `upstream_blocked` | 502 | 可能被限流/验证，稍后再试 |
| `too_large` / `not_image` | 413 / 415 | 图片过大/不是图片 |
| `auth_required` | 401 | 登录已过期 |

统一 body：`{ "ok": false, "code": "...", "message": "..." }`。

## 5. 缓存策略

| 对象 | 位置 | TTL | 说明 |
|---|---|---|---|
| 板块树 | TanStack Query | 10min | 很少变 |
| 帖子列表 | TanStack Query | 30s | 切换板块/下拉刷新失效 |
| 帖子页 | TanStack Query | 60s | 同页内返回不重新请求 |
| 历史索引 | TanStack Query | 60s | 失败时回落到本地镜像 |
| S1 图片 | Cache API | 1 年 immutable | LRU 上限 500MB，可手动清空 |
| 外站图片 | 浏览器原生 HTTP 缓存 | 由图床响应头决定 | 不计入应用缓存或由应用清理 |
| 应用壳（HTML/JS/CSS/图标） | Service Worker precache | 随构建版本更新 | `vite-plugin-pwa` generateSW；`navigateFallback: /index.html`，只接管导航与静态资源，**`/api/*` 不进 SW** |
| 上游页面 HTML | **不缓存** | — | 服务端零缓存（跨用户泄漏 + 状态分叉） |

## 6. 安全清单

1. 凭证只在浏览器；worker 不打印请求头/请求体（`observability` 日志只记路径、状态、耗时、错误码）。
2. 上游 HTML 从不直接进入 `document`：正文经 DOMPurify 清洗后由 **DOM → React 元素** 渲染（不使用 `dangerouslySetInnerHTML`，见 parser.md §7.3），其余字段只取文本。
3. DOMPurify 白名单：保留 `img/font/blockquote/br/a/strong/em/u/strike/ol/ul/li/code/pre/table/tr/td/th/span/div/hr`；移除 `script/iframe/object/embed/style/link/meta/form/input`；事件属性全禁；`style` 属性只允许 `color/background-color/font-size/font-weight/text-align`，且 `url()`、`expression()`、`position:fixed` 一律剥离。
4. `index.html` 加 CSP：`default-src 'self'; img-src 'self' blob: data: https: http:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'`。
5. 所有外链渲染为 `rel="noopener noreferrer" target="_blank"`。
6. 图片代理拒绝非图片 Content-Type，避免被当作通用代理。
7. `ACCESS_TOKEN` 默认开启；`/api/config` 是可匿名访问的唯一端点（只回布尔值）。
8. D1 只存 `HMAC(uid, HISTORY_SECRET)`，既没有明文身份也没有任何凭证；即使 `HISTORY_SECRET` 泄漏，也只能构造 userKey 读历史，无法登录 S1。

## 7. 迁移 seam（Cloudflare → Node + SQLite）

```
shared/            纯类型，无运行时
server/core/       纯 Request→Response + ProgressStore 接口 + 上游访问
server/cf/index.ts export default { fetch(req, env) }：注入 D1ProgressStore、ASSETS、env.ACCESS_TOKEN
```

迁移时改动面：

| 现状 | 迁移后 | 工作量 |
|---|---|---|
| `server/cf/index.ts` | `server/node/index.ts`（`node:http` ↔ `Request/Response` 适配 ~30 行） | 小 |
| `D1ProgressStore` | `SqliteProgressStore`（`better-sqlite3` 的 `prepare().bind().all()` 与 D1 同形） | 小 |
| `ASSETS` 绑定 | `express.static` / `sirv` | 小 |
| `env.DB` | `new Database('data.db')` | 小 |
| `env.ACCESS_TOKEN` / `env.HISTORY_SECRET` | `process.env.*` | 小 |

约束（评审时要 grep 检查）：`server/core/**` 内不得出现 `env.DB`、`caches.default`、`process.env`、`wrangler`、`waitUntil`。
客户端只用 Web 标准（fetch / IDB / Cache API / DOM），迁移后端时零改动。

## 8. 可观测性

- `GET /api/health` → `{ok:true, version}`，供部署后自检。
- worker 结构化日志：`{path, method, status, upstream, error, ms}`，不含请求头与 cookie，路径不含查询串。
- 上游 5xx 额外输出一条 `upstream_5xx`：`{status, method, upstream(路径+查询串), contentLength, tainted, detail(错误页正文前 160 字)}`，用于定位 Discuz `_xss_check` 之类的拒绝；响应体同时转成可读 JSON 错误。
- 客户端错误：解析失败/被限流/登录过期，统一 toast + 可重试；控制台不打凭证。
