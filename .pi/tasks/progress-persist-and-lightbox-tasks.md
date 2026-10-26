# 阅读进度本地落盘 & 灯箱 a 嵌套

- [x] db.ts：抽出单事务核心 `idbTransact`，支持多 store
- [x] outbox.ts：`queueProgress` 一个事务写 progress + outbox；flush 只删「仍是这一版」的行
- [x] useReadingProgress：本地 1s 落盘 / 远端 5s PUT 解耦
- [x] ImageLightbox：portal 到 body + 阻止点击冒泡到外层 `<a>`
- [x] 文档同步（architecture §3.6 / data-model §6.2 / design-system §5.5）
- [x] tests/outbox.test.ts（fake-indexeddb）覆盖单事务、顺序、失败保留、并发删除
- [x] tsc + vitest + vite build 验证
- [x] 灯箱改应用级单例：`src/lib/lightbox.ts` store + `main.tsx` 唯一一份 `<ImageLightbox />`
- [x] ProxyImage 只调 `openLightbox(url, alt)`，不再持有 dialog / stopPropagation 兜底
- [x] tests/lightbox.test.ts：open/close 通知与退订
