import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge 默认只认识内置字号（text-sm/base/…），自定义的 text-meta/ui/body/title
 * 会被当成「颜色」而与 text-text / text-heading 冲突并被丢掉。这里登记成字号组。
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': ['text-meta', 'text-ui', 'text-body', 'text-title'],
    },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
