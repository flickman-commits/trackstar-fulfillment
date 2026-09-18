/**
 * What the overnight routine needs from the app, and what it hands back.
 *
 * The routine is a Claude session on Matt's plan, running the CRM upkeep
 * skill. It reads Attio through its own connector for everything else; it
 * comes here for three things it cannot get from Attio: tomorrow's queue
 * with the cadence step and the template for each deal, the house rules as
 * live settings, and a place to leave the draft it wrote so the morning
 * finds it under the deal. Nothing here calls a model.
 *
 * The queue is per rep: each Attio owner gets up to the daily cap of new
 * outreach plus every follow-up that is due, and unowned deals go in a
 * shared pool so nobody's lead waits on an assignment.
 */
import prisma from '../../db.js'
import { cadenceFor, HOUSE_STYLE, CHARITY_RULES, templateFor, greetingName, RACE_ONE_LINERS } from './angles.js'
import { workspaceMembers } from './attio.js'
import { morningQueue, dealForWork, nextStepFor, pipelineOf, LAST_RUN_KEY, lastRun } from './queue.js'
import { buildTemplate } from './drafting.js'
import { draftProblems } from './guardrails.js'
import { getSettings } from './settings.js'

export { lastRun }

function queueItem(d, settings) {
  const step = d.nextTouchNumber ? cadenceFor(d.pipeline)[d.nextTouchNumber - 1] : null
  return {
    dealId: d.id,
    name: d.name,
    motion: d.motion,
    pipeline: d.pipeline,
    stage: d.stage,
    ownerId: d.ownerId,
    priority: d.priority,
    sizeTier: d.sizeTier,
    raceDate: d.raceDate,
    runners: d.runners,
    touchCount: d.touchCount,
    nextActionDate: d.nextActionDate,
    nextAction: d.nextAction,
    lastSentAt: d.lastSentAt,
    lastSubject: d.lastSubject,
    hasPrep: d.hasPrep,
    attioUrl: d.webUrl,
    nextTouch: step ? { touchNumber: d.nextTouchNumber, angle: step.angle, purpose: step.purpose, subjectRule: step.subject } : null,
    person: d.person ? {
      personId: d.person.id, firstName: d.person.firstName, lastName: d.person.lastName, greeting: greetingName(d.person),
      email: d.person.email, title: d.person.title, description: d.person.description, linkedin: d.person.linkedin, location: d.person.location,
    } : null,
    company: d.company ? {
      name: d.company.name, domain: d.company.domain, description: d.company.description, location: d.company.location,
      categories: d.company.categories, employeeRange: d.company.employeeRange,
    } : null,
    dealNotes: d.notes,
    identityOneLiner: d.pipeline === 'RACE' && d.identity && RACE_ONE_LINERS[d.identity] ? RACE_ONE_LINERS[d.identity]({ name: d.name, courseLandmark: d.courseLandmark, city: d.company?.location }) : null,
    template: step ? buildTemplate(d, d.person, step, { socialProof: settings.socialProof }) : null,
  }
}

/**
 * Tomorrow's work, per owner. Deals already drafted tonight carry
 * hasPrep=true so a re-run does not write them twice.
 */
