import { describe, expect, it } from 'vitest'
import {
  clearThreadFocus,
  consumeThreadFocus,
  peekThreadFocus,
  setThreadFocus,
} from '@/lib/navigation'

describe('one-shot thread focus', () => {
  it('only matches the target tid/page and is consumed once', () => {
    clearThreadFocus()
    setThreadFocus(9, 2, 42)
    expect(peekThreadFocus(9, 1)).toBeNull()
    expect(peekThreadFocus(9, 2)).toBe(42)
    expect(consumeThreadFocus(9, 2)).toBe(42)
    expect(peekThreadFocus(9, 2)).toBeNull()
  })
})
