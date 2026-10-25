import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsePage, parsePageInfo, parseUid } from '@/lib/parser/dom'
import { loginErrorMessage, parseLoginForm } from '@/lib/parser/login'
import { buildLoginRequest } from '@/lib/session'

const fixtures = path.resolve(import.meta.dirname, 'fixtures')

function fixture(name: string): string {
  return readFileSync(path.join(fixtures, name), 'utf8')
}

describe('登录页解析', () => {
  const html = fixture('login.html')
  const page = parsePage(html, 'https://stage1st.com/2b/member.php?mod=logging&action=login&mobile=2')

  it('识别页面类型', () => {
    expect(page.kind).toBe('logging')
  })

  it('解析出提交地址与 formhash', () => {
    const form = parseLoginForm(page)
    expect(form).not.toBeNull()
    expect(form?.formhash).toBe('e7493beb')
    expect(form?.action).toContain('loginsubmit=yes')
    expect(form?.action.startsWith('https://stage1st.com/2b/')).toBe(true)
  })

  it('解析出安全提问选项（未设置时默认第 0 项）', () => {
    const form = parseLoginForm(page)
    expect(form?.question[0]?.value).toBe('0')
    expect(form?.question).toHaveLength(8)
    expect(form?.question[1]?.label).toBe('母亲的名字')
  })

  it('无验证码时不产生 captcha 字段', () => {
    expect(parseLoginForm(page)?.captcha).toBeUndefined()
  })

  it('游客页面 uid 为 0', () => {
    expect(parseUid(html)).toBe(0)
  })
})

describe('帖子列表页解析（分页基础）', () => {
  const html = fixture('forumdisplay-fid6-p1.html')
  const page = parsePage(
    html,
    'https://stage1st.com/2b/forum.php?mod=forumdisplay&fid=6&mobile=2',
  )

  it('识别页面类型', () => {
    expect(page.kind).toBe('forumdisplay')
  })

  it('解析当前页与总页数', () => {
    expect(parsePageInfo(page)).toEqual({ page: 1, totalPages: 3796 })
  })
})

describe('登录失败页解析', () => {
  const html = fixture('login-fail.html')
  const page = parsePage(html, 'https://stage1st.com/2b/member.php?mod=logging&action=login')

  it('识别为 Discuz 消息页且未登录', () => {
    expect(page.kind).toBe('message')
    expect(parseUid(html)).toBe(0)
  })

  it('提取上游错误原文而不是「返回上一页」链接', () => {
    expect(loginErrorMessage(page)).toMatch(/登录失败/)
  })
})

describe('登录请求构造', () => {
  const page = parsePage(
    fixture('login.html'),
    'https://stage1st.com/2b/member.php?mod=logging&action=login&mobile=2',
  )
  const form = parseLoginForm(page)!

  it('把 formhash 放进查询串（绕开 Discuz 对 POST body 的双重解码扫描）', () => {
    const request = buildLoginRequest(form, { username: 'u', password: 'p' })
    const url = new URL(request.url)
    expect(url.searchParams.get('formhash')).toBe(form.formhash)
    expect(url.searchParams.get('action')).toBe('login')
    expect(url.searchParams.get('loginsubmit')).toBe('yes')
  })

  it('密码等字段按表单编码，不破坏 body 结构', () => {
    const request = buildLoginRequest(form, {
      username: 'u',
      password: "a(b)c&d=e f",
      questionid: '1',
      answer: "x'y",
    })
    const body = new URLSearchParams(request.body)
    expect(body.get('password')).toBe("a(b)c&d=e f")
    expect(body.get('answer')).toBe("x'y")
    expect(body.get('formhash')).toBe(form.formhash)
    expect(body.get('cookietime')).toBe('2592000')
  })
})
