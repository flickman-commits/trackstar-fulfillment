/**
 * The morning, from Attio.
 *
 * Two lists, one question each:
 *
 *   New outreach: deals at Not Contacted with a person to write to. How many
 *   is the daily cap minus what already went out today. Ones the overnight
 *   routine drafted come first, then by priority, then by race date.
 *
 *   Follow-ups: deals at Reached Out whose next touch is due. Due means the
 *   deal's next_action_date is today or earlier, or, when nobody set one, the
 *   cadence gap has passed since our last send. The touch number is Attio's
 *   touch_count plus one, so an email sent from Gmail directly and logged by
 *   the overnight upkeep still advances the sequence here.
 *
 * Deals at In Conversation or later are a person's job, not a sequence's,
 * and never appear. Skips hide a deal until tomorrow. "Mine" means the deals
 * whose Attio owner is the signed-in person; unowned deals show for everyone
 * so nothing falls between two reps.
 */
import prisma from '../../db.js'
import { loadDeals, getDeal, memberForEmail } from './attio.js'
import { cadenceFor, looksLikeMailbox } from './angles.js'
import { getSettings, startOfToday } from './settings.js'
import { isGenericInbox } from './guardrails.js'

const OPEN_FOR_OUTREACH = ['Not Contacted']
const OPEN_FOR_FOLLOW_UP = ['Reached Out']
const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 }
/** Highest priority first, then whatever the list's own tiebreaker is. Deals with no priority set come last. */
const byPriority = (a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)

/** Race or Charity, as the cadence file spells it. Corporate follows the race cadence for now. */
export function pipelineOf(deal) {
  return deal.motion === 'Charity' ? 'CHARITY' : 'RACE'
}

/**
 * Touches so far. Attio's count, except that a deal at Reached Out has been
 * written to at least once whatever the counter says; many were moved there
 * by hand before anything counted.
 */
export function touchesSoFar(deal) {
  const n = Number(deal.touchCount || 0)
  return deal.stage === 'Reached Out' ? Math.max(n, 1) : n
}

/** Which touch comes next, from Attio's count. */
export function nextStepFor(deal) {
  const cadence = cadenceFor(pipelineOf(deal))
  const done = touchesSoFar(deal)
  const touchNumber = Math.min(done + 1, cadence.length)
  return { touchNumber, step: cadence[touchNumber - 1], cadenceLength: cadence.length, exhausted: done >= cadence.length }
}

/**
 * The person to write to: first with a real address. A generic inbox
 * (info@, sponsorship@, office@) has gone unanswered every time and the
 * house rules say never; a person who only has one counts as having none.
 */
export function primaryPerson(deal) {
  const usable = p => p.emails?.find(e => !isGenericInbox(e)) || (p.email && !isGenericInbox(p.email) ? p.email : null)
  const real = deal.people.find(p => usable(p))
  if (real) return withDisplay({ ...real, email: usable(real) })
  const any = deal.people[0]
  return any ? withDisplay({ ...any, email: null, genericEmail: any.email || null }) : null
}

/**
 * A person whose Attio name is really their mailbox is shown by address, so
 * nobody reads "lmcelrath" as a first name. The email itself still greets
 * them as "there". Fixing the name in Attio fixes both.
 */
function withDisplay(p) {
  if (!looksLikeMailbox(p)) return p
  return { ...p, nameIsMailbox: true, fullName: p.email || p.genericEmail || p.fullName || 'Unknown name', firstName: '', lastName: '' }
}

function daysBetween(a, b) { return Math.floor((b.getTime() - a.getTime()) / 86400000) }

/**
 * When we last wrote to them: the tool's own log first, else Attio's synced
 * last email interaction on the company or the person, which covers emails
 * sent straight from Gmail before the tool existed.
 */
function lastContactAt(deal, lastSend) {
  if (lastSend?.sentAt) return new Date(lastSend.sentAt)
  const person = deal.person || primaryPerson(deal)
  const at = deal.company?.lastEmailAt || person?.lastEmailAt || null
  return at ? new Date(at) : null
}

