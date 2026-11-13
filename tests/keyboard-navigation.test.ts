import { describe, expect, it } from 'vitest'
import {
  isEditableTarget,
  isShortcutBlocked,
  moveListFocus,
  nextBoardFid,
  scrollStep,
} from '@/features/browse/keyboard'

describe('keyboard list focus', () => {
  const tids = [10, 20, 30]

  it('starts at the first row from either direction', () => {
    expect(moveListFocus(tids, null, 1)).toBe(10)
    expect(moveListFocus(tids, null, -1)).toBe(10)
  })

  it('moves one row and clamps at both ends without wrapping', () => {
    expect(moveListFocus(tids, 10, 1)).toBe(20)
    expect(moveListFocus(tids, 20, -1)).toBe(10)
    expect(moveListFocus(tids, 30, 1)).toBe(30)
    expect(moveListFocus(tids, 10, -1)).toBe(10)
  })

  it('falls back to the first row when the focused id is gone', () => {
    expect(moveListFocus([], null, 1)).toBeNull()
    expect(moveListFocus(tids, 999, 1)).toBe(10)
  })
})

describe('board candidate cycling', () => {
  const boards = [{ fid: 4 }, { fid: 6 }, { fid: 51 }]

  it('starts after the active board and wraps', () => {
    expect(nextBoardFid(boards, 6, null)).toBe(51)
    expect(nextBoardFid(boards, 51, null)).toBe(4)
    expect(nextBoardFid(boards, 4, null)).toBe(6)
  })

  it('continues from the current candidate', () => {
    expect(nextBoardFid(boards, 6, 51)).toBe(4)
    expect(nextBoardFid(boards, 6, 4)).toBe(6)
  })

  it('starts at the first board without an active one', () => {
    expect(nextBoardFid(boards, null, null)).toBe(4)
    expect(nextBoardFid(boards, 999, null)).toBe(4)
    expect(nextBoardFid([], 6, null)).toBeNull()
  })
})

describe('shortcut guards', () => {
  const press = (init: KeyboardEventInit = {}) => new KeyboardEvent('keydown', init)

  it('ignores editable targets', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true)
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true)
    expect(isEditableTarget(document.createElement('select'))).toBe(true)
    expect(isEditableTarget(document.createElement('div'))).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })

  it('ignores modifier keys', () => {
    expect(isShortcutBlocked(press({ key: 'w', ctrlKey: true }))).toBe(true)
    expect(isShortcutBlocked(press({ key: 'w', metaKey: true }))).toBe(true)
    expect(isShortcutBlocked(press({ key: 'w', altKey: true }))).toBe(true)
    expect(isShortcutBlocked(press({ key: 'w' }))).toBe(false)
  })

  it('ignores keys while a dialog is open', () => {
    const dialog = document.createElement('dialog')
    dialog.setAttribute('open', '')
    document.body.append(dialog)
    try {
      expect(isShortcutBlocked(press({ key: 'w' }))).toBe(true)
    } finally {
      dialog.remove()
    }
    expect(isShortcutBlocked(press({ key: 'w' }))).toBe(false)
  })

  it('scrolls about 60% of the viewport height', () => {
    expect(scrollStep(1000)).toBe(600)
    expect(scrollStep(650)).toBe(390)
  })
})
