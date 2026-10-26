import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ThreadRow } from '@/features/browse/ThreadRow'
import { countOf, parsePage } from '@/lib/parser/dom'
import { parseForumPage } from '@/lib/parser/forum'
import { FORUM_LIST } from '@/lib/parser/selectors'

const fixture = readFileSync(path.join(import.meta.dirname, 'fixtures/forumdisplay-fid6-p1.html'), 'utf8')
const url = 'https://stage1st.com/2b/forum.php?mod=forumdisplay&fid=6&mobile=2'

describe('shared reply counts', () => {
  it.each([
    ['0', 0], ['18194', 18194], ['18,194', 18194], ['18 194', 18194], ['1,234,567', 1234567],
    ['', null], ['invalid', null], ['-1', null], ['1.5', null], ['18,19', null], ['9007199254740992', null],
  ])('parses %j as %j without conflating unknown and zero', (text, expected) => {
    const element = document.createElement('span')
    element.textContent = text
    expect(countOf(element)).toBe(expected)
    expect(countOf(null)).toBeNull()
  })

  it('keeps list counts unknown when their node is absent or invalid', () => {
    for (const text of [null, 'not a count']) {
      const page = parsePage(fixture, url)
      const count = page.doc.querySelector(FORUM_LIST.item)!.querySelector(FORUM_LIST.replies)!
      if (text === null) count.remove()
      else count.textContent = text
      expect(parseForumPage(page).threads[0]?.replies).toBeNull()
    }
  })

  it('uses the same parser for real zero and grouped list counts', () => {
    for (const [text, expected] of [['0', 0], ['18,194', 18194]] as const) {
      const page = parsePage(fixture, url)
      page.doc.querySelector(FORUM_LIST.item)!.querySelector(FORUM_LIST.replies)!.textContent = text
      expect(parseForumPage(page).threads[0]?.replies).toBe(expected)
    }
  })

  it('renders an unknown count distinctly from a true zero', () => {
    const render = (replies: number | null) => renderToStaticMarkup(createElement(ThreadRow, {
      thread: { tid: 42, title: 'thread', replies },
      onOpen: () => {},
    }))
    expect(render(null)).toContain('aria-label="回复数未知"')
    expect(render(null)).toContain('—')
    expect(render(0)).toContain('aria-label="0 条回复"')
    expect(render(null)).not.toContain('条新增')
  })
})
