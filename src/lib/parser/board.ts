import type { BoardGroup } from '@shared/types'
import type { ParsedPage } from './dom'
import { BOARD_INDEX } from './selectors'

/** 板块树（forum.php 首页）：用于「常用板块」选择器 */
export function parseBoardGroups(page: ParsedPage): BoardGroup[] {
  const groups: BoardGroup[] = []

  for (const groupElement of Array.from(page.doc.querySelectorAll(BOARD_INDEX.group))) {
    const heading = groupElement.previousElementSibling
    const name = heading?.matches('.subforumshow')
      ? (heading.querySelector('h2')?.textContent ?? '').trim()
      : ''

    const boards = Array.from(groupElement.querySelectorAll(BOARD_INDEX.boardLink)).flatMap(
      (link) => {
        const href = link.getAttribute('href') ?? ''
        const fid = Number.parseInt(/[?&]fid=(\d+)/.exec(href)?.[1] ?? '', 10)
        const boardName = (link.querySelector(BOARD_INDEX.boardName)?.textContent ?? '').trim()
        if (!Number.isFinite(fid) || boardName === '') return []

        const threads = Number.parseInt(
          link.querySelector(BOARD_INDEX.boardThreads)?.getAttribute('title') ?? '',
          10,
        )
        const today = Number.parseInt(
          (link.querySelector(BOARD_INDEX.boardToday)?.textContent ?? '').replace(/[^\d]/g, ''),
          10,
        )

        return [
          {
            fid,
            name: boardName,
            threads: Number.isFinite(threads) ? threads : undefined,
            today: Number.isFinite(today) ? today : undefined,
          },
        ]
      },
    )

    if (boards.length > 0) groups.push({ name: name === '' ? '其它' : name, boards })
  }

  return groups
}
