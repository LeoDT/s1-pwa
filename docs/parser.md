# Discuz 手机版解析规范

> 所有选择器均于 2026-10-25 用手机 UA 抓取 `stage1st.com/2b` 实测确认。
> 解析器集中在 `src/lib/parser/`，选择器集中在 `selectors.ts`，**任何 DTO 字段都必须能指向一个选择器**。

## 1. 原则

1. 只在浏览器解析（Worker 唯一的 HTML 读取是身份探针的正则，见 architecture.md §2.1）。
2. 解析失败抛 `ParseError(code, detail)`，绝不返回半成品让 UI 猜；UI 有对应中文文案与重试。
3. 选择器只依赖**已验证结构**，不猜类名；S1 改版时只需改 `selectors.ts` + 夹具回归。
4. 不做日期解析（保留上游原文），不做楼号推算（不连续），不拼 URL（一律基于 `new URL(base)`）。
5. 任何 `javascript:` / `data:`（除 `data:image/`）链接丢弃。

## 2. 通用工具

```ts
parseDoc(html: string, requestUrl: string): Document
// DOMParser('text/html')；base = <base href> ?? requestUrl

kindOf(doc): 'viewthread' | 'forumdisplay' | 'index' | 'logging' | 'unknown'
// 读 body.class：pg_viewthread / pg_forumdisplay / pg_index / pg_logging

pageInfo(doc, fallbackPage): PageInfo
// 当前页：.pg > strong 文本 ?? input[name=custompage].value ?? fallbackPage
// 总页数：.pg span[title^="共"] 文本里的数字；无 .pg 时 → 1

isErrorPage(doc): {blocked: boolean, message?: string}
// .alert_error / #messagetext / title 含「提示」/ body.class 不属于已知页面
```

## 3. 登录页（`body.pg_logging`）

| 字段 | 选择器 |
|---|---|
| 提交地址 | `#loginform[action]`（相对 → 绝对） |
| formhash | `input[name=formhash]` |
| 安全提问选项 | `select[name=questionid] option` → `{value, label}` |
| 验证码 | `input[name=seccodeverify]` 存在即视为需要验证码；图片 `#seccode_verify`、hash `input[name=seccodehash]` |
| 错误文案 | `.alert_error` / `#messagetext` / `.jump_c > div:first-child`（实测登录失败走消息页 `.jump_c`，第一行是正文，第二行是「返回上一页」链接） |

提交字段：`formhash, referer, fastloginfield=username, cookietime=2592000, username, password, questionid, answer`。

### 3.1 Discuz 的 `_xss_check()` 陷阱（必须规避）

```php
static $check = ['"', '>', '<', '\'', '(', ')', 'CONTENT-TRANSFER-ENCODING'];
if (isset($_GET['formhash']) && $_GET['formhash'] !== formhash()) system_error('request_tainting');
if ($_SERVER['REQUEST_METHOD'] == 'GET')   $temp = $_SERVER['REQUEST_URI'];
elseif (empty($_GET['formhash']))          $temp = $_SERVER['REQUEST_URI'] . file_get_contents('php://input');
else                                       $temp = '';              // ← 跳过检查
$temp = strtoupper(urldecode(urldecode($temp)));                     // ← 双重解码
// 命中 $check 之一 → system_error('request_tainting') → HTTP 503「您当前的访问请求当中含有非法字符」
```

后果：只要登录 POST 的 query 里没有 `formhash`，**整个 POST body 会被解码两次后扫描**，密码/答案里含 `( ) ' " < >`（或 `%28` 这类序列）就会 503。

实测（2026-10-25，stage1st.com）：

| 请求 | 结果 |
|---|---|
| GET 且 URI 含原始 `(` | **503 request_tainting** |
| POST body 含 `(` / `%28` / `%2528` | 200（S1 这版 POST 分支不扫 body） |
| cookie 值含 `(` / `%09` / `%2528` | 200 |
| UA 含括号（我们的固定 UA 就有） | 200 |

规避方式（已在 `buildLoginRequest()` 实现并有单测）：**登录 POST 的 query 也带上 `formhash=<表单里的值>`**，让 Discuz 走 `else { $temp = ''; }` 分支，彻底跳过 body 扫描——对当前版本无害，对潜在升级也安全。

## 4. 板块树（`body.pg_index`）

```
.forumlist .subforumshow h2 a            → 分组名（如「主论坛」）
.forumlist .sub-forum ul li a[href*=fid=] → 单个板块
    .mtit                                → 名称
    .mtxt span[title]                    → 帖数（title 是精确值）
    .mtxt .mnum                          → 今日帖数
```

