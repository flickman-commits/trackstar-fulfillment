/**
 * Where an approved print is on its way to Artelo production, from its
 * RenderJob row (written by arteloSend.js). The one vocabulary: the order
 * pipeline (orders/pipeline.js) and the order view both read it.
 *
 *   queued   waiting out the hold, or a short wait the sender gets past on its own
 *   held     a person held it
 *   waiting  attached; the Artelo order has other prints still to come
 *   blocked  Artelo would not take it; under Action with the reason
 *   sent     Artelo has it
 *   null     approved without sending (Approve only, or before Approve sent things)
 */
export const WAITING = 'Waiting on the other prints'

// Waits that clear on their own within minutes: still "Sending to production", not a problem.
const PASSING = /^(Artelo is still processing|Artelo has not imported this order yet|The print is not in the Artelo library yet|Could not reach Artelo: (?!.*\b40[13]\b))/

/** @returns {{ state: string, at?: Date|null, by?: string|null, reason?: string, next?: Date|null } | null} */
export function sendStateOf(job) {
  if (!job || job.review !== 'approved') return null
  if (job.arteloSentAt) return { state: 'sent', at: job.arteloSentAt }
  if (job.sendHeldAt) return { state: 'held', at: job.sendHeldAt, by: job.sendHeldBy || null }
  if (job.sendError && job.sendError.startsWith(WAITING)) return { state: 'waiting', reason: job.sendError, next: job.sendAfter }
  if (job.sendError && job.sendAfter && PASSING.test(job.sendError)) return { state: 'queued', at: job.sendAfter, reason: job.sendError }
  if (job.sendError) return { state: 'blocked', reason: job.sendError, next: job.sendAfter }
  if (job.sendAfter) return { state: 'queued', at: job.sendAfter }
  return null
}
