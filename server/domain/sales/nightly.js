/**
 * What the overnight routine needs from the app, and what it hands back.
 *
 * The routine is a Claude session on Matt's plan. It does the reading,
 * searching and writing. This module gives it four things over MCP: the
 * queue for tomorrow with everything it needs to write each email, the rules,
 * a place to store research, and a place to store the draft. Nothing here
 * calls a model.
 *
 * The queue is ordered the way the morning should be worked: follow-ups whose
 * clock has run out first, because those people already know us, then orgs
 * nobody has written to that have someone to write to. Orgs with no email at
 * all are listed separately so the routine can go find a person before it
 * goes looking for new orgs.
 */
import prisma from '../../db.js'
import { cadenceFor, pickIdentityTag, RACE_ONE_LINERS, HOUSE_STYLE, CHARITY_RULES, DEFAULT_SOCIAL_PROOF, templateFor, greetingName } from './angles.js'
import { nextStepFor } from './drafting.js'
import { draftProblems, researchProblems, isGenericInbox } from './guardrails.js'
import { importRecords } from './importer.js'

const OPEN_STAGES = ['QUEUED', 'SENT', 'FOLLOWED_UP']
const DAILY_CAP = Number(process.env.SALES_DAILY_CAP) > 0 ? Number(process.env.SALES_DAILY_CAP) : 10

function contactView(c) {
  if (!c) return null
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    greeting: greetingName(c),
    email: c.email,
    emailSource: c.emailSource,
    title: c.title,
    linkedinUrl: c.linkedinUrl,
    research: c.research || null,
  }
}

async function companyView(company) {
  const { touchNumber, step, exhausted } = await nextStepFor(company)
  const primary = company.contacts.find(c => c.email) || company.contacts[0] || null
  const tag = company.pipeline === 'RACE' ? pickIdentityTag(company.identityTags) : null
  const previous = company.touches
    .filter(t => t.kind === 'EMAIL_DRAFT' || t.kind === 'EMAIL_SENT')
    .map(t => ({ touchNumber: t.touchNumber, subject: t.subject, sentAt: t.sentAt, body: (t.body || '').slice(0, 600) }))
  return {
    companyId: company.id,
    name: company.name,
    pipeline: company.pipeline,
    stage: company.stage,
    touchCount: company.touchCount,
    lastTouchAt: company.lastTouchAt,
    nextActionAt: company.nextActionAt,
    nextTouch: exhausted ? null : { touchNumber, angle: step.angle, purpose: step.purpose, subjectRule: step.subject },
    sequenceComplete: exhausted,
    identityTag: tag,
    identityOneLiner: tag && RACE_ONE_LINERS[tag] ? RACE_ONE_LINERS[tag](company) : null,
    courseLandmark: company.courseLandmark,
    raceDate: company.raceDate,
    runnerCount: company.runnerCount,
    tier: company.tier,
    notes: company.notes,
    website: company.website || (company.domain ? `https://${company.domain}` : null),
    contact: contactView(primary),
    hasProposedDraft: Boolean(company.proposedDraft),
    previousEmails: previous,
    // A draft written from a stored template, so the routine can see the
    // baseline it should beat rather than reinvent the structure.
    template: exhausted ? null : templateFor({
      pipeline: company.pipeline, angle: step.angle, company, contact: primary,
      oneLiner: tag && RACE_ONE_LINERS[tag] ? RACE_ONE_LINERS[tag](company) : undefined,
    }),
  }
}

const INCLUDE = {
  contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
  touches: { orderBy: { createdAt: 'desc' }, take: 6 },
}

/**
 * Tomorrow's work.
 *
 * `limit` defaults to the daily cap, which the routine must not exceed: the
 * emails go from a domain that also carries order confirmations, and a spike
 * costs more than a campaign earns. Already-drafted orgs are included with
 * hasProposedDraft=true so a re-run does not write them twice.
 */