function isDue(deal, lastSend, dayStart) {
  if (deal.nextActionDate) return new Date(`${deal.nextActionDate}T00:00:00`) <= new Date(dayStart.getTime() + 86400000 - 1)
  const last = lastContactAt(deal, lastSend)
  if (!last) return true
  const { step } = nextStepFor(deal)
  const gap = step?.days ?? 4
  return daysBetween(last, new Date()) >= gap
}

function overdueDays(deal, dayStart) {
  if (!deal.nextActionDate) return 0
  const due = new Date(`${deal.nextActionDate}T00:00:00`)
  return Math.max(0, daysBetween(due, dayStart))
}

function reasonFor(deal, lastSend, prep) {
  const { touchNumber, step, exhausted } = nextStepFor(deal)
  if (exhausted) return 'Sequence complete · decide next year vs. lost'
  if (touchNumber === 1) return `First touch${deal.priority ? ` · ${deal.priority} priority` : ''}${prep ? ' · written overnight' : ''}`
  const last = lastContactAt(deal, lastSend)
  const ago = last ? daysBetween(last, new Date()) : null
  return `Touch ${touchNumber} · ${step.angle}${ago != null ? ` · last emailed ${ago}d ago, no reply` : ''}${prep ? ' · written overnight' : ''}`
}

/** A deal as the page shows it: the Attio view plus what the send log and prep table add. */
function shape(deal, { lastSend, prep, skip, dayStart }) {
  const { touchNumber, step, exhausted } = nextStepFor(deal)
  const person = primaryPerson(deal)
  return {
    ...deal,
    pipeline: pipelineOf(deal),
    person,
    hasEmail: Boolean(person?.email),
    genericOnly: Boolean(person && !person.email && person.genericEmail),
    nextTouchNumber: exhausted ? null : touchNumber,
    nextAngle: exhausted ? null : step.angle,
    exhausted,
    lastSentAt: lastContactAt(deal, lastSend)?.toISOString() || null,
    lastSubject: lastSend?.subject || null,
    hasPrep: Boolean(prep),
    preparedAt: prep?.preparedAt || null,
    skippedUntil: skip?.until || null,
    overdueDays: overdueDays(deal, dayStart),
    reason: reasonFor(deal, lastSend, prep),
  }
}

/** Latest send per deal, and today's sends, from the log. */
async function sendIndex(dayStart) {
  const sends = await prisma.salesSend.findMany({ orderBy: { sentAt: 'desc' }, select: { attioDealId: true, sentAt: true, subject: true, touchNumber: true, gmailThreadId: true, rfcMessageId: true } })
  const lastByDeal = {}
  for (const s of sends) if (s.attioDealId && !lastByDeal[s.attioDealId]) lastByDeal[s.attioDealId] = s
  const today = sends.filter(s => s.sentAt >= dayStart)
  return { lastByDeal, today }
}

/**
 * Resolve "mine" to an Attio owner id. A signed-in person who is not a
 * workspace member sees unowned deals only; the page says why.
 */
async function ownerFilter(actor, scopeMode) {
  if (scopeMode === 'all') return { ownerId: null, member: null, matches: () => true }
  const member = await memberForEmail(actor?.email)
  const ownerId = member?.id || null
  return { ownerId, member, matches: d => !d.ownerId || (ownerId && d.ownerId === ownerId) }
}

/**
 * Everything the Sales page needs, in one call.
 */
