/**
 * Cold email suggestions, from what has worked (Oct 2026):
 *   - bodies under 100 words got an 11% reply rate
 *   - two follow-ups at most
 *   - one-word subject lines opened best; keep subjects under 30 characters
 *   - send on Tuesday or Wednesday
 *
 * Suggestions only: shown in amber, never block a send. One place, so the
 * numbers change here when the next round of results comes in.
 */
export const TIPS = {
  maxWords: 100,
  replyRate: '11%',
  maxSubjectChars: 30,
  maxFollowUps: 2,
  bestDays: [2, 3] as number[], // Tuesday, Wednesday (Date.getDay)
}

const MD_LINK = /\[([^\]\n]+)\]\([^)\s]+\)/g

/** Words the reader reads: links count as their words, [Variables] as one word. */
export function wordCount(body: string) {
  return String(body || '').replace(MD_LINK, '$1').split(/\s+/).filter(Boolean).length
}

/** A reply on the thread keeps its subject; the subject tips are for a fresh one. */
export function isThreadReply(subject: string) {
  return /^\s*re:/i.test(subject || '')
}

export function subjectWords(subject: string) {
  return String(subject || '').trim().split(/\s+/).filter(Boolean).length
}

export function isBestDay(d = new Date()) {
  return TIPS.bestDays.includes(d.getDay())
}

/** Touch 1 is the first email, so touch 3 is the second follow-up, the last one worth sending. */
export function pastFollowUps(touchNumber: number) {
  return touchNumber > TIPS.maxFollowUps + 1
}
