# 设计系统

配色以「红茶Alt」（`userstyles.world/style/539` 的 `theme_tea_alt`）为基准，仅为满足对比度做了三处明度派生（`--color-heading`、`--color-muted`、`--color-danger`），色相全部沿用原色板。

## 1. 色彩令牌

### 1.1 语义名 ↔ 原始值

| 语义变量 | 值 | 来源（tea_alt） | 用途 |
|---|---|---|---|
| `--color-canvas` | `#f6f7eb` | `--bg` | 页面底色 |
| `--color-panel` | `#d0d7bb` | `--pri` | 顶栏、底部条、Sheet 头部 |
| `--color-panel-light` | `#d7dec7` | `--pril` | 徽章底、引用块底、骨架屏 |
| `--color-line` | `#cccc99` | `--prid` | 所有 1px 分隔线/描边 |
| `--color-accent` | `#689d6a` | `--bn` | 装饰性绿（进度指示、focus 辅助） |
| `--color-accent-strong` | `#427b58` | `--bnd` | 主按钮底、**已读**标记、active tab 下划线 |
| `--color-flag` | `#d65d0e` | `--sec` | 橙色装饰（图标、大字强调、描边） |
| `--color-flag-strong` | `#af3a03` | `--secp` | **新增回复**数字、链接 hover、楼层高亮 |
| `--color-text` | `#504945` | `--t` | 正文、顶栏文字 |
| `--color-heading` | `#3f3a35` | 派生（t 加深） | 标题、Sheet 标题 |
| `--color-muted` | `#6b6157` | 派生（tg 加深） | 元信息（楼号/时间/计数） |
| `--color-link` | `#076678` | `--pt` | 正文内链接 |
| `--color-link-hover` | `#af3a03` | 同 flag-strong | 链接:hover + 下划线 |
| `--color-danger` | `#9c2c2f` | 派生（新增） | 错误文案、危险按钮、Toast(error) |
| `--color-on-accent` | `#fbfcf2` | 派生 | 强调色上的文字 |
| `--color-overlay` | `rgba(63,58,53,.45)` | 派生 | 遮罩 |

不使用 `--tg (#928374)` 作为文字色（见 1.2）。

### 1.2 对比度实测（WCAG）

| 前景 | on `--color-canvas` | on `--color-panel` | on `--color-panel-light` | 结论 |
|---|---|---|---|---|
| `--color-text` | 8.16 | 5.93 | 6.37 | ✅ 任意字号 |
| `--color-heading` | 10.40 | 7.56 | 8.12 | ✅ 任意字号 |
| `--color-muted` | 5.59 | 4.07 | 4.37 | ✅ canvas 任意字号；panel/panel-light 上只用 ≥14px 元信息 |

滚动条统一细条（`scrollbar-width: thin` / 8px），thumb `--color-line`、hover `--color-accent-strong`、track 透明。
| `--color-link` | 6.11 | 4.44 | 4.77 | ✅ 正文；顶栏上改用 `--color-text` 或加深 |
| `--color-accent-strong` | 4.62 | 3.36 | 3.61 | ✅ 仅 canvas 上的文字；作为**背景**时配 `--color-on-accent`（4.99） |
| `--color-flag` | 3.58 | 2.60 | 2.79 | ❌ 不作文字色（≥20px 粗体可作大字强调）；只做描边/图标 |
| `--color-flag-strong` | 5.66 | 4.12 | 4.42 | ✅ canvas 上任意字号；panel/panel-light 上仅作数字（配 11px 时加粗） |
| `--color-danger` | 6.90 | 5.02 | 5.39 | ✅ |
| `--tg` 原值 `#928374` | 3.40 | 2.47 | 2.65 | ❌ 弃用为文字色 |
| `--color-on-accent` on `--color-accent-strong` | — | — | — | 4.99 ✅ |
| 白字 on `--color-flag` | — | — | — | 3.87 ❌ 禁止 |
| 白字 on `--color-flag-strong` | — | — | — | 6.12 ✅ |
| 白字 on `--color-danger` | — | — | — | 7.46 ✅ |