export async function morningQueue(actor, { scopeMode = 'mine', motion = null, fresh = false, uncapped = false } = {}) {
  const settings = await getSettings()
  const cap = settings.dailyCap
  const now = new Date()
  const dayStart = startOfToday(settings.timezone, now)
  const weekStart = new Date(dayStart.getTime() - 6 * 86400000)

  const [deals, { lastByDeal, today }, preps, skips, owner] = await Promise.all([
    loadDeals({ fresh }),
    sendIndex(dayStart),
    prisma.salesPrep.findMany(),
    prisma.salesSkip.findMany({ where: { until: { gt: now } } }),
    ownerFilter(actor, scopeMode),
  ])
  const prepByDeal = Object.fromEntries(preps.map(p => [p.attioDealId, p]))
  const skipByDeal = Object.fromEntries(skips.map(s => [s.attioDealId, s]))
  const sentTodayIds = new Set(today.map(s => s.attioDealId).filter(Boolean))

  const inScope = deals.filter(d => owner.matches(d) && (!motion || d.motion === motion))
  const ctx = d => ({ lastSend: lastByDeal[d.id], prep: prepByDeal[d.id], skip: skipByDeal[d.id], dayStart })

  // What went out today, in order, whoever's it is.
  const sentToday = today
    .map(s => { const d = s.attioDealId && deals.find(x => x.id === s.attioDealId); return d ? { ...shape(d, ctx(d)), sentAt: s.sentAt, sentSubject: s.subject } : null })
    .filter(Boolean)
    .sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt))

  // New outreach: not yet contacted, someone to write to, not skipped.
  // "Not Contacted" is only believed when Attio's inbox sync agrees: a deal
  // whose company or person already has an email interaction was written
  // to before the stage was kept, and is not a first touch.
  const notContacted = inScope
    .filter(d => OPEN_FOR_OUTREACH.includes(d.stage) && !sentTodayIds.has(d.id) && !skipByDeal[d.id])
    .map(d => shape(d, ctx(d)))
  const contactedBefore = notContacted.filter(d => d.lastSentAt)
  const fresh_ = notContacted.filter(d => !d.lastSentAt)
  const newReady = fresh_.filter(d => d.hasEmail).sort((a, b) =>
    byPriority(a, b)
    || Number(b.hasPrep) - Number(a.hasPrep)
    || String(a.raceDate || '9999').localeCompare(String(b.raceDate || '9999'))
    || String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
  const needsContact = fresh_.filter(d => !d.hasEmail)
  const room = Math.max(0, cap - today.length)

  // Follow-ups: reached out, the clock has run, not skipped.
  const reached = inScope
    .filter(d => OPEN_FOR_FOLLOW_UP.includes(d.stage) && !sentTodayIds.has(d.id) && !skipByDeal[d.id])
    .map(d => shape(d, ctx(d)))
  const due = reached.filter(d => d.hasEmail && !d.exhausted && isDue(d, lastByDeal[d.id], dayStart))
    .sort((a, b) => byPriority(a, b) || b.overdueDays - a.overdueDays || Number(b.hasPrep) - Number(a.hasPrep))
  const later = reached.filter(d => d.hasEmail && !d.exhausted && !isDue(d, lastByDeal[d.id], dayStart))
    .sort((a, b) => byPriority(a, b) || String(a.nextActionDate || '9999').localeCompare(String(b.nextActionDate || '9999')))
  const exhausted = reached.filter(d => d.exhausted)

  const weekSent = await prisma.salesSend.count({ where: { sentAt: { gte: weekStart } } })
  const skippedToday = inScope.filter(d => skipByDeal[d.id]).map(d => shape(d, ctx(d)))

  return {
    cap,
    room,
    scope: scopeMode === 'all' ? 'all' : 'mine',
    member: owner.member ? { id: owner.member.id, email: owner.member.email, name: `${owner.member.firstName} ${owner.member.lastName}`.trim() } : null,
    timezone: settings.timezone,
    undoSeconds: settings.undoSeconds,
    sentTodayCount: today.length,
    sentToday,
    newOutreach: uncapped ? newReady : newReady.slice(0, room),
    newWaiting: uncapped ? 0 : newReady.length - Math.min(newReady.length, room),
    followUps: due,
    later,
    exhausted,
    needsContact,
    contactedBefore: contactedBefore.sort((a, b) => String(b.lastSentAt).localeCompare(String(a.lastSentAt))),
    skipped: skippedToday,
    counts: {
      deals: deals.length,
      inScope: inScope.length,
      byStage: Object.fromEntries(Object.entries(inScope.reduce((m, d) => { m[d.stage || 'None'] = (m[d.stage || 'None'] || 0) + 1; return m }, {}))),
      week: { sent: weekSent },
    },
    overnight: await lastRun(),
  }
}

export const LAST_RUN_KEY = 'sales_last_run'

