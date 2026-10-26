# 数据模型与 API 契约

## 1. 身份与分区

```
cookie (X-S1-Cookie) ──探针──► uid ──HMAC-SHA256(HISTORY_SECRET)──► userKey
```

| 概念 | 说明 |
|---|---|
| `uid` | S1 用户 ID，从任意上游页面的 `discuz_uid = '(\d+)'` 提取 |
| `userKey` | `base64url(HMAC-SHA256(utf8(uid), HISTORY_SECRET))`，D1 中唯一身份标识 |
| 未知身份 | 请求未带 cookie 或 `uid=0` → 历史接口返回 `401 auth_required` |

- 多设备：同一 S1 账号 ⇒ 同一 uid ⇒ 同一 userKey ⇒ 同一分区（自动同步）。
- 换账号：cookie 变 ⇒ uid 变 ⇒ 分区自动隔离。
- 探针结果在 isolate 内存 LRU 缓存（key = `sha256(cookie)`，TTL 10 分钟，容量 100）。

## 2. D1 表结构（reading schema 2）

`migrations/0001` 与 `0002` 是保留的审计历史；新结构由 `migrations/0003_reading_state.sql` 建立。它只 DROP/rebuild `progress`，有意清空全部旧阅读记录，其他 D1 数据不动。

```sql
CREATE TABLE progress (
  user_key             TEXT NOT NULL,
  tid                  INTEGER NOT NULL,
  fid                  INTEGER NOT NULL DEFAULT 0,
  forum_name           TEXT NOT NULL DEFAULT '',
  title                TEXT NOT NULL DEFAULT '',
  metadata_at          INTEGER,
  metadata_id          TEXT,
  opened_at            INTEGER NOT NULL DEFAULT 0,
  read_at              INTEGER,
  read_id              TEXT,
  read_replies         INTEGER,
  position_at          INTEGER,
  position_id          TEXT,
  position_pid         INTEGER,
  position_floor       INTEGER,
  position_page        INTEGER,
  position_total_pages INTEGER,
  PRIMARY KEY (user_key, tid)
) WITHOUT ROWID;
CREATE INDEX idx_progress_recent ON progress
  (user_key, MAX(opened_at, COALESCE(read_at, 0), COALESCE(position_at, 0)) DESC);
```

`openedAt` 表示最近一次进入帖子的时刻；`read` 和 `position` 是两个独立事件组。标题与板块信息另按 `metadataVersion: {at,id}|null` 合并，使用实际取得帖子/板块元数据的网络请求版本；仅保存位置不能刷新元数据版本或改写标题、fid、forumName，也不按标题文本新旧比较。元数据、read、position 各自按 `(at, id)` 比较：较新的毫秒时间胜出，同毫秒按规范小写 UUID `id` 字典序决定，保证多设备合并确定性。数据观察的 `at` 在发起对应网络请求时生成；读缓存、上传、重试不得生成新时间/ID。位置事件只在观察到位置变化时生成时间/ID；`openedAt` 在进入时独立更新。客户端时钟偏差仍可能影响跨设备新旧判断。

列表/历史排序按派生时间 `max(openedAt, read.at, position.at)`，不是一个可写的全局 `updatedAt`。

## 3. 存储接口（迁移 seam）

```ts
export interface ProgressRow {
  tid: number; fid: number; forumName: string; title: string;
  metadataVersion: { at: number; id: string } | null;
  openedAt: number;
  read: { replies: number; at: number; id: string } | null;
  position: {
    pid: number; floor: number | null; page: number;
    totalPages: number; at: number; id: string;
  } | null;
}
```

`ProgressStore` 提供按用户列出/索引、upsert、单条删除与清空；服务端 `index` 用于后台补齐已读状态，本地列表查询不直接请求它。索引类型是 `Pick<ProgressRow, 'tid'|'openedAt'|'read'>`。D1 持久化层将嵌套事件映射到上面的列。

## 4. API 契约