### 1.3 组合规则（实现时的硬约束）

1. `--color-panel`（顶栏/底栏）上的文字只用 `--color-text` 或 `--color-heading`。
2. `--color-flag` 永远不作小字文字色，也不作白字背景。
3. 徽章 = `--color-panel-light` 底 + `--color-text` 字 + `--color-line` 描边。
4. 已读 = `--color-accent-strong`（左侧竖条 + 徽章描边/数字）。
5. 新增回复数 = `--color-flag-strong`（canvas 上直接作为文字色）。
6. 正文链接 `--color-link`，hover 变 `--color-link-hover` 并加下划线。
7. 不用 `#000`/`#fff` 纯色（除图片灯箱遮罩 `rgba(0,0,0,.88)`）。

## 2. 排版

```css
--font-sans: -apple-system, BlinkMacSystemFont, "PingFang SC",
             "HarmonyOS Sans SC", "Source Han Sans SC", "Noto Sans CJK SC",
             "Microsoft YaHei", sans-serif;
```

不加载 web font（避免 FOIT 与体积）。数字统一 `font-variant-numeric: tabular-nums`。

**字号只有四档，全部用 rem**（根字号固定 16px，所以渲染值就是 12/14/16/20）：

| 令牌 | rem | px | 用途 |
|---|---|---|---|
| `text-meta` | 0.75 | 12 | 楼号/时间/作者/fid/角标/引用头/板块 tab/列表徽章数字/表格标签/错误小字 |
| `text-ui` | 0.875 | 14 | 列表标题/按钮/表单/设置项/附件链接 |
| `text-body` | 1 | 16 | 帖子正文/引用正文/空态文案/顶栏站点名 |
| `text-title` | 1.25 | 20 | 页面内 h1（帖子标题）/ 抽屉标题 / 登录页标题 |

浏览类的字号可以小于正文（列表与板块条不跟正文字号走）：列表标题 14、徽章数字 12、板块 tab 12。

| 用途 | 字号/行高 | 字重 | 颜色 |
|---|---|---|---|
| 顶栏站点名 `Stage1st` | 16/1.3 | 600 | `--color-heading` |
| 帖子标题（内容内 h1） | 20/1.45 | 600 | `--color-heading` |
| 帖子正文 | **16/1.75**（`--post-font-size`，设置可调 15–18） | 400 | `--color-text` |
| 帖子内引用 | 16/1.6 | 400 | `--color-text` |
| 列表标题 | 14/1.45，`line-clamp: 2` | 500 | `--color-text` |
| 列表徽章数字 | 12/1.1 | 500 | `--color-text` |
| 元信息（楼号/时间/作者） | 12/1.4（作者用 500 字重 + `--color-text` 区分，不放大字号） | 400 | `--color-muted` |
| 设置分组标题 | 14/1.4 | 500 | `--color-muted` |
| 按钮/表单 | 14/1.4 | 500 | — |

**为什么用 rem**：设置里的正文字号写成 `--post-font-size: <n>/16 rem`，只缩放阅读内容（UI 尺寸不变）；同时浏览器默认字号/最小字号对 rem 生效（px 不会），上游 `<font size>` 也按 rem 映射。根字号保持 16px，所以 px→rem 不改变现有渲染。

正文行宽：容器 `max-width: 800px`，左右 `padding: 0 16px`（小屏）/`0 24px`（大屏），16px 下约 42–45 汉字/行。

**不做的两件事**（taste-skill app-screen 规则对照后的决定）：
1. 不把上游正文里的连续空 `<br>` 归一——保留作者原始留白。
2. 不做入场动画（见 §6）。

## 3. 间距 / 圆角 / 描边 / 阴影

