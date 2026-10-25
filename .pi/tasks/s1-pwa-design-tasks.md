# S1 Reader PWA — 任务跟踪

## 设计阶段（已完成）

- [x] 核对 S1 手机版页面结构（列表/帖子/分页/引用/登录/板块树）
- [x] 核实「红茶Alt」配色与对比度，派生可访问令牌
- [x] 定案凭证模型（IndexedDB cookie jar + worker 薄代理）
- [x] 定案历史身份（cookie → uid → HMAC userKey，多设备自动同步）
- [x] 定案重定向语义（上游 3xx → JSON，客户端跟随）
- [x] 定案图片通道（fetch → blob + Cache API，代理统一出图）
- [x] 文档：overview / architecture / design-system / data-model / parser / roadmap

## 实现阶段

- [x] M0 骨架（Vite/TS/Tailwind/worker 空壳/wrangler 配置/本地双进程/设计令牌）
- [x] M1 代理与登录（proxy core、token、jar、登录解析与提交、登录态检测、设置面板）
  - [x] 解析器夹具单测（9 条）
  - [x] 真浏览器冒烟（首页/登录页渲染、无 console 错误）
  - [ ] 用真实账号在浏览器里跑一遍登录（需你手动验证）
  - [x] 排障：Discuz `_xss_check` 规避（formhash 进 query）、上游 5xx 可读化 + 诊断日志
  - [x] 修 IndexedDB 写事务提前 resolve、登录后 session 缓存未失效
- [x] M2 浏览（parser、列表/帖子 UI、路由、双栏、板块 tabs、板块管理、图片通道）
- [x] M2.5 App 式浏览（浮层顶栏/滚动收起/下拉刷新/滑动返回/固定层级导航/板块条位置）
  - [x] 修：图片只输出 data-src，避免浏览器直连原图（实测确认）
  - [x] 顶栏策略定稿：列表页/大屏常驻，仅小屏详情页浮层收起；详情页页码条统一放底部
- [ ] M3 阅读进度（D1、身份探针、history API、定位跳楼、徽章）
- [ ] M4 图片与附件（`/api/img`+`imageStore`+`ProxyImage` 已完成；剩 `/api/file`、灯箱、省流量、缓存统计）
- [ ] M5 打磨（PWA 安装、iOS 细节、设置项、无障碍）
- [ ] M6 部署与迁移预检

详细验收标准见 `docs/roadmap.md`。
