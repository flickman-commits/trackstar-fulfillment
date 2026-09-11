/**
 * The rules a draft has to pass before the app will hold it.
 *
 * Whoever wrote the email - the model in the UI, the nightly routine, a person
 * pasting - the same checks run on save. That is the point: the runbook's
 * rules are enforced by the system of record, not trusted to the author.
 * Each returns a plain-English reason so the author can fix it.
 */

const DASHES = /[—–]/
const MONEY_WORDS = /revenue share|rev share|donation[- ]back|donate back|commission|share of every|percentage of (each|every)/i
const GENERIC_INBOX = /^(info|hello|hi|contact|admin|office|team|events|race|support|press|media|marketing|donate|volunteer|noreply|no-reply)@/i

/**
 * @param {{ subject: string, body: string }} draft
 * @param {{ pipeline: 'RACE'|'CHARITY', touchNumber: number }} ctx
 * @returns {string[]} problems; empty means it passes
 */
export function draftProblems(draft, { pipeline, touchNumber }) {
  const problems = []
  const subject = String(draft?.subject || '')
  const body = String(draft?.body || '')
  const all = `${subject}\n${body}`

  if (!subject.trim()) problems.push('Subject is empty')
  if (!body.trim()) problems.push('Body is empty')
  if (DASHES.test(all)) problems.push('Contains an em or en dash. Use a comma or a full stop; never a dash in anything sent to a person.')
  if (body.length > 1600) problems.push('Body is over 1,600 characters. These emails are under 120 words.')

  if (pipeline === 'CHARITY') {
    if (MONEY_WORDS.test(all)) problems.push('Implies money flows back to the charity. There is no revenue share, commission or donation-back; the program deliberately offers none.')
    if (touchNumber === 1) {
      if (/\$\s?\d/.test(all)) problems.push('Quotes a price in a first touch. No numbers before the call.')
      if (/\d+\s?%/.test(all)) problems.push('Quotes a percentage in a first touch. No numbers before the call.')
      if (/\b\d{2,3}[ -]?unit/i.test(all)) problems.push('Mentions the unit minimum in a first touch. No numbers before the call.')
      if (/\bprints?\b/i.test(all) && !/\bposters?\b/i.test(all)) problems.push('Says "prints" with no "poster". Cold charity outreach says posters.')
    }
  }
  return problems
}

/** A mailbox nobody reads. The runbook: every generic address has gone unanswered. */
export function isGenericInbox(email) {
  return GENERIC_INBOX.test(String(email || '').trim())
}

/** Shape check for research the routine hands back, so junk never lands on a contact. */
export function researchProblems(research) {
  const problems = []
  if (!research || typeof research !== 'object') return ['Research must be an object']
  for (const k of ['personInfo', 'companyInfo', 'sources']) {
    if (research[k] !== undefined && !Array.isArray(research[k])) problems.push(`${k} must be an array of strings`)
  }
  if (research.linkedinUrl && !/^https:\/\/www\.linkedin\.com\/in\/[^\s"]+/i.test(research.linkedinUrl)) {
    problems.push('linkedinUrl must be an exact https://www.linkedin.com/in/... profile URL, or omitted')
  }
  return problems
}