- 间距刻度：`4 / 8 / 12 / 16 / 24 / 32`
- 页面左右内边距：小屏 16，大屏 24
- 列表项：`padding: 10px 16px`，最小高度 64
- 帖子：`padding: 14px 16px`，帖子间 1px `--color-line` 分隔（不画卡片，沿用 NUX 的「浅勾边」风格）
- 圆角：`--radius-sm: 6px`（徽章）、`--radius-md: 10px`（按钮/Sheet/Toast）、`--radius-full`（pill）
- 描边：统一 `1px solid var(--color-line)`
- 阴影：仅浮层 `0 8px 24px rgba(63,58,53,.16)`

## 4. 布局

### 4.1 断点

| 名称 | 宽度 | 布局 |
|---|---|---|
| base | < 640 | 单栏，紧凑间距，底部固定条 |
| `sm` | ≥ 640 | 单栏，间距放宽，正文可用宽 ~ 640 |
| `lg` | ≥ 1024 | **双栏**：左 420px 列表 + 右内容（≤900px 居中） |
| `xl` | ≥ 1440 | 同上，**整个框居中限宽**：`--frame-w: 1320px`（420 + 900），左右留白相等 |

固定高度：顶栏 48（小屏）/ 52（大屏）；底部条 48 + `env(safe-area-inset-bottom)`；帖子页页码条 44。

### 4.2 小屏线框

```
┌───────────────────────────────────────────┐
│            Stage1st                ⚙      │ 48  顶栏 (panel)
├───────────────────────────────────────────┤
│ 【标题】S1 NUX……（内容内标题 17/600）     │
│ ＰＣ数码 · 1 / 15 页 · 41 楼               │
│ ┌────┐ 脑洞学生会 TV动画化                │
│ │159 │ 标题第二行……                       │ 列表项
│ │+12 │                                     │
│ └────┘                                     │
│ ─────────────────────────────────────────  │
│ ┌────┐ 2026年Q娃 名侦探Precure            │
│ │6236│                                     │
│ └────┘                                     │
│ …                                          │
│            —— 已全部加载（3796 页）        │ 无限滚动到底（内流）
├───────────────────────────────────────────┤
│  游戏  动漫  影视  数码  归墟  →           │ 48 + inset（板块 tabs，横向滚动）
└───────────────────────────────────────────┘
```

帖子页底部换成页码条（对齐参考截图）：

```
├───────────────────────────────────────────┤
│        ‹     3 / 15     ›                  │ 44 + inset
└───────────────────────────────────────────┘
```

### 4.3 大屏线框

```
        ┌──────────────────────────────────────────────────────────────┐
        │                          Stage1st                    ⚙      │ 48
        ├────────────────┬─────────────────────────────────────────────┤
        │ 动漫论坛 ▾     │ 【标题】                                 │
        │ ┌────┐ 帖子 A  │ 动漫论坛 · 1 / 15 页 · 41 楼               │
        │ │159 │          │ ───────────────────────────────────────────  │
        │ │+12 │          │  12#  用户名           2019-4-23 14:41      │
        │ └────┘          │  正文 ……（最大 800px）                     │
        │ ┌────┐ 帖子 B  │  13#  另一个用户        2019-4-23 14:52     │
        │ │6236│          │  …                                          │
        │ └────┘          │        ‹  1 / 15  ›                          │
        │ 420px          │  900px                                      │
        └────────────────┴─────────────────────────────────────────────┘
        ←—————————— 整体 1320px 居中，左右留白相等 ——————————→
```

- 两栏**独立滚动**（各自 `overflow-y: auto; height: calc(100dvh - header)`）。
- 左栏可折叠（顶栏 `≡`），状态持久化。
- 左栏顶部是板块下拉（CompactSelect），切换板块只刷新左栏。
- 板块条在左栏底部横向排列；大屏露出 4px 细滚动条、滚轮可直接横滚；右侧固定「刷新」按钮（大屏没有下拉手势）。
- **左栏当前帖子有激活态**：`--color-panel-light` 底 + 左侧 3px `--color-accent-strong` + 标题转 `--color-heading`（`aria-current`）。
- 右栏未选中帖子时显示空态插画 + "从左侧选择帖子"。

