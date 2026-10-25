import type { ParsedPage } from './dom'
import { errorText } from './dom'

export class ParseError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ParseError'
    this.code = code
  }
}

/** 页面类型不符时给出可读原因，避免 UI 白屏 */
export function assertKind(page: ParsedPage, expected: ParsedPage['kind']): void {
  if (page.kind === expected) return
  throw new ParseError(
    'structure_changed',
    errorText(page) ?? `页面结构异常（期望 ${expected}，实际 ${page.kind}）`,
  )
}
