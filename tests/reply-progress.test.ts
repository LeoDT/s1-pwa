import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsePage } from '@/lib/parser/dom'
import { parseThreadPage } from '@/lib/parser/thread'
import { getNewReplies } from '@/lib/progress'

const fixture = readFileSync(path.join(import.meta.dirname, 'fixtures/viewthread-1826103-p1.html'), 'utf8')
const url = 'https://stage1st.com/2b/forum.php?mod=viewthread&tid=1826103&mobile=2'
function parse(html: string) { return parseThreadPage(parsePage(html, url)) }
function withCount(value: string | null) {
  let html = fixture.replace(/<i class="dm-chat-s"><\/i><em>580<\/em>/, `<i class="dm-chat-s"></i>${value === null ? '' : `<em>${value}</em>`}`)
  html = html.replace('全部回复<em>580</em>', value === null ? '' : `全部回复<em>${value}</em>`)
  return html
}

describe('reply count parsing and delta', () => {
  it('parses the chat-icon count, separators and true zero (not the views count)', () => {
    expect(parse(withCount('18,194')).replies).toBe(18194)
    expect(parse(withCount('0')).replies).toBe(0)
  })
  it('uses reliable all-replies total when post counters are absent', () => {
    const noPostCount = fixture.replace(/<i class="dm-chat-s"><\/i><em>580<\/em>/, '<i class="dm-chat-s"></i>')
    expect(parse(noPostCount).replies).toBe(580)
  })
  it('returns null without a reliable source, or for invalid/unsafe values', () => {
    for (const invalid of ['wat', '-1', '9007199254740992']) {
      expect(parse(withCount(invalid)).replies).toBeNull()
    }
    expect(parse(withCount(null)).replies).toBeNull()
    const bodyDecoy = withCount(null).replace('<div class="message">', '<div class="message"><p>全部回复<em>7</em></p>')
    expect(parse(bodyDecoy).replies).toBeNull()
  })
  it('delta requires known counts and treats zero as known', () => {
    expect(getNewReplies(18194, 580)).toBe(17614)
    expect(getNewReplies(0, 0)).toBe(0)
    expect(getNewReplies(4, null)).toBeNull()
    expect(getNewReplies(null, 0)).toBeNull()
  })
  it('trims top-level and wrapped boundary breaks, while preserving pre/code and hr', () => {
    const wrappedPage = parsePage(fixture, url)
    wrappedPage.doc.querySelector('.message')!.innerHTML = '<span><br>wrapped<br></span>'
    expect(parseThreadPage(wrappedPage).posts[0]?.blocks[0]).toMatchObject({ kind: 'html', html: '<span>wrapped</span>' })

    const page = parsePage(fixture, url)
    const message = page.doc.querySelector('.message')!
    message.insertAdjacentHTML('afterbegin', '<span><br>包装文本<br></span><span>前<br></span>后<pre><br>inside<br></pre><code><br>code<br></code><hr>')
    const thread = parseThreadPage(page)
    const blocks = thread.posts.flatMap((post) => post.blocks).filter((block) => block.kind === 'html')
    expect(blocks.some((block) => block.html.includes('<pre><br>inside<br></pre>'))).toBe(true)
    expect(blocks.some((block) => block.html.includes('<code><br>code<br></code>'))).toBe(true)
    expect(blocks.some((block) => block.html.includes('<hr>'))).toBe(true)
    expect(blocks.some((block) => block.html.includes('<span>包装文本<br></span>'))).toBe(true)
    expect(blocks.some((block) => block.html.includes('<span>前<br></span>后'))).toBe(true)
    expect(blocks.some((block) => /^(<br>|<span><br>)/.test(block.html))).toBe(false)
  })
  it('trims quote edge breaks but preserves breaks within quoted content', () => {
    const page = parsePage(fixture, url)
    const quoteNode = page.doc.querySelector('div.quote blockquote')!
    quoteNode.innerHTML = '<br><span><br>quoted<br></span><br><span>前<br></span>后<br>'
    const quote = parseThreadPage(page).posts.flatMap((post) => post.blocks).find((block) => block.kind === 'quote')
    expect(quote?.kind === 'quote' && quote.html).toContain('<span>quoted<br></span>')
    expect(quote?.kind === 'quote' && quote.html).toContain('<span>前<br></span>后')
    expect(quote?.kind === 'quote' && quote.html).not.toMatch(/^(<br>|<span><br>)/)
  })
})