所有端点同源，无 CORS。除 `/api/config`、`/api/health` 外都要求 `X-App-Token`（部署开启时）。

### 4.1 `GET /api/config`

```json
{ "authRequired": true, "version": "1.0.0" }
```

### 4.2 `GET /api/health`

```json
{ "ok": true, "version": "1.0.0" }
```

### 4.3 `GET|POST /api/proxy?u=<encoded-absolute-url>`

| 项 | 值 |
|---|---|
| host 白名单 | `stage1st.com`、`*.stage1st.com` |
| 请求头透传 | 仅 `X-S1-Cookie` → `Cookie`；其余（UA/Accept-Language）由服务端固定 |
| 重定向 | **不跟随**。上游 3xx → 200 JSON `{ "redirect": { "status": 301, "url": "https://stage1st.com/2b/…" } }`，`url` 已绝对化（保留 `#pid`） |
| 响应头 | `Content-Type`、`X-S1-Set-Cookie`、`X-Upstream-Url`、`X-Upstream-Status`、`Cache-Control: no-store` |
| body | 上游原始 HTML，不做任何改写 |
| POST | `application/x-www-form-urlencoded`，body ≤ 16KB |
| 超时 | 15s |

客户端 `proxyFetch()` 负责跟随：3xx 且 hop < 5 → 把 `url` 重编码成 `/api/proxy?u=` 再请求；超限报 `too_many_redirects`。

`X-S1-Set-Cookie` 编码：`base64url(JSON.stringify([{name, value, expires}], …))`，仅当上游 host 在白名单内才产出。

### 4.4 `GET /api/img?u=<encoded-absolute-url>`

| 项 | 值 |
|---|---|
| host | 任意公网（拒绝私有/环回/链路本地/元数据地址、非 http(s)） |
| 请求头 | `Referer: https://stage1st.com/2b/`；`Cookie` 仅当目标 host 属于上游 |
| 重定向 | 跟随，≤ 4 跳 |
| 校验 | `Content-Type` 必须 `image/*`；大小 ≤ 12MB |
| 缓存 | `Cache-Control: private, max-age=31536000, immutable` |
| 其它 | `X-Upstream-Url` 返回最终地址 |

### 4.5 `GET /api/file?u=<encoded-absolute-url>`

附件下载：host 同上（实际只会是上游），不限 `Content-Type`，≤ 50MB，`Cache-Control: no-store`，透出 `Content-Disposition`。客户端取回 blob 后触发浏览器下载，避免直连上游掉登录态。

### 4.6 历史接口（均需 `X-S1-Cookie` 与 `X-Reading-Schema: 2`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/history?limit=50&offset=0` | 历史列表（按派生最近事件时间排序） |
| GET | `/api/history/index?limit=1000` | 服务端历史读取；列表徽章索引仅用本地数据 |
| PUT | `/api/history/:tid` | 合并单条 |
| DELETE | `/api/history/:tid` | 删除单条 |
| DELETE | `/api/history` | 清空当前用户 |

所有历史端点要求 `X-Reading-Schema: 2`；旧客户端缺少/发送不匹配版本时返回 `409 reading_schema_mismatch`。成功 JSON 响应带 `schemaVersion: 2`，不提供旧格式兼容。

`PUT /api/history/:tid` 请求体（事件组可独立合并）：

```json
{
  "fid": 51, "forumName": "ＰＣ数码", "title": "【论坛美化】S1 NUX",
  "metadataVersion": { "at": 1792893264123, "id": "00000000-0000-4000-8000-000000000001" },
  "openedAt": 1792893264000,
  "read": { "replies": 580, "at": 1792893264123, "id": "00000000-0000-4000-8000-000000000001" },
  "position": {
    "pid": 43400000, "floor": 12, "page": 1, "totalPages": 15,
    "at": 1792893264124, "id": "00000000-0000-4000-8000-000000000002"
  }
}
```

任一事件组可为 `null`；`read.replies` 是非负整数（真实 0 有效），未知计数不生成新 read 事件并保留已有基线。响应：`{ "ok": true, "schemaVersion": 2 }`。

