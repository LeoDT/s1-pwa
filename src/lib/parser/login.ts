import type { LoginForm } from '@shared/types'
import { errorText, parseFormhash, resolveUrl, textOf, type ParsedPage } from './dom'
import { LOGIN } from './selectors'

export function parseLoginForm(page: ParsedPage): LoginForm | null {
  const form = page.doc.querySelector(LOGIN.form)
  if (!form) return null

  const action = resolveUrl(form.getAttribute('action'), page.base)
  const formhash = parseFormhash(page.doc)
  if (!action || !formhash) return null

  const question = Array.from(page.doc.querySelectorAll(LOGIN.questionSelect)).map((option) => ({
    value: option.getAttribute('value') ?? '',
    label: textOf(option),
  }))

  const hasCaptcha = page.doc.querySelector(LOGIN.captchaInput) !== null
  const captcha = hasCaptcha
    ? {
        imageUrl:
          resolveUrl(
            page.doc.querySelector(LOGIN.captchaImage)?.getAttribute('src'),
            page.base,
          ) ?? '',
        hash: page.doc.querySelector(LOGIN.captchaHash)?.getAttribute('value') ?? '',
      }
    : undefined

  return { action, formhash, question, captcha }
}

export function loginErrorMessage(page: ParsedPage): string | null {
  return errorText(page)
}
