import { idbDel, idbGet, idbSet } from './db'

const TOKEN_KEY = 'appToken'
const listeners = new Set<() => void>()

export async function getAppToken(): Promise<string | null> {
  return (await idbGet<string>('kv', TOKEN_KEY)) ?? null
}

export async function setAppToken(token: string | null): Promise<void> {
  if (token) await idbSet('kv', TOKEN_KEY, token)
  else await idbDel('kv', TOKEN_KEY)
  for (const listener of listeners) listener()
}

export function subscribeAppToken(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