export async function salesQueue({ limit = DAILY_CAP, pipeline, ownerId } = {}) {
  const now = new Date()
  const scope = {}
  if (pipeline === 'RACE' || pipeline === 'CHARITY') scope.pipeline = pipeline
  if (ownerId) scope.ownerId = ownerId

  const due = await prisma.company.findMany({
    where: { ...scope, stage: { in: OPEN_STAGES }, nextActionAt: { lte: now }, contacts: { some: { email: { not: null } } } },
    orderBy: { nextActionAt: 'asc' },
    take: limit,
    include: INCLUDE,
  })
  const remaining = Math.max(0, limit - due.length)
  const fresh = remaining
    ? await prisma.company.findMany({
        where: { ...scope, stage: 'NOT_CONTACTED', contacts: { some: { email: { not: null } } } },
        orderBy: [{ tier: 'asc' }, { createdAt: 'desc' }],
        take: remaining,
        include: INCLUDE,
      })
    : []
  const needsContact = await prisma.company.findMany({
    where: { ...scope, stage: 'NOT_CONTACTED', contacts: { none: { email: { not: null } } } },
    orderBy: [{ tier: 'asc' }, { createdAt: 'desc' }],
    take: 25,
    select: { id: true, name: true, pipeline: true, tier: true, notes: true, website: true, domain: true, contacts: { select: { firstName: true, lastName: true, title: true } } },
  })

  return {
    generatedAt: now.toISOString(),
    dailyCap: DAILY_CAP,
    due: await Promise.all(due.map(companyView)),
    new: await Promise.all(fresh.map(companyView)),
    needsContact: needsContact.map(c => ({
      companyId: c.id, name: c.name, pipeline: c.pipeline, tier: c.tier, notes: c.notes,
      website: c.website || (c.domain ? `https://${c.domain}` : null),
      knownPeople: c.contacts,
    })),
  }
}

/** Everything the routine needs to write in the house voice. Static; read once per run. */
export function salesRules() {
  return {
    houseStyle: HOUSE_STYLE,
    charityRules: CHARITY_RULES,
    socialProof: DEFAULT_SOCIAL_PROOF,
    cadence: { RACE: cadenceFor('RACE'), CHARITY: cadenceFor('CHARITY') },
    dailyCap: DAILY_CAP,
    guardrails: [
      'Drafts are checked on save: no em or en dashes; a charity first touch may not quote a price, a percentage or the unit minimum, and must say "poster" rather than "print"; nothing may imply money flows back to a charity.',
      'A lead with a generic inbox (info@, events@, race@) is refused. Find a person.',
      'Only email addresses found on the organisation\'s own site or returned by Apollo are sendable. A guessed pattern is stored as "guessed" and will not be sent to.',
    ],
  }
}

export async function saveResearch({ contactId, research }) {
  const problems = researchProblems(research)
  if (problems.length) throw new Error(`Research rejected: ${problems.join('; ')}`)
  const contact = await prisma.contact.findUnique({ where: { id: contactId } })
  if (!contact) throw new Error('Contact not found')
  const stored = {
    title: String(research.title || ''),
    linkedinUrl: research.linkedinUrl || null,
    personInfo: (research.personInfo || []).map(String).slice(0, 6),
    companyInfo: (research.companyInfo || []).map(String).slice(0, 6),
    sources: (research.sources || []).map(String).slice(0, 10),
    model: String(research.model || 'routine'),
    researchedAt: new Date().toISOString(),
  }
  const updated = await prisma.contact.update({
    where: { id: contactId },
    data: {
      research: stored,
      researchedAt: new Date(),
      ...(stored.linkedinUrl && !contact.linkedinUrl ? { linkedinUrl: stored.linkedinUrl } : {}),
      ...(stored.title && !contact.title ? { title: stored.title } : {}),
    },
  })
  return { contactId: updated.id, stored: true, facts: stored.personInfo.length + stored.companyInfo.length }
}

/**
 * Hold a draft for the morning. Rejected outright if it breaks a rule, with
 * the reasons, so the author can fix it and try again.
 */
