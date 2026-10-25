import type { AppConfig } from '@shared/types'
import { apiFetch } from './api'

export function fetchConfig(): Promise<AppConfig> {
  return apiFetch<AppConfig>('/api/config')
}