export async function lastRun() {
  const row = await prisma.systemConfig.findUnique({ where: { key: LAST_RUN_KEY } })
  if (!row?.value) return null
  try { return JSON.parse(row.value) } catch { return null }
}

/** One deal with everything the composer and the Who pane need. */
export async function dealForWork(dealId, { fresh = false } = {}) {
  const settings = await getSettings()
  const dayStart = startOfToday(settings.timezone, new Date())
  const deal = await getDeal(dealId, { fresh })
  if (!deal) throw new Error('That deal is not in Attio any more')
  const [sends, prep, skip] = await Promise.all([
    prisma.salesSend.findMany({ where: { attioDealId: dealId }, orderBy: { sentAt: 'asc' } }),
    prisma.salesPrep.findUnique({ where: { attioDealId: dealId } }),
    prisma.salesSkip.findUnique({ where: { attioDealId: dealId } }),
  ])
  const lastSend = sends[sends.length - 1] || null
  return {
    ...shape(deal, { lastSend, prep, skip: skip && skip.until > new Date() ? skip : null, dayStart }),
    sends: sends.map(s => ({ id: s.id, touchNumber: s.touchNumber, subject: s.subject, body: s.body, sentAt: s.sentAt, sentByEmail: s.sentByEmail, gmailThreadId: s.gmailThreadId, attachments: s.attachments, attioOk: s.attioOk })),
  }
}

/** Sends per day for the last 30 days and the stage spread, for the progress view. */
export async function progress(actor, { scopeMode = 'mine' } = {}) {
  const settings = await getSettings()
  const now = new Date()
  const start = new Date(startOfToday(settings.timezone, now).getTime() - 29 * 86400000)
  const sent = await prisma.salesSend.findMany({ where: { sentAt: { gte: start } }, select: { sentAt: true } })
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: settings.timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const days = []
  for (let i = 29; i >= 0; i--) days.push({ day: fmt.format(new Date(now.getTime() - i * 86400000)), sent: 0 })
  const idx = Object.fromEntries(days.map((d, i) => [d.day, i]))
  for (const t of sent) { const k = fmt.format(new Date(t.sentAt)); if (k in idx) days[idx[k]].sent++ }

  const deals = await loadDeals()
  const owner = await ownerFilter(actor, scopeMode)
  const mine = deals.filter(d => owner.matches(d))
  const byStage = {}
  for (const d of mine) byStage[d.stage || 'None'] = (byStage[d.stage || 'None'] || 0) + 1
  const at = (...stages) => stages.reduce((a, s) => a + (byStage[s] || 0), 0)
  const funnel = [
    { stage: 'Reached out', count: at('Reached Out', 'In Conversation', 'Call Booked', 'Deck Sent', 'Won') },
    { stage: 'In conversation', count: at('In Conversation', 'Call Booked', 'Deck Sent', 'Won') },
    { stage: 'Call booked', count: at('Call Booked', 'Deck Sent', 'Won') },
    { stage: 'Deck sent', count: at('Deck Sent', 'Won') },
    { stage: 'Won', count: at('Won') },
  ]
  return { days, totals: { sent: sent.length, won: at('Won'), inConversation: at('In Conversation', 'Call Booked', 'Deck Sent') }, funnel, byStage }
}

/**
 * Find a deal to write to outside the queue: any stage, matched on the deal
 * name, the company, or a person's name or address. For "New email".
 */
export async function searchDeals(q, { limit = 12 } = {}) {
  const needle = String(q || '').trim().toLowerCase()
  if (needle.length < 2) return []
  const deals = await loadDeals()
  const hit = d => [d.name, d.company?.name, ...d.people.flatMap(p => [p.fullName, ...(p.emails || [])])]
    .some(v => v && String(v).toLowerCase().includes(needle))
  return deals.filter(hit).slice(0, limit).map(d => {
    const person = primaryPerson(d)
    return { id: d.id, name: d.name, stage: d.stage, motion: d.motion, ownerId: d.ownerId, webUrl: d.webUrl, person: person ? { fullName: person.fullName, email: person.email } : null }
  })
}
