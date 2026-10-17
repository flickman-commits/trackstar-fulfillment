import type { SenderFilter } from '@/types/support'

/** The filter that catches this address, if any. Same rule as the server (server/domain/support/filters.js). */
export function filterFor(email: string, filters: SenderFilter[]): SenderFilter | null {
  const e = (email || '').toLowerCase()
  const domain = e.split('@')[1] || ''
  return filters.find(f => f.pattern.includes('@') ? e === f.pattern : domain === f.pattern || domain.endsWith(`.${f.pattern}`)) || null
}