`GET /api/history` 响应：

```json
{
  "ok": true, "schemaVersion": 2,
  "items": [
    { "tid": 1826103, "fid": 51, "forumName": "ＰＣ数码", "title": "…",
      "metadataVersion": { "at": 1792893264123, "id": "00000000-0000-4000-8000-000000000001" },
      "openedAt": 1792893264000,
      "read": { "replies": 580, "at": 1792893264123, "id": "00000000-0000-4000-8000-000000000001" },
      "position": { "pid": 43400000, "floor": 12, "page": 1, "totalPages": 15,
                    "at": 1792893264124, "id": "00000000-0000-4000-8000-000000000002" } }
  ]
}
```

`GET /api/history/index` 响应：

```json
{ "ok": true, "schemaVersion": 2, "items": [{ "tid": 1826103, "openedAt": 1792893264000, "read": { "replies": 580, "at": 1792893264123, "id": "00000000-0000-4000-8000-000000000001" } }] }
```

### 4.7 错误体

```json
{ "ok": false, "code": "auth_required", "message": "登录已过期" }
```

| HTTP | code | 客户端处理 |
|---|---|---|
| 400 | `bad_request` / `blocked_address` | 内部错误提示 |
| 401 | `token_required` / `token_invalid` | 打开访问令牌设置 |
| 409 | `reading_schema_mismatch` | 更新到 schema 2 客户端 |
| 401 | `auth_required` | 「登录已过期」提示 → 设置 → 账号内就地登录 |
| 403 | `forbidden_host` | 内部错误提示 |
| 413/415 | `too_large` / `not_image` | 图片/附件提示 |
| 502 | `upstream_error` / `upstream_blocked` | toast + 重试 |
| 502 | `too_many_redirects` | 内部错误提示 |
| 504 | `upstream_timeout` | toast + 重试 |

## 5. 客户端存储

### 5.1 IndexedDB（`s1read`，version 2）

v2 有意重置 `progress` 与 `outbox`；保留凭证、session、偏好、板块和图片数据。

| store | key | value | 说明 |
|---|---|---|---|
| `kv` | `appToken` | `string` | 访问令牌 |
| `kv` | `session` | `{uid:number, username?:string, at:number}` | 登录态缓存（uid 来自页面解析） |
| `kv` | `readingOwner` | `number` | 最近阅读数据所属 uid；即使 session 过期也用于避免账号数据串用 |
| `jar` | `main` | `{cookies: {name,value,expires?}[]}` | S1 凭证唯一存放点 |
| `progress` | `tid` | `ProgressRow` | 本地进度镜像（离线可用、列表着色） |
| `outbox` | `tid` | `{accountId:number, row:ProgressRow}` | 待上传合并载荷；每帖一条，按事件组归并并绑定账号 |
| `boards` | `list` | `{fid, name}[]` | 常用板块（数组顺序即 tab 顺序） |
| `imgMeta` | `url` | `{size:number, lastUsed:number}` | 图片缓存 LRU 记账 |
| `meta` | `listScroll:<fid>` | `number` | 列表滚动位置 |

### 5.2 localStorage（同步读取的偏好）

```json
// key: s1r:prefs
{ "fontSize": 17, "dataSaver": false, "edgeSwipe": false, "leftPane": true }
```

### 5.3 图片缓存

`caches.open('s1-img-v1')`，key = `/api/img?u=…`。
`imgMeta` 记录字节数与最近访问时间；**超过 7 天未访问**的条目在启动/新图入库后清理，总占用 > 500MB 时再按 `lastUsed` 淘汰。
站内表情（`static.stage1st.com/image/smiley/`）是固定静态资源，不做 7 天过期，但仍参与 500MB LRU。
设置页显示本站占用（`imgMeta` 汇总）与 `navigator.storage.estimate().usage`，可一键清空（同时清 Cache、`imgMeta` 与内存 objectURL）。
Cache API 本身没有 TTL，过期判断完全由 `imgMeta.lastUsed` 驱动。