### 4.4 滚动与安全区

- `min-height: 100dvh`，`overscroll-behavior-y: contain`（防 PWA 里橡皮筋带动整页）。
- 底部固定条 `padding-bottom: env(safe-area-inset-bottom)`；顶部 `padding-top: env(safe-area-inset-top)`（iOS 独立模式）。
- 不使用 `user-scalable=no`，允许双指缩放（`maximum-scale=5`）。
- 列表滚动位置按 `fid` 记忆（返回列表时恢复）。

## 5. 组件规格

### 5.1 顶栏 `AppHeader`（列表页/大屏常驻；小屏详情页浮层可收起）

- 大屏顶栏内容宽度与浏览框架一致（`--frame-w`），齿轮与右栏右边缘对齐

- 结构：左（预留浏览历史入口）｜ 中：**固定站点名 `Stage1st`**（不随页面变化）｜ 右：设置
- **没有返回按钮**，也没有刷新按钮（列表下拉刷新）
- `position: absolute` 浮在内容上，`background: color-mix(in srgb, var(--color-panel) 92%, transparent)` + `backdrop-filter: blur(8px)`，底部 1px `--color-line`，`z-index: 30`
- 收起/展开：`transform: translateY(-100%)`，`transition: 180ms`；`prefers-reduced-motion` 时直接切换
- 触控区 ≥ 44×44

### 5.2 列表项 `ListRow`（板块列表 `ThreadRow` / 浏览历史 `HistoryPane` 共用）

```
┌────┐  标题第一行……（15/500）
│159 │  标题第二行……（line-clamp: 2）
│+12 │  次级信息（浏览历史：板块 · 时间）
└────┘
```
- 徽章 40×40（有新增时 40×46）：`--color-panel-light` 底、`--color-line` 描边、`--radius-sm`，数字居中；浏览历史徽章显示上次楼层
- `+N`：11px `--color-flag-strong`，居中在数字下方
- 已读：整行 `inset 3px 0 0 var(--color-accent-strong)`，徽章描边与数字转为 `--color-accent-strong`
- 行间 1px `--color-line`；整行为 `<button>`，`:active` 背景 `--color-panel-light`
- **激活态**（大屏左栏当前帖子、浏览历史当前帖子）：`--color-panel-light` 底 + `inset 3px 0 0 var(--color-accent-strong)`，标题与徽章数字转 `--color-accent-strong`，带 `aria-current="true"`
- 板块条（`BoardTabs`）激活项同样用 `--color-accent-strong` 文字 + 底部 2px 主题色指示条

### 5.3 帖子 `PostCard`

```
12#  用户名                      2019-4-23 14:41      ← 元信息 12 muted
┌ 引用 ─────────────────────────────────────────┐
│ ▸ pgain2004  2019-4-23 13:25                   │  ← 可点击（有 pid 时）
│ 隐了这一栏连页码都会看不到的啊……                 │
└────────────────────────────────────────────────┘
正文……（16/1.75）
[图片 100% 宽]
```

- 首楼元信息显示「楼主」徽标（`--color-flag-strong` 14px 描边 pill）
- 楼号缺失（被屏蔽帖）→ 只显示正文占位「该楼层内容不可见」
- 帖子间分隔线；不做卡片/阴影

### 5.4 引用块 `QuoteBlock`

- `background: color-mix(in srgb, var(--color-panel-light) 70%, transparent)`、左 3px `--color-line`、`--radius-sm`、`padding: 10px 12px`、`margin-bottom: 10px`
- 头部一行 12px `--color-muted`，有 pid 时渲染为按钮：hover 下划线 `--color-flag-strong`，右侧加 `↗` 图标
- 超过 8 行折叠，底部「展开」；引用内图片不加载，显示 `[图片]` 占位 chip
- 无 pid（如"作者被禁止或删除"）→ 不可点，纯文本

### 5.5 图片 `ProxyImage` + 灯箱 `ImageLightbox`

