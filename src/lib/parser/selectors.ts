/**
 * Discuz 手机版选择器（全部于 2026-10-25 实测确认）。
 * 结构变化时只改这里 + 更新 tests/fixtures。见 docs/parser.md。
 */

/** 登录后的 uid 出现在每页的内联脚本里 */
export const DISCUZ_UID_RE = /discuz_uid\s*=\s*'(\d+)'/

/** body class → 页面类型 */
export const PAGE_CLASS = {
  viewthread: 'pg_viewthread',
  forumdisplay: 'pg_forumdisplay',
  index: 'pg_index',
  logging: 'pg_logging',
} as const

export const LOGIN = {
  form: '#loginform',
  formhash: 'input[name="formhash"]',
  questionSelect: 'select[name="questionid"] option',
  captchaInput: 'input[name="seccodeverify"]',
  captchaImage: '#seccode_verify',
  captchaHash: 'input[name="seccodehash"]',
  error: '.alert_error',
} as const

export const COMMON = {
  base: 'base[href]',
  headerTitle: '.header h2',
  pager: '.pg',
  pagerCurrent: '.pg strong',
  pagerCustomPage: 'input[name="custompage"]',
  pagerTotal: '.pg span[title^="共"]',
  /** 登录失败等消息页：.jump_c 的第一行是正文，第二行是「返回上一页」 */
  alertError: '.alert_error, #messagetext, .jump_c > div:first-child',
  logoutLink: 'a[href*="action=logout"]',
} as const

export const BOARD_INDEX = {
  groupTitle: '.forumlist .subforumshow h2 a',
  group: '.forumlist .sub-forum',
  boardLink: 'a[href*="fid="]',
  boardName: '.mtit',
  boardThreads: '.mtxt span[title]',
  boardToday: '.mtxt .mnum',
} as const

export const FORUM_LIST = {
  sticky: '.threadlist li.list_top',
  item: '.threadlist li.list',
  link: 'a[href*="tid="]',
  title: 'em.text-base',
  typeTag: 'span.text-xs',
  author: '.mmc',
  replies: '.text-gray-400 > div:last-child',
} as const

export const THREAD = {
  fidLink: '.header .mz a[href*="fid="]',
  // 上游引用截断可能留下未闭合的格式化标签，HTML 解析器会把后续楼层包进 <strike> 等元素，
  // 所以楼层与回复总数都不能依赖 .viewthread 的直接子节点。
  post: '.viewthread .plc.cl[id^="pid"]',
  avatar: '.avatar img',
  authi: 'ul.authi',
  floor: 'ul.authi li.mtit span.y',
  authorLink: 'ul.authi li.mtit span.z a[href*="uid="]',
  time: 'ul.authi li.mtime',
  viewsAndReplies: 'ul.authi li.mtime span.y',
  replyCount: 'ul.authi li.mtime span.y .dm-chat-s + em',
  repliesTotal: '.viewthread .txtlist > .mtit.cl',
  message: '.message',
  editNote: 'i.pstatus',
  quote: 'div.quote',
  quoteLink: 'a[href*="goto=findpost"]',
  attachment: 'a[href*="mod=attachment"]',
  multipage: '#multipage_url',
} as const
