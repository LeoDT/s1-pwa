/**
 * 跨端共享类型：浏览器解析产物 + 服务端存储/接口结构。
 * 见 docs/parser.md §9、docs/data-model.md §3。
 */

export interface PageInfo {
  page: number
  totalPages: number
}

export interface Board {
  fid: number
  name: string
  threads?: number
  today?: number
}

export interface BoardGroup {
  name: string
  boards: Board[]
}

export interface ThreadSummary {
  tid: number
  title: string
  replies: number
  typeTag?: string
}

export interface ForumPage extends PageInfo {
  fid: number
  name: string
  threads: ThreadSummary[]
}

export interface Attachment {
  url: string
  name: string
}

export interface QuoteBlock {
  kind: 'quote'
  pid?: number
  tid?: number
  header?: string
  html: string
}

export interface HtmlBlock {
  kind: 'html'
  html: string
}

export type PostBlock = HtmlBlock | QuoteBlock

export interface Post {
  pid: number
  /** 楼主 = 1；被屏蔽楼层 = null */
  floor: number | null
  authorName: string
  authorUid: number | null
  /** 上游原文，如 "2019-4-23 14:41" */
  postedAt: string
  editedNote?: string
  hidden?: boolean
  blocks: PostBlock[]
  /** 绝对地址（含 zoomfile 原图） */
  images: string[]
  attachments: Attachment[]
}

export interface ThreadPage extends PageInfo {
  tid: number
  fid: number
  title: string
  /** 首楼 dm-chat-s 的数字 */
  replies: number
  opUid: number | null
  posts: Post[]
}

export interface LoginForm {
  /** 绝对地址 */
  action: string
  formhash: string
  question: { value: string; label: string }[]
  captcha?: { imageUrl: string; hash: string }
}

export interface Session {
  uid: number
  username?: string
}

/** 服务端历史记录行（D1 progress 表） */
export interface ProgressRow {
  tid: number
  fid: number
  forumName: string
  title: string
  lastPid: number | null
  lastFloor: number | null
  lastPage: number | null
  totalPages: number | null
  /** 上次打开时看到的回复数（快照） */
  replies: number
  updatedAt: number
}

export type ProgressIndexRow = Pick<
  ProgressRow,
  'tid' | 'replies' | 'lastFloor' | 'lastPage' | 'updatedAt'
>

export interface AppConfig {
  authRequired: boolean
  version: string
}

export interface ApiErrorBody {
  ok: false
  code: string
  message: string
}

export interface Ok<T> {
  ok: true
  data: T
}