- 正文图片：块级、`width: 100%`、`height: auto`、`--radius-sm`、上下 8px 外边距
- 加载中：`--color-panel-light` 骨架（最小高 120px）；失败：`图片加载失败 · 点击重试`
- 省流量模式：显示「图片 · 点击加载」chip（`--color-panel-light` 底，min-h 64）
- 灯箱：全屏 `rgba(0,0,0,.88)`，图片 `object-fit: contain`，提供 `1x / 2x`（2x = 原始尺寸 + 容器可拖动滚动），`Esc`/点击空白/右上 X 关闭

### 5.6 分页条 `Pager`

- 帖子页底部固定（小屏与大屏一致，贴所在内容栏底部）
- 列表页**没有页码条**：无限滚动 + 末尾「加载更多（n / N 页）」/「已全部加载（N 页）」/「加载失败，点击重试」
- `«` `‹` `3 / 15` `›` `»`：首/末页 + 上/下一页，中间数字可点开数字输入；首末页按钮在边界 `disabled`
- 首/末页按钮 `disabled` + 40% 透明；`共 N 页` 用 `--color-muted`

### 5.7 板块条 `BoardTabs`（小屏）

- 横向滚动 + `scroll-snap-type: x proximity`，`scrollbar-width: none`
- 每项 `padding: 0 14px; height: 48px`；active：`--color-accent-strong` 文字 + 2px `--color-accent-strong` 下划线
- 右侧固定渐隐遮罩提示可滚动；最右为「管理」入口（仅 `--color-muted` 图标）

### 5.8 Sheet / 设置

- 小屏：底部抽屉，`max-height: 80dvh`，上圆角 14
- 大屏：居中弹层（`max-w-md`），同样是原生 `<dialog>`
- 内容顺序：常用板块管理 → 阅读（字号 15/16/17/18 + 省流量 Switch）→ 访问令牌 → 账号（uid + 退出登录）→ 图片缓存（本站占用 + 浏览器总占用 + 清空，7 天 TTL / 500MB）→ 关于/版本
- 抽屉是 flex 列：标题栏固定，只有内容区滚动（滚动条不覆盖标题）

### 5.9 状态类组件

| 组件 | 规格 |
|---|---|
| `Skeleton` | `--color-panel-light` 底 + 1.2s 渐变扫光；`prefers-reduced-motion` 时静态 |
| `EmptyState` | 20px 图标 + 16px `--color-muted` 文案 + 可选按钮 |
| `ErrorState` | 同上，图标 `--color-danger`，附「重试」按钮；展示上游错误码对应的中文文案 |
| `Toast` | 底部居中（底部条之上 12px），`--color-text` 底 + `--color-canvas` 字，`--radius-md`；error 变体用 `--color-danger` 底 + 白字 |
| `InlineBanner` | 顶栏下方 36px 高，`--color-panel-light` 底，左侧 3px `--color-danger`（登录过期）/ `--color-flag`（限流提示） |

### 5.10 登录页

- 居中卡片 `max-width: 360px`，无卡片阴影（描边 + `--color-panel` 头部）
- 字段：用户名、密码、安全提问（Select，默认「未设置请忽略」）、答案（选择提问后才出现）
- 记住 30 天（固定 `cookietime=2592000`，不提供选项）
- 错误：`.alert_error` 原文展示在表单上方（`--color-danger`）
- 出现验证码字段时：提示「当前需要验证码，请先用浏览器登录一次 stage1st.com 后重试」

## 6. 交互规范

- 点击目标 ≥ 44×44；列表项整行可点。
- 楼层定位高亮：目标楼 `box-shadow: inset 0 0 0 2px var(--color-flag)`，800ms 后 400ms 淡出。
- 键盘（≥1024）：`←/→` 翻页（输入框聚焦时禁用）、`Esc` 关闭浮层。

### 6.1 动效（只做反馈，不做入场）

