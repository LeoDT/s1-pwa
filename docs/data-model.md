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

## 2. D1 表结构

```sql
-- migrations/0001_init.sql
CREATE TABLE IF NOT EXISTS progress (
  user_key    TEXT    NOT NULL,
  tid         INTEGER NOT NULL,
  fid         INTEGER NOT NULL DEFAULT 0,
  forum_name  TEXT    NOT NULL DEFAULT '',
  title       TEXT    NOT NULL DEFAULT '',
  last_pid    INTEGER,            -- 上次阅读楼层 pid（定位锚点）
  last_floor  INTEGER,            -- 该楼层号（首楼=1），仅展示用
  last_page   INTEGER,            -- 该楼层所在页
  total_pages INTEGER,            -- 当时的总页数
  replies     INTEGER NOT NULL DEFAULT 0,  -- 当时看到的回复数（新增回复 = 列表回复数 - 此值）
  updated_at  INTEGER NOT NULL,   -- 客户端时钟（ms），用于 LWW
  PRIMARY KEY (user_key, tid)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_progress_recent
  ON progress (user_key, updated_at DESC);
```

写入（LWW：仅当客户端时间更新时才覆盖）：

```sql
INSERT INTO progress (user_key, tid, fid, forum_name, title, last_pid, last_floor,
                      last_page, total_pages, replies, updated_at)
VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
ON CONFLICT(user_key, tid) DO UPDATE SET
  fid         = excluded.fid,
  forum_name  = excluded.forum_name,
  title       = excluded.title,
  last_pid    = COALESCE(excluded.last_pid, progress.last_pid),
  last_floor  = COALESCE(excluded.last_floor, progress.last_floor),
  last_page   = COALESCE(excluded.last_page, progress.last_page),
  total_pages = COALESCE(excluded.total_pages, progress.total_pages),
  replies     = excluded.replies,
  updated_at  = excluded.updated_at
WHERE excluded.updated_at >= progress.updated_at;
```

容量估算：单用户 1 万帖 ≈ 2MB，远低于 D1 免费额度（5GB）。保留策略：`GET /api/history?limit=` 限制读取；不做自动清理（可选 `prune` 任务，v1 不做）。

## 3. 存储接口（迁移 seam）

```ts
// server/core/store.ts
export interface ProgressRow {
  tid: number;
  fid: number;
  forumName: string;
  title: string;
  lastPid: number | null;
  lastFloor: number | null;
  lastPage: number | null;
  totalPages: number | null;
  replies: number;
  updatedAt: number;
}

export interface ProgressStore {
  upsert(userKey: string, row: ProgressRow): Promise<void>;
  list(userKey: string, limit: number, offset: number): Promise<ProgressRow[]>;
  index(userKey: string, limit: number): Promise<Pick<ProgressRow, 'tid'|'replies'|'lastFloor'|'lastPage'|'updatedAt'>[]>;
  remove(userKey: string, tid: number): Promise<void>;
  clear(userKey: string): Promise<void>;
}
```

- `server/cf/store.ts` → `D1ProgressStore`（`db.prepare(...).bind(...).run()/all()`）
- 迁 Node 时 → `SqliteProgressStore`（`better-sqlite3`，API 同形）

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

### 4.6 历史接口（均需 `X-S1-Cookie`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/history?limit=50&offset=0` | 历史列表（按 `updated_at DESC`） |
| GET | `/api/history/index?limit=1000` | 轻量索引，用于列表徽章/已读标记 |
| PUT | `/api/history/:tid` | upsert 单条 |
| DELETE | `/api/history/:tid` | 删除单条 |
| DELETE | `/api/history` | 清空当前用户 |

`PUT /api/history/:tid` 请求体：

```json
{
  "fid": 51,
  "forumName": "ＰＣ数码",
  "title": "【论坛美化】S1 NUX",
  "lastPid": 43400000,
  "lastFloor": 12,
  "lastPage": 1,
  "totalPages": 15,
  "replies": 580,
  "updatedAt": 1792893264123
}
```

响应：

```json
{ "ok": true }
```

`GET /api/history` 响应：