`fid` 从 `href` 的 `fid=(\d+)` 提取。

注意：手机版首页只列 **8 个板块**（热门新区 3 + 主论坛 5）。因此「板块管理」除了树内勾选，还提供**手动输入 fid**：提交时抓一次该板块第一页校验，名称取自页面标题，失败则展示 Discuz 的消息页文案（如「外野维护下」）。

## 5. 帖子列表（`body.pg_forumdisplay`）

```
.header h2                              → 论坛名
.threadlist li.list_top                 → 置顶帖，**整条丢弃**
.threadlist li.list                     → 普通帖（class 可能是 "list !mt-0"）
    a[href*=tid=]                       → tid（/tid-(\d+)/ 或 /[?&]tid=(\d+)/）
    em.text-base                        → 标题
    span.text-xs                        → 分类标签（保留字段，UI 不显示）
    .mmc                                → 作者名（UI 不显示）
    .text-gray-400 > div:last-child     → 回复数（如 "159"；`i.dm-chat-s` 同容器）
.pg                                     → 分页（见 §2 pageInfo）
```

列表页**没有**最后回复时间、没有未读标记（已验证）。因此「新增回复」只能由回复数差值推算（见 data-model.md §6.3）。

## 6. 帖子页（`body.pg_viewthread`）

```
.header h2                              → 主题标题
.header .mz a[href*=fid=]               → fid
.viewthread .plc.cl[id^=pid]             → 每个楼层（用后代选择器，不依赖直接子节点）
    .avatar img                          → 头像（不渲染）
    .display                             → 帖子容器（首楼多 class pione）
    ul.authi
        li.mtit span.y                   → 楼号："楼主" = 1，"40#" = 40，缺失 = null
        li.mtit span.z a[href*=uid=]     → 作者名 + uid
        li.mtime                         → 时间文本（首楼另有 <span class="y"> 阅读/回复数）
            首楼 i.dm-eye + em           → 阅读数
            首楼 i.dm-chat-s + em        → 本主题回复数（ThreadPage.replies）
    .message                             → 正文（可能以 <i class="pstatus"> 开头 = 编辑说明）
        div.quote > blockquote           → 引用块（见下）
    .threadlist_foot, #comment_<pid>      → 忽略（点评为空容器，需额外 AJAX，v1 不做）
.pg                                     → 分页（含 #multipage_url 模板，可忽略）
```

首楼识别：`floor === 1`（不依赖 `pione` 类）。

回复数按 `dm-chat-s` 标识后的 `em` 读取，缺失时回退到 `.viewthread .txtlist > .mtit.cl` 的“全部回复”直接控件；不从正文文本推断。支持 `18,194` 等千位分隔计数，真实 0 保留，缺失或非法值为 `null`。

楼层与回复总数统一用后代选择器：Discuz 截断引用时可能把 `<strike>` 等格式化标签截在中间，HTML 解析器会把后续楼层包进这个游离元素，直接子节点选择器会漏掉 18583 楼之后的帖子。

正文与独立 HTML 块首尾的空白、无用 `<br>` 会清理并丢弃空块；清理可沿包装层递归，但只处理整体边界，保留正文内部换行和 `pre/code` 内容。

被屏蔽帖：`.message` 里**只有一个不含 `blockquote` 的 `div.quote`**，内容为 `提示: 作者被禁止或删除 内容自动屏蔽` → `Post.hidden = true`、`blocks = []`。
（不能只看文字：正常楼层引用被屏蔽帖时也会出现同样文字；楼号也可能照常存在，所以不能靠 `floor` 判断。）

### 6.1 引用块

```html
<div class="quote"><blockquote>
  <font size="2"><a href="https://stage1st.com/2b/forum.php?mod=redirect&amp;goto=findpost&amp;pid=43405671&amp;ptid=1826103" target="_blank"><font color="#999999">とげちー 发表于 2019-4-22 18:30</font></a></font><br />
  感谢，刚好最近页面变宽了看着很难受
</blockquote></div>
```

| 字段 | 规则 |
|---|---|
| `pid` / `tid` | 第一个 `a[href*="goto=findpost"]` 的 `pid=` / `ptid=`；没有则为纯引用 |
| `header` | 该 `a` 的文本（`用户名 发表于 时间`） |
| `html` | `blockquote` 内容去掉头部链接/包装后剩余部分，并清理首尾空白与 `<br>` |

