/**
 * Turn a spreadsheet into import records.
 *
 * Nobody's lead list has the same headers. This table maps the spellings we
 * have met (Apollo, HubSpot, Google Sheets, hand-typed) onto our fields; the
 * matcher prefers an exact header match and falls back to "contains". The
 * header table is the part of the old outreach tool worth keeping, extended
 * with the race and charity fields the CRM has.
 *
 * Output is a list of normalised records that importRecords() understands,
 * so the CSV path and the ClickUp/Notion paths converge on the same shape.
 */

const HEADERS = {
  firstName: ['first name', 'firstname', 'first_name', 'given name', 'first'],
  lastName: ['last name', 'lastname', 'last_name', 'surname', 'family name', 'last'],
  fullName: ['contact name', 'full name', 'race contact', 'contact', 'person', 'name'],
  email: ['email', 'email address', 'contact email', 'e-mail', 'email_address', 'work email'],
  title: ['title', 'job title', 'position', 'role', 'job_title'],
  linkedinUrl: ['linkedin', 'linkedin url', 'linkedin profile', 'person linkedin url'],
  company: ['company', 'company name', 'organization', 'organisation', 'org', 'race', 'race name', 'charity', 'business', 'company_name', 'account'],
  domain: ['domain', 'company domain', 'website domain'],
  website: ['website', 'url', 'company website', 'web'],
  city: ['city', 'company city'],
  state: ['state', 'company state', 'region'],
  runnerCount: ['runners', 'runner count', 'finishers', 'participants', 'field size', 'size'],
  raceDate: ['race date', 'event date', 'date'],
  identityTags: ['identity', 'race identity', 'identity tags', 'tags'],
  courseLandmark: ['landmark', 'course landmark'],
  tier: ['tier'],
  stage: ['stage', 'status'],
  notes: ['notes', 'note', 'comments'],
}

/** Which header index feeds which field. Exact match beats contains. */
export function mapHeaders(headers) {
  const clean = headers.map(h => (h || '').toLowerCase().trim())
  const mapping = {}
  const taken = new Set()
  // Two passes so an exact "name" beats a header that merely contains "name".
  for (const pass of ['exact', 'contains']) {
    for (const [field, variants] of Object.entries(HEADERS)) {
      if (mapping[field] !== undefined) continue
      const idx = clean.findIndex((h, i) =>
        !taken.has(i) && h && variants.some(v => pass === 'exact' ? h === v : h.includes(v)))
      if (idx >= 0) { mapping[field] = idx; taken.add(idx) }
    }
  }
  return mapping
}

export function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

/** "https://www.chicagomarathon.com/results" -> "chicagomarathon.com" */
export function domainFromUrl(url) {
  if (!url) return null
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
    return u.hostname.replace(/^www\./i, '').toLowerCase() || null
  } catch { return null }
}

const FREEMAIL = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'me.com', 'live.com'])

/** Company domain from a work email; null for personal mailboxes. */
export function domainFromEmail(email) {
  const at = String(email || '').lastIndexOf('@')
  if (at < 0) return null
  const d = email.slice(at + 1).toLowerCase().trim()
  return FREEMAIL.has(d) ? null : d
}

const STAGE_WORDS = {
  NOT_CONTACTED: ['not contacted', 'not started', 'new', 'todo', 'to do', 'open'],
  QUEUED: ['queued'],
  SENT: ['sent', 'contacted', 'awaiting response', 'emailed'],
  FOLLOWED_UP: ['followed up', 'follow up', 'follow-up', 'contacted - no answer', 'no answer'],
  REPLIED: ['replied', 'in conversation', 'responded'],
  CALL_BOOKED: ['call booked', 'meeting booked', 'call scheduled'],
  PROPOSAL_SENT: ['proposal sent', 'proposal'],
  INTERESTED: ['interested', 'warm'],
  SIGNED: ['signed', 'won', 'closed won', 'partner'],
  INVOICED: ['invoiced'],
  PAID: ['paid'],
  NEXT_YEAR: ['hit up next year', 'next year', 'later', 'revisit'],
  PASSED: ['passed', 'lost', 'closed lost', 'dead'],
  NOT_INTERESTED: ['not interested', 'declined', 'no'],
}

/**
 * Free-text status from any system -> our enum, or null when unrecognised.
 *
 * Three passes, narrowest first: the enum name itself, then an exact phrase,
 * then a phrase appearing inside a longer status. The last pass only accepts
 * phrases of two words or more. A bare word is too greedy - "no" would have
 * matched "Nominated" and "Now scheduling" and quietly filed both as Not
 * interested, which is the kind of mistake nobody goes looking for.
 */
export function normalizeStage(text) {
  const t = String(text || '').toLowerCase().trim()
  if (!t) return null
  const asEnum = t.toUpperCase().replace(/[\s-]+/g, '_')
  if (STAGE_WORDS[asEnum]) return asEnum
  for (const [stage, words] of Object.entries(STAGE_WORDS)) {
    if (words.some(w => t === w)) return stage
  }
  for (const [stage, words] of Object.entries(STAGE_WORDS)) {
    if (words.some(w => w.includes(' ') && t.includes(w))) return stage
  }
  return null
}

function parseIntSafe(v) {
  const n = parseInt(String(v || '').replace(/[^\d-]/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

function parseDateSafe(v) {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * CSV -> records. Every row becomes a company plus, when the row names a
 * person or an email, one contact. Rows with neither a company nor a person
 * are reported, not silently dropped.
 */
export function csvToRecords({ headers, rows }) {
  const mapping = mapHeaders(headers)
  const get = (row, field) => mapping[field] === undefined ? '' : (row[mapping[field]] || '').trim()
  const records = []
  const skipped = []

  rows.forEach((row, i) => {
    const lineNo = i + 2 // 1-based, after the header line
    let firstName = get(row, 'firstName')
    let lastName = get(row, 'lastName')
    if (!firstName && !lastName) ({ firstName, lastName } = splitName(get(row, 'fullName')))
    const email = get(row, 'email').toLowerCase() || null
    const website = get(row, 'website') || null
    const domain = get(row, 'domain').toLowerCase() || domainFromUrl(website) || domainFromEmail(email)
    let companyName = get(row, 'company')
    if (!companyName && domain) companyName = domain.split('.')[0].replace(/[-_]+/g, ' ')

    if (!companyName) {
      skipped.push({ line: lineNo, reason: 'No company or race name, and no domain to derive one from' })
      return
    }

    const tags = get(row, 'identityTags').split(/[;,|]/).map(s => s.trim()).filter(Boolean)
    const record = {
      line: lineNo,
      company: {
        name: companyName,
        domain,
        website,
        city: get(row, 'city') || null,
        state: get(row, 'state') || null,
        runnerCount: parseIntSafe(get(row, 'runnerCount')),
        raceDate: parseDateSafe(get(row, 'raceDate')),
        identityTags: tags,
        courseLandmark: get(row, 'courseLandmark') || null,
        tier: get(row, 'tier') || null,
        stage: normalizeStage(get(row, 'stage')),
        notes: get(row, 'notes') || null,
      },
      contact: (firstName || lastName || email) ? {
        firstName: firstName || (email ? email.split('@')[0] : ''),
        lastName,
        email,
        title: get(row, 'title') || null,
        linkedinUrl: get(row, 'linkedinUrl') || null,
      } : null,
    }
    records.push(record)
  })

  return { mapping, records, skipped, headers }
}