依据 taste-skill `references/app-screens.md §2.8`：**app 屏没有 motion floor，屏幕上的内容不做入场动画**，动效只用于「按下 / 悬停 / 焦点 / 抽屉打开 / 一行出现」。

| 场景 | 时长 / 曲线 | 实现 |
|---|---|---|
| 按下反馈（行、按钮） | `--motion-press` 140ms | `transition-colors` + `active:bg-panel-light` |
| 悬停（仅 hover 设备） | `--motion-press` 140ms | `hover:bg-panel-light`（Tailwind v4 的 `hover:` 已限定 hover 设备） |
| 设置抽屉打开 | `--motion-sheet` 240ms，`--motion-ease` | `dialog[open] > div` 位移 12px + 淡入；遮罩同步淡入 |
| 小屏顶栏收起/展开 | 200ms，`transform` | 已有 |
| 楼层定位高亮 | 300ms 淡出 | 已有 |

硬约束：
- **不加**入场 stagger、滚动场景、视差、preload、自定义光标、整页平滑滚动（那些是 landing page 规则，会干扰阅读）。
- 只动 `transform` / `opacity` / 颜色，不动布局属性；不做 overshoot / bounce。
- `prefers-reduced-motion: reduce` → 全局动画降为 0.01ms（骨架屏变静态，抽屉直接出现），内容不会因此消失。
- 骨架屏的 `animate-pulse` 是加载状态，不算入场动画。

## 7. 图标

`lucide-react`，线性 1.75px，尺寸 20（顶栏 22）。使用集合：
`ArrowLeft, ChevronLeft, ChevronRight, RefreshCw, MoreHorizontal, Menu, History, Settings, LogOut, X, ImageOff, AlertCircle, WifiOff, Check, Plus, Trash2, ArrowUp, ArrowDown, Search, ExternalLink`

## 8. 无障碍

- 语义标签：`header` / `nav` / `main` / `article`（每帖）/ `footer`
- 徽章 `aria-label="159 条回复，12 条新增"`；页码按钮 `aria-label="上一页"`
- 焦点环：`outline: 2px solid var(--color-link); outline-offset: 2px`（不在 `outline: none` 后丢失）
- 图片 `alt` 取上游 `alt`，缺失用 `图片`
- 所有对比度组合遵循 §1.3
- 灯箱打开时焦点陷阱 + `aria-modal="true"`

## 9. Tailwind v4 接入

```css
/* src/styles/tokens.css */
@import "tailwindcss";

@theme {
  --color-canvas: #f6f7eb;
  --color-panel: #d0d7bb;
  --color-panel-light: #d7dec7;
  --color-line: #cccc99;
  --color-accent: #689d6a;
  --color-accent-strong: #427b58;
  --color-flag: #d65d0e;
  --color-flag-strong: #af3a03;
  --color-text: #504945;
  --color-heading: #3f3a35;
  --color-muted: #6b6157;
  --color-link: #076678;
  --color-link-hover: #af3a03;
  --color-danger: #9c2c2f;
  --color-on-accent: #fbfcf2;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;

  --font-sans: -apple-system, BlinkMacSystemFont, "PingFang SC",
    "HarmonyOS Sans SC", "Source Han Sans SC", "Noto Sans CJK SC",
    "Microsoft YaHei", sans-serif;
}

  /* 字号四档（rem） */
  --text-meta: 0.75rem;
  --text-ui: 0.875rem;
  --text-body: 1rem;
  --text-title: 1.25rem;
}

:root {
  color-scheme: light;
  --post-font-size: 1rem;   /* prefs.applyPrefs 写入：fontSize / 16 + 'rem' */
  --frame-w: 1160px;

  /* 动效令牌：只用于反馈，不做入场 */
  --motion-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --motion-press: 140ms;
  --motion-hover: 180ms;
  --motion-sheet: 240ms;
}
```

正文字号：`PostCard` 正文用 `text-[length:var(--post-font-size)]`，根字号固定 16px，设置只影响阅读内容（15–18px）。
