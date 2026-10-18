import { chipTone } from '@/lib/ui'
import type { ThreadStatus } from '@/types/support'
import { tagStoreLinks } from './storeLinks'

export { tagStoreLinks }

/** How each thread status reads, and its chip tone. */
export const STATUS_TONE: Record<ThreadStatus, string> = {
  open: chipTone.amber,
  waiting: chipTone.blue,
  escalated: chipTone.red,
  closed: chipTone.slate,
}
export const STATUS_LABEL: Record<ThreadStatus, string> = {
  open: 'Open',
  waiting: 'Waiting on customer',
  escalated: 'Escalated',
  closed: 'Closed',
}

/** A customer's initials, from their name or failing that their address. */
export function initials(name: string, email: string): string {
  const n = (name || '').trim()
  if (n) {
    const parts = n.split(/\s+/)
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
  }
  return (email || '?').slice(0, 2).toUpperCase()
}

/** A steady colour per address, so the same customer is always the same circle. */
const HUES = [212, 262, 330, 14, 36, 160, 190, 290, 120, 20]
export function customerColor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return `hsl(${HUES[h % HUES.length]} 55% 45%)`
}

/** Fill a macro's placeholders with what the page knows. Brackets are left for the rep. Store links get the support UTM. */
export function fillMacro(body: string, { firstName, rep, channel }: { firstName: string; rep: string; channel?: string }): string {
  return tagStoreLinks(body
    .replace(/\{\{\s*first_name\s*\}\}/gi, firstName || 'there')
    .replace(/\{\{\s*rep\s*\}\}/gi, rep), channel)
}
