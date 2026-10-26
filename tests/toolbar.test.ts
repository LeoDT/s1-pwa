import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BottomBar } from '@/components/BottomBar'
import { Pager } from '@/components/Pager'
import { ToolbarButton } from '@/components/ToolbarButton'

describe('toolbar layout and controls', () => {
  let host: HTMLDivElement
  let root: Root

  afterEach(async () => {
    if (root) await act(async () => root.unmount())
    host?.remove()
  })

  async function render(element: React.ReactNode) {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root.render(element))
  }

  it('separates the safe-area inset from the content row', async () => {
    await render(createElement(BottomBar, null, createElement('span', null, 'bar content')))

    const bar = host.firstElementChild as HTMLElement
    const row = bar.firstElementChild as HTMLElement
    expect(bar.className).toContain('env(safe-area-inset-bottom)')
    expect(row.className).toContain('min-h-[var(--bar-h)]')
    expect(row.textContent).toBe('bar content')
  })

  it('uses a consistent toolbar hit target and inset feedback surface', async () => {
    await render(createElement(ToolbarButton, { 'aria-label': 'Refresh' }, 'refresh'))

    const button = host.querySelector('button')!
    expect(button.className).toContain('min-h-[max(2.75rem,44px)]')
    expect(button.className).toContain('min-w-[max(2.75rem,44px)]')
    expect(button.firstElementChild?.className).toContain('min-h-9')
    expect(button.firstElementChild?.className).toContain('group-hover:bg-panel-light')
  })

  it('keeps pager controls operable and advances the selected page', async () => {
    let selected = 3
    await render(
      createElement(Pager, {
        page: selected,
        totalPages: 8,
        onChange: (page: number) => { selected = page },
      }),
    )

    const next = host.querySelector<HTMLButtonElement>('button[aria-label="下一页"]')!
    expect(next.className).toContain('min-h-[max(2.75rem,44px)]')
    await act(async () => next.click())
    expect(selected).toBe(4)
  })
})
