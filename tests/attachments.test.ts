import { describe, expect, it } from 'vitest'
import { filenameFromDisposition } from '@/lib/attachments'

describe('附件文件名解析', () => {
  it('优先 RFC 5987 的 filename*', () => {
    expect(
      filenameFromDisposition("attachment; filename*=UTF-8''%E6%8A%A5%E5%91%8A.zip"),
    ).toBe('报告.zip')
  })

  it('退回普通 filename（含引号/无引号）', () => {
    expect(filenameFromDisposition('attachment; filename="a.zip"')).toBe('a.zip')
    expect(filenameFromDisposition('attachment; filename=b.rar')).toBe('b.rar')
  })

  it('缺失或非法时返回 null', () => {
    expect(filenameFromDisposition(null)).toBeNull()
    expect(filenameFromDisposition('attachment')).toBeNull()
    expect(filenameFromDisposition("attachment; filename*=UTF-8''%E0%A4%A")).toBeNull()
  })
})