export async function saveDraft({ companyId, contactId, variants, touchNumber, source = 'routine', preparedBy }) {
  const company = await prisma.company.findUnique({ where: { id: companyId }, include: { contacts: true } })
  if (!company) throw new Error('Company not found')
  const contact = contactId ? company.contacts.find(c => c.id === contactId) : company.contacts.find(c => c.email)
  if (!contact) throw new Error('No contact with an email to write to')
  if (!contact.email) throw new Error(`${contact.firstName} has no email address`)

  const { touchNumber: expected, step, exhausted } = await nextStepFor(company)
  if (exhausted) throw new Error(`${company.name} has completed its sequence. Decide next year vs. pass instead of drafting.`)
  if (touchNumber && touchNumber !== expected) {
    throw new Error(`This org is on touch ${expected} (${step.angle}), not touch ${touchNumber}. Draft that one.`)
  }

  const list = (Array.isArray(variants) ? variants : [variants])
    .map(v => ({ subject: String(v?.subject || '').trim(), body: String(v?.body || '').trim() }))
    .filter(v => v.subject || v.body)
  if (!list.length) throw new Error('No variants given')
  if (list.length > 5) throw new Error('At most five variants')

  const rejected = list.map((v, i) => ({ i, problems: draftProblems(v, { pipeline: company.pipeline, touchNumber: expected }) })).filter(x => x.problems.length)
  if (rejected.length) {
    throw new Error('Draft rejected: ' + rejected.map(r => `variant ${r.i + 1}: ${r.problems.join('; ')}`).join(' | '))
  }

  const proposedDraft = {
    touchNumber: expected,
    angle: step.angle,
    contactId: contact.id,
    variants: list,
    source,
    preparedBy: preparedBy || null,
    preparedAt: new Date().toISOString(),
  }
  await prisma.company.update({ where: { id: companyId }, data: { proposedDraft, proposedAt: new Date() } })
  return { companyId, touchNumber: expected, angle: step.angle, variants: list.length, stored: true }
}

/**
 * A new org and person from sourcing. Goes through the same importer as CSV
 * and the one-time migrations, so dedupe and fill-blanks rules hold.
 */
export async function addLead({ pipeline, company, contact, emailSource = 'website', ownerId }) {
  if (!['RACE', 'CHARITY'].includes(pipeline)) throw new Error('pipeline must be RACE or CHARITY')
  if (!company?.name) throw new Error('company.name is required')
  if (contact?.email && isGenericInbox(contact.email)) {
    throw new Error(`${contact.email} is a generic inbox. Every generic address has gone unanswered; find a named person.`)
  }
  if (contact?.email && !['website', 'apollo', 'manual', 'import', 'guessed'].includes(emailSource)) {
    throw new Error('emailSource must be one of website, apollo, manual, import, guessed')
  }
  const result = await importRecords(
    [{ line: 1, company: { ...company, stage: company.stage || null }, contact: contact || null }],
    { pipeline, source: 'agent', overwrite: false },
  )
  if (result.skipped.length) throw new Error(result.skipped[0].reason)

  // The importer does not know about emailSource or owner; stamp them after.
  const row = await prisma.company.findFirst({
    where: { pipeline, name: { equals: company.name.trim(), mode: 'insensitive' } },
    include: { contacts: true },
  })
  if (row) {
    if (ownerId && !row.ownerId) await prisma.company.update({ where: { id: row.id }, data: { ownerId } })
    if (contact?.email) {
      const c = row.contacts.find(x => x.email === contact.email.toLowerCase().trim())
      if (c && !c.emailSource) await prisma.contact.update({ where: { id: c.id }, data: { emailSource } })
    }
  }
  return {
    companyId: row?.id || null,
    created: result.companiesCreated > 0,
    updated: result.companiesUpdated > 0,
    contactCreated: result.contactsCreated > 0,
    contactId: row?.contacts.find(x => contact?.email && x.email === contact.email.toLowerCase().trim())?.id || null,
  }
}

export const LAST_RUN_KEY = 'sales_last_run'

/**
 * The routine's own account of the night, kept where the Sales page can show
 * it. A run that stores nothing is a run that did not finish, which is the
 * signal that matters most.
 */
export async function finishRun({ prepared = 0, followUps = 0, fresh = 0, leadsAdded = 0, researched = 0, skipped = [], notes = '' }) {
  const summary = {
    finishedAt: new Date().toISOString(),
    prepared: Number(prepared) || 0,
    followUps: Number(followUps) || 0,
    fresh: Number(fresh) || 0,
    leadsAdded: Number(leadsAdded) || 0,
    researched: Number(researched) || 0,
    skipped: (Array.isArray(skipped) ? skipped : []).map(String).slice(0, 20),
    notes: String(notes || '').slice(0, 2000),
  }
  await prisma.systemConfig.upsert({
    where: { key: LAST_RUN_KEY },
    update: { value: JSON.stringify(summary) },
    create: { key: LAST_RUN_KEY, value: JSON.stringify(summary) },
  })
  return summary
}

export async function lastRun() {
  const row = await prisma.systemConfig.findUnique({ where: { key: LAST_RUN_KEY } })
  if (!row?.value) return null
  try { return JSON.parse(row.value) } catch { return null }
}