export async function salesQueue({ motion } = {}) {
  const settings = await getSettings()
  const q = await morningQueue(null, { scopeMode: 'all', motion: motion || null, fresh: true, uncapped: true })
  const members = await workspaceMembers()
  const byOwner = {}
  const owners = [...new Set([...q.newOutreach, ...q.followUps].map(d => d.ownerId || 'unowned'))]
  // Per-owner cap on new outreach; follow-ups are never capped, they are owed.
  for (const key of owners) {
    const m = members.find(x => x.id === key)
    const mine = d => (d.ownerId || 'unowned') === key
    byOwner[key] = {
      owner: m ? { id: m.id, name: `${m.firstName} ${m.lastName}`.trim(), email: m.email } : null,
      followUps: q.followUps.filter(mine).map(d => queueItem(d, settings)),
      newOutreach: q.newOutreach.filter(mine).slice(0, settings.dailyCap).map(d => queueItem(d, settings)),
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    dailyCap: settings.dailyCap,
    byOwner,
    needsContact: q.needsContact.map(d => ({ dealId: d.id, name: d.name, motion: d.motion, attioUrl: d.webUrl, knownPeople: d.people.map(p => ({ name: p.fullName, title: p.title })) })),
    exhausted: q.exhausted.map(d => ({ dealId: d.id, name: d.name, touchCount: d.touchCount, attioUrl: d.webUrl })),
  }
}

export async function salesRules() {
  const settings = await getSettings()
  return {
    houseStyle: HOUSE_STYLE,
    charityRules: CHARITY_RULES,
    sender: settings.sender,
    socialProof: settings.socialProof,
    cadence: { RACE: cadenceFor('RACE'), CHARITY: cadenceFor('CHARITY') },
    dailyCap: settings.dailyCap,
    guardrails: [
      'Drafts are checked on save: no em or en dashes; a charity first touch may not quote a price, a percentage or the unit minimum, and must say "poster" rather than "print"; nothing may imply money flows back to a charity.',
      'Write to the person on the deal. If the deal has nobody with an email, it is in needsContact: find a named person and add them to the deal in Attio, never a generic inbox.',
      'The touch number must match the deal\'s next step, which comes from Attio\'s touch_count.',
    ],
  }
}

/**
 * Hold a draft for the morning. Rejected outright if it breaks a rule, with
 * the reasons, so the author can fix it and try again.
 */
export async function saveDraft({ dealId, personId, variants, touchNumber, source = 'routine' }) {
  const deal = await dealForWork(dealId, { fresh: true })
  const person = (personId && deal.people.find(p => p.id === personId)) || deal.person
  if (!person?.email) throw new Error('No person with an email on this deal. Add one in Attio first.')
  const { touchNumber: expected, step, exhausted } = nextStepFor(deal)
  if (exhausted) throw new Error(`${deal.name} has completed its sequence. Report it instead of drafting.`)
  if (touchNumber && touchNumber !== expected) throw new Error(`This deal is on touch ${expected} (${step.angle}), not touch ${touchNumber}. Draft that one.`)
  const list = (Array.isArray(variants) ? variants : [variants])
    .map(v => ({ subject: String(v?.subject || '').trim(), body: String(v?.body || '').trim() }))
    .filter(v => v.subject || v.body)
  if (!list.length) throw new Error('No variants given')
  if (list.length > 5) throw new Error('At most five variants')
  const rejected = list.map((v, i) => ({ i, problems: draftProblems(v, { pipeline: pipelineOf(deal), touchNumber: expected, companyName: deal.name }) })).filter(x => x.problems.length)
  if (rejected.length) throw new Error('Draft rejected: ' + rejected.map(r => `variant ${r.i + 1}: ${r.problems.join('; ')}`).join(' | '))
  await prisma.salesPrep.upsert({
    where: { attioDealId: deal.id },
    update: { attioPersonId: person.id, touchNumber: expected, angle: step.angle, variants: list, source, preparedAt: new Date() },
    create: { attioDealId: deal.id, attioPersonId: person.id, touchNumber: expected, angle: step.angle, variants: list, source },
  })
  return { dealId: deal.id, touchNumber: expected, angle: step.angle, variants: list.length, stored: true }
}

export async function finishRun({ prepared = 0, followUps = 0, fresh = 0, skipped = [], notes = '' } = {}) {
  const value = {
    finishedAt: new Date().toISOString(),
    prepared: Number(prepared) || 0,
    followUps: Number(followUps) || 0,
    fresh: Number(fresh) || 0,
    skipped: (Array.isArray(skipped) ? skipped : []).map(String).slice(0, 50),
    notes: String(notes || '').slice(0, 2000),
  }
  await prisma.systemConfig.upsert({
    where: { key: LAST_RUN_KEY },
    update: { value: JSON.stringify(value) },
    create: { key: LAST_RUN_KEY, value: JSON.stringify(value) },
  })
  // Drafts older than a week were written for a morning that never came.
  await prisma.salesPrep.deleteMany({ where: { preparedAt: { lt: new Date(Date.now() - 7 * 86400000) } } })
  return value
}

export { templateFor }