## 6. 数据流与缓存

### 6.1 Query keys 与 TTL

| Query key | TTL | 失效时机 |
|---|---|---|
| `['config']` | 会话 | 手动刷新 |
| `['boards-src']` | 10min | 设置里展开「添加板块」 |
| `['forum', fid]`（无限分页） | 会话，`staleTime/gcTime: Infinity` | 仅下拉/刷新按钮；首次无缓存与追加页正常请求 |
| `['thread', tid, page]` | 60s | 刷新按钮 |
| `['history', uid]` | 60s | 显式刷新、历史增删后 `invalidate` |
| `['progress-index', uid或'guest']` | 60s | 本地事务提交后 `invalidate` |
| `['locate', tid, pid]` | 会话（Map） | 必要时手动清 |

### 6.2 写入流程

```
列表请求开始时固定该次列表观察；仅显式刷新或无限滚动追加才取新快照
进入帖子：立即以列表观察写 openedAt（早于帖子网络加载）
成功取得帖子内容：用可靠回复数更新 read 基线；未知数保留旧基线
位置实际变化：更新 position
上述本地合并先在 IDB 事务提交，再通知 UI；不等待远端
启动/恢复联网：先逐帖 PUT outbox，再 GET 最近完整历史与已读索引，按字段组合并
```

网络观察的时间在请求**开始**时记录，缓存读取及上传/重试不产生新观察事件。每帖 outbox 合并 payload，存为 `{accountId, row}`；提交队列时校验当前 session uid，并忽略其他账号遗留队列。切换 uid 时，在一个 IDB 事务内保存新 session/`readingOwner` 并清空 `progress` 与 `outbox`；owner 即使 session 过期仍可识别旧账号。该操作不清凭证、板块、图片或偏好。flush 每条上传前校验队列 owner 与当前 session，并遵守可选的 active-operation guard；上传器在读取 cookie 后再次核对账号，变更则取消。PUT 成功仅当本地整份 payload 与发送版本仍相同时才确认删除。单帖删除与清空会在同一事务里同时删除镜像及 outbox，不单独清队列。

### 6.3 列表「新增回复」计算

`newCount = max(0, listSnapshot.replies - progress[tid].read.replies)`。不使用 floor。已读标记只看 `openedAt > 0`；`read` 缺失/计数未知时不显示 `+N`。进入时先以列表观察写基线；随后成功加载/刷新帖子内容时，若回复数可靠则更新基线，未知则保留旧值。旧缓存计数不得回退基线；真实较低的新计数允许更新。列表索引完全本地，不为徽章请求服务端。

## 7. 上游与本地字段映射

| DTO 字段 | 来源 | 备注 |
|---|---|---|
| `ThreadPage.replies` | 首楼 `dm-chat-s` 后的数字，或“全部回复”控件总数 | 支持千位分隔；无法确认时为 `null`，与列表徽章同指标 |
| `ThreadSummary.replies` | 列表项 `i.dm-chat-s` 后文本 | 与帖子页共用计数解析；未知为 `null`，徽章显示 `—` |
| `ProgressRow.read.replies` | 列表进入观察；成功取得帖子内容后以可靠 `ThreadPage.replies` 更新 | 未知时保留旧值 |
| `ProgressRow.position.pid/floor` | 当前视口最下方已读楼层 | 位置变更事件独立计时 |
| `ProgressRow.position.totalPages` | `.pg span[title^="共"]` | |

## 8. 限额与假设

- 单请求 body ≤ 16KB（POST 登录表单足够）；历史 PUT ≤ 4KB。
- 历史索引默认 1000 行，上限 2000 行；完整位置默认同步最近 100 条。
- D1 免费额度：读 500 万/日、写 10 万/日 —— 单用户场景绰绰有余。
- 服务端不缓存 HTML，所有页面请求直连上游；带宽由 Cloudflare 出站承担。
