/**
 * Upsert companies and contacts from normalised records.
 *
 * Dedupe rules, in order:
 *   company: externalId (same source) -> domain -> name within the pipeline,
 *            compared case-insensitively.
 *   contact: email -> first+last name within the company.
 *
 * Imports fill blanks and never overwrite a value someone typed in the app,
 * unless `overwrite` is set. Stage is the one exception in reverse: a fresh
 * import never moves a deal backwards, so an existing stage wins unless
 * overwrite is on. Running the same file twice is therefore safe.
 */
import prisma from '../../db.js'
import { cadenceFor } from './angles.js'

const COMPANY_FIELDS = ['domain', 'website', 'city', 'state', 'runnerCount', 'raceDate', 'courseLandmark', 'tier', 'dealValueCents', 'units', 'notes', 'touchCount', 'lastTouchAt', 'nextActionAt', 'nextAction']
const CONTACT_FIELDS = ['email', 'title', 'linkedinUrl']

function norm(s) { return String(s || '').trim().toLowerCase() }

/** Stages where the ball is still in our court and a follow-up is owed. */
const OPEN_STAGES = new Set(['QUEUED', 'SENT', 'FOLLOWED_UP', 'REPLIED'])

/**
 * When a deal arrives mid-sequence from another system it carries a touch
 * count and a last-touch date but no next action, so it would never surface
 * in the Due queue and the tool would look empty on a pipeline that is
 * plainly alive. Derive the date the cadence implies: last touch plus that
 * step's gap. Anything already past shows up as overdue, which is the truth.
 */
function deriveNextAction(pipeline, stage, touchCount, lastTouchAt) {
  if (!lastTouchAt || !OPEN_STAGES.has(stage)) return null
  const cadence = cadenceFor(pipeline)
  const step = cadence[Math.min(Math.max(touchCount, 1), cadence.length) - 1]
  const at = new Date(new Date(lastTouchAt).getTime() + step.nextActionDays * 24 * 60 * 60 * 1000)
  const next = cadence[Math.min(touchCount, cadence.length - 1)]
  return {
    nextActionAt: at,
    nextAction: touchCount >= cadence.length
      ? 'Sequence complete: decide next year vs. pass'
      : `Send touch ${touchCount + 1}: ${next.angle}`,
  }
}

/** Merge: keep existing unless blank, or overwrite requested. */
function fill(existing, incoming, fields, overwrite) {
  const data = {}
  for (const f of fields) {
    const v = incoming[f]
    if (v === undefined || v === null || v === '') continue
    if (overwrite || existing[f] === null || existing[f] === undefined || existing[f] === '' || existing[f] === 0) data[f] = v
  }
  return data
}

async function findCompany({ pipeline, name, domain, externalId, source }) {
  if (externalId) {
    const byExt = await prisma.company.findFirst({ where: { pipeline, source, externalId } })
    if (byExt) return byExt
  }
  if (domain) {
    const byDomain = await prisma.company.findFirst({ where: { pipeline, domain: norm(domain) } })
    if (byDomain) return byDomain
  }
  return prisma.company.findFirst({ where: { pipeline, name: { equals: name.trim(), mode: 'insensitive' } } })
}

async function findContact(companyId, { email, firstName, lastName }) {
  if (email) {
    const byEmail = await prisma.contact.findUnique({ where: { email: norm(email) } })
    if (byEmail) return byEmail
  }
  if (firstName) {
    return prisma.contact.findFirst({
      where: {
        companyId,
        firstName: { equals: firstName.trim(), mode: 'insensitive' },
        lastName: { equals: (lastName || '').trim(), mode: 'insensitive' },
      },
    })
  }
  return null
}

/**
 * @param {Array<{ company: object, contact?: object|null, line?: number }>} records
 * @param {{ pipeline: 'RACE'|'CHARITY', source: string, overwrite?: boolean }} opts
 */
export async function importRecords(records, { pipeline, source, overwrite = false }) {
  const result = { companiesCreated: 0, companiesUpdated: 0, contactsCreated: 0, contactsUpdated: 0, skipped: [] }

  for (const rec of records) {
    const c = rec.company
    if (!c?.name) { result.skipped.push({ line: rec.line, reason: 'No company name' }); continue }
    try {
      const incoming = { ...c, domain: c.domain ? norm(c.domain) : null }
      let company = await findCompany({ pipeline, name: c.name, domain: incoming.domain, externalId: c.externalId, source })

      if (company) {
        const data = fill(company, incoming, COMPANY_FIELDS, overwrite)
        if (c.identityTags?.length) {
          const merged = Array.from(new Set([...(company.identityTags || []), ...c.identityTags]))
          if (merged.length !== (company.identityTags || []).length) data.identityTags = merged
        }
        if (c.stage && (overwrite || company.stage === 'NOT_CONTACTED')) data.stage = c.stage
        const derivedUpdate = company.nextActionAt ? null : deriveNextAction(pipeline, data.stage || company.stage, data.touchCount ?? company.touchCount, data.lastTouchAt ?? company.lastTouchAt)
        if (derivedUpdate) Object.assign(data, derivedUpdate)
        if (c.externalId && !company.externalId) { data.externalId = c.externalId; data.source = source }
        if (Object.keys(data).length) {
          company = await prisma.company.update({ where: { id: company.id }, data })
          result.companiesUpdated++
        }
      } else {
        company = await prisma.company.create({
          data: {
            pipeline,
            source,
            name: c.name.trim(),
            domain: incoming.domain,
            website: c.website || null,
            city: c.city || null,
            state: c.state || null,
            runnerCount: c.runnerCount ?? null,
            raceDate: c.raceDate || null,
            identityTags: c.identityTags || [],
            courseLandmark: c.courseLandmark || null,
            tier: c.tier || null,
            dealValueCents: c.dealValueCents ?? null,
            units: c.units ?? null,
            stage: c.stage || 'NOT_CONTACTED',
            touchCount: c.touchCount ?? 0,
            lastTouchAt: c.lastTouchAt || null,
            ...(deriveNextAction(pipeline, c.stage || 'NOT_CONTACTED', c.touchCount ?? 0, c.lastTouchAt) || { nextActionAt: c.nextActionAt || null, nextAction: c.nextAction || null }),
            notes: c.notes || null,
            externalId: c.externalId || null,
          },
        })
        result.companiesCreated++
      }

      const p = rec.contact
      if (p && (p.firstName || p.email)) {
        const email = p.email ? norm(p.email) : null
        const existing = await findContact(company.id, { ...p, email })
        if (existing) {
          const data = fill(existing, { ...p, email }, CONTACT_FIELDS, overwrite)
          if (existing.companyId !== company.id && overwrite) data.companyId = company.id
          if (Object.keys(data).length) {
            await prisma.contact.update({ where: { id: existing.id }, data })
            result.contactsUpdated++
          }
        } else {
          const others = await prisma.contact.count({ where: { companyId: company.id } })
          await prisma.contact.create({
            data: {
              companyId: company.id,
              firstName: (p.firstName || '').trim() || (email ? email.split('@')[0] : 'Unknown'),
              lastName: (p.lastName || '').trim(),
              email,
              title: p.title || null,
              linkedinUrl: p.linkedinUrl || null,
              isPrimary: others === 0,
              source,
              externalId: p.externalId || null,
            },
          })
          result.contactsCreated++
        }
      }
    } catch (err) {
      result.skipped.push({ line: rec.line, company: c.name, reason: err.message })
    }
  }

  return result
}
