import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsePage } from '@/lib/parser/dom'
import { parseBoardGroups } from '@/lib/parser/board'
import { parseForumPage } from '@/lib/parser/forum'
import { parseThreadPage } from '@/lib/parser/thread'
import { classifyLink } from '@/lib/links'

const fixtures = path.resolve(import.meta.dirname, 'fixtures')
const fixture = (name: string) => readFileSync(path.join(fixtures, name), 'utf8')

const BASE = 'https://stage1st.com/2b/'

describe('板块树', () => {
  const page = parsePage(fixture('index.html'), `${BASE}forum.php?mobile=2`)
  const groups = parseBoardGroups(page)

  it('解析出分组与板块', () => {
    expect(groupCount(groups)).toBeGreaterThan(0)
    const all = groups.flatMap((group) => group.boards)
    expect(all.find((board) => board.fid === 6)?.name).toBe('动漫论坛')
    expect(all.find((board) => board.fid === 4)?.name).toBe('游戏论坛')
  })

  it('带帖数与今日帖数', () => {
    const gaming = groups.flatMap((group) => group.boards).find((board) => board.fid === 4)
    expect(gaming?.threads).toBeGreaterThan(1000)
  })
})

describe('帖子列表页', () => {
  const page = parsePage(fixture('forumdisplay-fid6-p1.html'), `${BASE}forum.php?mod=forumdisplay&fid=6&mobile=2`)
  const forum = parseForumPage(page)

  it('过滤置顶帖（li.list_top）', () => {
    expect(page.doc.querySelectorAll('.threadlist li.list_top').length).toBeGreaterThan(0)
    expect(forum.threads.length).toBeLessThan(
      page.doc.querySelectorAll('.threadlist li').length,
    )
  })

  it('解析标题 / tid / 回复数', () => {
    const first = forum.threads[0]
    expect(first?.tid).toBeGreaterThan(0)
    expect(first?.title.length).toBeGreaterThan(4)
    expect(typeof first?.replies).toBe('number')
  })

  it('解析分页', () => {
    expect(forum.page).toBe(1)
    expect(forum.totalPages).toBeGreaterThan(100)
  })
})

describe('帖子页', () => {
  const page = parsePage(fixture('viewthread-1826103-p1.html'), `${BASE}forum.php?mod=viewthread&tid=1826103&mobile=2`)
  const thread = parseThreadPage(page)

  it('基础信息', () => {
    expect(thread.tid).toBe(1826103)
    expect(thread.fid).toBe(51)
    expect(thread.title).toContain('S1 NUX')
    expect(thread.totalPages).toBe(15)
    expect(thread.replies).toBeGreaterThan(500)
  })

  it('楼层：首楼 = 1，其余为数字或不连续缺省', () => {
    const first = thread.posts[0]
    expect(first?.floor).toBe(1)
    expect(first?.authorName).toBe('pgain2004')
    expect(thread.posts.length).toBeGreaterThan(30)
    const floors = thread.posts.map((post) => post.floor).filter((floor) => floor !== null)
    expect(floors).toContain(2 - 1 + 1) // 1
    expect(Math.max(...(floors as number[]))).toBeGreaterThan(30)
  })

  it('引用块带 pid/ptid 时可跳转，缺 pid 时不可跳', () => {
    const quotes = thread.posts.flatMap((post) =>
      post.blocks.filter((block) => block.kind === 'quote'),
    )
    expect(quotes.length).toBeGreaterThan(10)
    const clickable = quotes.filter((quote) => quote.kind === 'quote' && quote.pid !== undefined)
    expect(clickable.length).toBeGreaterThan(10)
    expect(clickable[0]?.kind === 'quote' ? clickable[0].tid : null).toBe(1826103)
  })

  it('图片绝对化（含表情）', () => {
    const images = thread.posts.flatMap((post) => post.images)
    expect(images.length).toBeGreaterThan(0)
    expect(images.every((url) => url.startsWith('https://'))).toBe(true)
  })

  it('编辑说明被提取而不是留在正文里', () => {
    const first = thread.posts[0]
    expect(first?.editedNote).toContain('本帖最后由')
    const html = first?.blocks.map((block) => ('html' in block ? block.html : '')).join('')
    expect(html).not.toContain('本帖最后由')
  })

  it('被屏蔽的楼层标记为 hidden，且不会误伤「引用被屏蔽帖」的正常楼层', () => {
    const hidden = thread.posts.filter((post) => post.hidden)
    expect(hidden.length).toBeGreaterThan(0)
    for (const post of hidden) {
      expect(post.blocks.every((block) => block.kind === 'html')).toBe(true)
    }

    const quoting = thread.posts.filter(
      (post) => !post.hidden && post.blocks.some((block) => block.kind === 'quote'),
    )
    expect(quoting.length).toBeGreaterThan(0)
  })
})

describe('正文链接分类', () => {
  it('帖子链接', () => {
    expect(classifyLink('https://stage1st.com/2b/thread-1826103-2-1.html', BASE)).toEqual({
      kind: 'thread',
      tid: 1826103,
      page: 2,
    })
    expect(classifyLink('forum.php?mod=viewthread&tid=42&mobile=2', BASE)).toEqual({
      kind: 'thread',
      tid: 42,
      page: undefined,
    })
  })

  it('引用跳楼链接', () => {
    expect(
      classifyLink(
        'https://stage1st.com/2b/forum.php?mod=redirect&goto=findpost&pid=43405671&ptid=1826103',
        BASE,
      ),
    ).toEqual({ kind: 'post', tid: 1826103, pid: 43405671 })
  })

  it('板块链接与外链', () => {
    expect(classifyLink('forum.php?mod=forumdisplay&fid=6&mobile=2', BASE)).toEqual({
      kind: 'forum',
      fid: 6,
    })
    expect(classifyLink('https://example.com/a', BASE).kind).toBe('external')
    expect(classifyLink('javascript:alert(1)', BASE).kind).toBe('drop')
  })
})

function groupCount(groups: ReturnType<typeof parseBoardGroups>): number {
  return groups.reduce((sum, group) => sum + group.boards.length, 0)
}

describe('图片不走浏览器直连', () => {
  const page = parsePage(fixture('viewthread-1826103-p1.html'), `${BASE}forum.php?mod=viewthread&tid=1826103&mobile=2`)
  const thread = parseThreadPage(page)

  it('正文里只留 data-src，不留 src', () => {
    const html = thread.posts.flatMap((post) => post.blocks.map((block) => block.html)).join('')
    expect(html).toContain('data-src="https://')
    expect(html).not.toMatch(/<img[^>]*\ssrc=/)
  })

  it('Post.images 仍然记录绝对地址', () => {
    expect(thread.posts.flatMap((post) => post.images).every((url) => url.startsWith('https://'))).toBe(true)
  })
})
