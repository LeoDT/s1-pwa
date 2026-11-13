import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsePage } from '@/lib/parser/dom'
import { parseRatingList } from '@/lib/parser/ratings'
import { parseThreadPage } from '@/lib/parser/thread'

const fixtures = path.resolve(import.meta.dirname, 'fixtures')
const fixture = (name: string) => readFileSync(path.join(fixtures, name), 'utf8')
const BASE = 'https://stage1st.com/2b/'

function threadFixture(name: string, tid: number) {
  return parseThreadPage(
    parsePage(fixture(name), `${BASE}forum.php?mod=viewthread&tid=${tid}&page=1&mobile=2`),
  )
}

describe('帖子内联评分', () => {
  const thread = threadFixture('viewthread-1826103-p1.html', 1826103)
  const rated = thread.posts.find((post) => post.pid === 43394299)

  it('解析参与人数、战斗力合计和前 20 条明细', () => {
    expect(rated?.ratings).not.toBeNull()
    expect(rated?.ratings?.count).toBe(40)
    expect(rated?.ratings?.score).toBe(41)
    expect(rated?.ratings?.entries).toHaveLength(20)

    const first = rated?.ratings?.entries[0]
    expect(first).toMatchObject({
      uid: 491666,
      name: '抄袭炉石的垃圾',
      score: 1,
      reason: '好评加鹅',
    })
  })

  it('无评分楼层为 null', () => {
    const plain = thread.posts.find((post) => post.pid === 43477773)
    expect(plain?.ratings).toBeNull()
  })

  it('保留扣鹅负分，不把负号当分隔符', () => {
    const negative = threadFixture('viewthread-rating-negative.html', 1936922)
      .posts.find((post) => post.pid === 47515788)
    expect(negative?.ratings).toMatchObject({ count: 1, score: -1 })
    expect(negative?.ratings?.entries[0]).toMatchObject({
      uid: 22095,
      name: 'CrayS1',
      score: -1,
      reason: '会~ 会~ 会~',
    })
  })
})

describe('完整评分列表', () => {
  it('解析评分、用户名、时间和理由', () => {
    const page = parsePage(
      fixture('ratings-negative.html'),
      `${BASE}forum.php?mod=misc&action=viewratings&tid=1936922&pid=47515788&mobile=2`,
    )
    expect(parseRatingList(page)).toEqual([
      {
        uid: null,
        name: 'CrayS1',
        score: -1,
        time: '2020-5-22 16:03',
        reason: '会~ 会~ 会~',
      },
    ])
  })

  it('理由行紧跟在对应评分行之后，空理由不串到下一条', () => {
    const page = parsePage(`
      <html><body>
        <ul class="post_box cl">
          <li class="flex-box mli"><div>积分</div><div>用户名</div><div>时间</div></li>
          <li class="flex-box mli">
            <div><span>战斗力 +2 鹅</span></div><div><span>alice</span></div><div><span>2020-1-1 00:00</span></div>
          </li>
          <li class="flex-box mli"><div><span>好评</span></div></li>
          <li class="flex-box mli">
            <div><span>战斗力 -1 鹅</span></div><div><span>bob</span></div><div><span>2020-1-2 00:00</span></div>
          </li>
          <li class="flex-box mli"><div><span></span></div></li>
        </ul>
      </body></html>
    `, BASE)
    expect(parseRatingList(page)).toEqual([
      { uid: null, name: 'alice', score: 2, time: '2020-1-1 00:00', reason: '好评' },
      { uid: null, name: 'bob', score: -1, time: '2020-1-2 00:00' },
    ])
  })
})
