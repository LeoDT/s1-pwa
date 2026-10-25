import { describe, expect, it } from 'vitest'
import { parseLocatedUrl } from '@/lib/locate'

describe('楼层定位地址解析', () => {
  it('从 goto=findpost 的落地地址取 page 与 #pid', () => {
    expect(
      parseLocatedUrl(
        'https://stage1st.com/2b/forum.php?mod=viewthread&tid=2071122&page=3&mobile=2#pid55971249',
        1,
      ),
    ).toEqual({ page: 3, pid: 55971249 })
  })

  it('缺少 page 时回退第 1 页，缺少 hash 时回退传入 pid', () => {
    expect(
      parseLocatedUrl('https://stage1st.com/2b/forum.php?mod=viewthread&tid=1&mobile=2', 42),
    ).toEqual({ page: 1, pid: 42 })
  })
})
