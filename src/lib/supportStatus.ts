import { chipTone } from '@/lib/ui'
import type { ThreadStatus } from '@/types/support'

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