实测 27 个引用块中 23 个带 `pid`（无 `pid` 的多为「作者被禁止或删除」）。**不带 `pid` 的引用不可点**，不显示可点击样式与箭头。

### 6.2 图片

正文中的交互图片不会保留在上游外层链接或跳帖按钮内；混排时仅文字部分保留链接。原图、重试、省流量加载和灯箱各自处理交互，避免嵌套链接取消原图打开。

| 情况 | 取哪个地址 |
|---|---|
| 普通外链图 | `img[src]` |
| 站内附件图 | `img[zoomfile]` 或 `img[file]` 优先（原图），`src` 作缩略图 |
| 表情 | `img[smilieid]` → 行内 20px，不进入灯箱 |

地址一律 `new URL(src, base).href`，仅保留 `http/https` 与 `data:image/`。

**输出到渲染层时只写 `data-src`、不写 `src`**：DOMPurify 内部用 `innerHTML` 解析片段，带 `src` 会导致清洗阶段浏览器提前请求。渲染器只读 `data-src` 并交给 `ProxyImage`，由组件按域名决定加载通道。单测 `tests/parser-content.test.ts` 会检查 `<img>` 不含 `src`。

### 6.3 附件

`a[href*="mod=attachment"]` → `{ url, name: a.textContent }`。渲染为独立附件按钮（`/api/file?u=` 下载），不内联进正文。

### 6.4 iframe / 视频

`iframe, embed, object, video` 一律不渲染，替换为 `[媒体] 打开原页` 链接（指向其 `src`，仅 `http/https`）。

## 7. 内容重写规则

渲染前对 `Post` 的每个 HTML 片段做两件事：**URL 重写** 与 **标签清洗/映射**。

### 7.1 链接

| 上游形态 | 应用内行为 |
|---|---|
| `forum.php?mod=viewthread&tid=T…` / `thread-T-P-1.html` | 站内路由 `/t/T/P` |
| `forum.php?mod=forumdisplay&fid=F…` | `/f/F` |
| `forum.php?mod=redirect&goto=findpost&pid=P&ptid=T` | 「跳到该楼」（§8） |
| 其它 `stage1st.com` 链接 | 新标签打开原始地址（不代理） |
| 站外 `http(s)` | 新标签 + `rel="noopener noreferrer"` |
| `javascript:` / 其它协议 | 丢弃 |

站内 `?mobile=2`、`&extra=…`、`&page=` 等参数在生成路由时全部剥离（页码由路由承载）。

### 7.2 图片

`<img>` 不在 HTML 字符串里渲染：清洗阶段把每个图片元素替换成占位节点，由 React 渲染器映射为 `<ProxyImage>`。仅 `stage1st.com` 及其真实子域名走 `fetch → blob` + Cache API；其他域名直接作为原生 `<img src>` 加载，不 fetch/blob/代理回退，也不记入应用缓存。外站图使用原生 `onLoad/onError` 管理加载与失败重试。

### 7.3 清洗与「DOM → React」渲染

不用 `dangerouslySetInnerHTML`。流程：

```
message HTML
  → DOMPurify.sanitize(html, {RETURN_DOM_FRAGMENT: true, ALLOWED_TAGS, ALLOWED_ATTR})
  → renderNodes(fragment) → React 元素
        img      → <ProxyImage>（占位已在上一步注入 url）
        a        → <SmartLink>（按 §7.1 路由/外链）
        font     → <span style={mapFont(size,color,face)}>
        blockquote/quote → 由 §6.1 单独构造
        其它白名单标签 → 原生标签 + 固定 className（忽略上游 class/style，防样式污染）
```

白名单标签：`a, b, strong, i, em, u, s, strike, br, p, div, span, font, blockquote, ol, ul, li, code, pre, table, thead, tbody, tr, th, td, hr, img, sub, sup`。
白名单属性：`href, src, alt, title, color, size, face, colspan, rowspan`。
`font[size]` 映射（rem）：1→0.75rem(12)、2→0.875rem(14)、3→1rem(16)、4→1.125rem(18)、5→1.5rem(24)、6→2rem(32)、7→3rem(48)，上限 48px。

护栏：单帖节点数 > 5000 时只渲染前 5000 个并提示；`<table>` 宽度用 `overflow-x: auto` 包裹。

## 8. 楼层定位

```ts
locatePid(tid: number, pid: number): Promise<{ page: number; hash: string }>
// GET /api/proxy?u=<findpost 地址>   → 200 { redirect: { status, url } }
// 从 url 取 page=(\d+) 与 #pid(\d+)
```