```json
{
  "ok": true,
  "items": [
    { "tid": 1826103, "fid": 51, "forumName": "ＰＣ数码", "title": "…",
      "lastPid": 43400000, "lastFloor": 12, "lastPage": 1,
      "totalPages": 15, "replies": 580, "updatedAt": 1792893264123 }
  ]
}
```

`GET /api/history/index` 响应：

```json
{ "ok": true, "items": [{ "tid": 1826103, "replies": 580, "lastFloor": 12, "lastPage": 1, "updatedAt": 1792893264123 }] }
```

### 4.7 错误体

```json
{ "ok": false, "code": "auth_required", "message": "登录已过期" }
```

| HTTP | code | 客户端处理 |
|---|---|---|
| 400 | `bad_request` / `blocked_address` | 内部错误提示 |
| 401 | `token_required` / `token_invalid` | 打开访问令牌设置 |
| 401 | `auth_required` | 「登录已过期」横幅 → 登录页 |
| 403 | `forbidden_host` | 内部错误提示 |
| 413/415 | `too_large` / `not_image` | 图片/附件提示 |
| 502 | `upstream_error` / `upstream_blocked` | toast + 重试 |
| 502 | `too_many_redirects` | 内部错误提示 |
| 504 | `upstream_timeout` | toast + 重试 |

## 5. 客户端存储

### 5.1 IndexedDB（`s1read`，version 1）

| store | key | value | 说明 |
|---|---|---|---|
| `kv` | `appToken` | `string` | 访问令牌 |
| `kv` | `session` | `{uid:number, username?:string, at:number}` | 登录态缓存（uid 来自页面解析） |
| `jar` | `main` | `{cookies: {name,value,expires?}[]}` | S1 凭证唯一存放点 |
| `progress` | `tid` | `ProgressRow` | 服务端历史的本地镜像（离线可用、列表着色） |
| `outbox` | `tid` | `ProgressRow` | 待上传队列（按 tid 去重保留最新） |
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
| `['forum', fid, page]` | 30s | 下拉/刷新按钮、切换板块 |
| `['thread', tid, page]` | 60s | 刷新按钮 |
| `['history']` | 60s | 写入进度后 `invalidate` |
| `['history-index']` | 60s | 同上 |
| `['locate', tid, pid]` | 会话（Map） | 必要时手动清 |

### 6.2 写入流程

```
读帖 → 组件内维护 lastRead（IntersectionObserver 记录最靠下的可见楼层 pid/floor）
   │
   ├─ 每 5s 节流（若发生变化）→ 写本地镜像 + 入 outbox → flush()
   ├─ 路由离开 / visibilitychange(hidden) → flush({keepalive:true})
   └─ flush(): PUT /api/history/:tid → 成功则删除 outbox 记录
                  失败（离线/5xx）→ 留在 outbox，下次 online / 启动重放
```

重放顺序：`updatedAt` 升序，逐条 PUT；服务端 LWW 保证最终一致。

### 6.3 列表「新增回复」计算

```
newCount = max(0, row.replies(列表) - progress[tid].replies(上次阅读快照))
```

`progress` 镜像缺失（未登录/无历史）→ 不显示徽章着色与 `+N`。

## 7. 上游与本地字段映射

| DTO 字段 | 来源 | 备注 |
|---|---|---|
| `ThreadPage.replies` | 首楼 `.mtime em` 第二个数字（`dm-chat-s` 后） | 与列表徽章同指标 |
| `ThreadSummary.replies` | 列表项 `i.dm-chat-s` 后文本 | |
| `ProgressRow.replies` | 进入帖子时取 `ThreadPage.replies` | 快照语义见 overview D10 |
| `ProgressRow.lastPid/lastFloor` | 当前视口最下方已读楼层 | |
| `ProgressRow.totalPages` | `.pg span[title^="共"]` | |

## 8. 限额与假设

- 单请求 body ≤ 16KB（POST 登录表单足够）；历史 PUT ≤ 4KB。
- 历史索引一次最多 1000 行（约 60KB JSON）。
- D1 免费额度：读 500 万/日、写 10 万/日 —— 单用户场景绰绰有余。
- 服务端不缓存 HTML，所有页面请求直连上游；带宽由 Cloudflare 出站承担。