规则：

1. 目标 pid 已在当前已加载页的 `posts` 中 → 直接滚动，不发请求。
2. 否则 §8 定位成功 → 路由到 `/t/<tid>/<page>#pid<pid>`（**push**，保证返回可用）。
3. `findpost` 失败（网络/结构变化）→ 回落到历史里记录的页；还不存在 → 第 1 页；页 > `totalPages` → 末页。
4. 部分帖子被删导致 `redirect` 指向的页不含该 pid（Discuz 行为）→ 落在该页顶部，不报错。

同帖内的引用跳转、历史恢复、路由带 `#pid` 三种入口共用此函数。

## 9. DTO

```ts
// shared/types.ts
export interface PageInfo { page: number; totalPages: number }

export interface Board { fid: number; name: string; threads?: number; today?: number }
export interface BoardGroup { name: string; boards: Board[] }

export interface ThreadSummary { tid: number; title: string; replies: number | null; typeTag?: string }

export interface ForumPage extends PageInfo {
  fid: number
  name: string
  threads: ThreadSummary[]
}

export interface ThreadPage extends PageInfo {
  tid: number
  fid: number
  title: string
  replies: number | null   // dm-chat-s 或“全部回复”总数；无法确认时为 null
  opUid: number | null
  posts: Post[]
}

export interface Post {
  pid: number
  floor: number | null     // 楼主 = 1；被屏蔽 = null
  authorName: string
  authorUid: number | null
  postedAt: string         // 上游原文，如 "2019-4-23 14:41"
  editedNote?: string
  hidden?: boolean
  blocks: PostBlock[]
  images: string[]         // 绝对地址（含 zoomfile 原图）
  attachments: Attachment[]
}

export type PostBlock =
  | { kind: 'html'; html: string }
  | { kind: 'quote'; pid?: number; tid?: number; header?: string; html: string }

export interface Attachment { url: string; name: string }

export interface LoginForm {
  action: string
  formhash: string
  question: { value: string; label: string }[]
  captcha?: { imageUrl: string; hash: string }
}

export interface Session { uid: number; username?: string }
```

`Session.username` 的解析路径需登录后实测补全（候选：顶栏 `.my` 内链接文本 / `home.php?mod=space&do=profile` 的 `.vwmy`）。**解析不到时只显示 uid**，不阻塞流程。

## 10. 降级与错误

| 场景 | 处理 |
|---|---|
| 页面被限流/验证（非已知 `body.class`） | `ParseError('upstream_blocked')` → 「S1 返回了异常页面，稍后再试」+ 重试 |
| 列表空（全部置顶被滤掉） | 显示空态，不报错 |
| 楼层号缺失 | `floor=null`，只显示作者与时间 |
| 引用缺 pid | 纯展示 |
| 图片 URL 非法 | 跳过该图，占位「图片不可用」 |
| `totalPages` 解析失败 | 视为 1，隐藏翻页 |
| HTML 结构变化 | 抛 `ParseError('structure_changed')`，UI 提示并输出诊断日志（不含帖子正文） |

## 11. 夹具与测试

```
tests/fixtures/
  forumdisplay-fid6-p1.html
  viewthread-1826103-p1.html     (41 帖 / 27 引用 / 表情 / 外链图)
  index.html                     (板块树)
  login.html                     (无验证码)
  login-fail.html                (错误密码 → 消息页「登录失败，您还可以尝试 N 次」)
  findpost-redirect.txt          (301 响应头摘录)
```

- `pnpm fixtures`：用手机 UA 抓取上述页面写入 `tests/fixtures/`（只读公开页面，无需登录）。
- 单测断言：楼层数、首楼 floor=1、被屏蔽帖 hidden、引用 pid 提取、回复数、总页数、图片绝对化、板块树数量。
- 结构变化时先更新夹具，再改选择器，保证回归有意义。

## 12. 已知不支持 / 待实测

| 项 | 状态 |
|---|---|
| 点评（楼中楼） | 不支持（HTML 无内容，需 AJAX） |
| 隐藏内容（回复可见） | 保持隐藏 |
| 投票 / 评分明细 | 不渲染 |
| 登录后用户名解析 | 待实测（登录后补 §9 选择器） |
| 引用指向**其它主题** | 已支持（`ptid` ≠ 当前 tid 时路由到 `/t/<ptid>/<page>`） |
| 楼中楼/`#comment_` | 一律忽略 |
| 图片 `width/height` 缺失导致布局位移 | 接受（占位 120px 最小高 + 渐显） |
