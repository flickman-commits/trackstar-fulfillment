/**
 * Write the next email for a deal, and send the one the rep approves.
 *
 * draftVariants(): works out which touch in the cadence comes next from
 * Attio's touch count, gathers what Attio knows (the person, the company's
 * enrichment, the deal notes, the emails already sent from here), and either
 * returns the overnight draft, the template, or asks the model for variants.
 * Nothing is stored; the variants are for the review screen.
 *
 * sendDraft(): the one act in Sales that reaches another person. Gmail
 * sends as the connected account, the send is logged (thread ids for the
 * next touch, the count for today), and Attio is told: touch count, next
 * action, Reached Out, and a note carrying the email.
 */
import prisma from '../../db.js'
import { complete, isLlmConfigured } from '../../lib/llm.js'
import { cadenceFor, HOUSE_STYLE, CHARITY_RULES, DEFAULT_SOCIAL_PROOF, templateFor, greetingName, RACE_ONE_LINERS } from './angles.js'
import { sendMessage, gmailStatus } from './gmail.js'
import { pickAssetFor, readAsset, isAssetStorageConfigured } from './assets.js'
import { getSettings, getSenderFor } from './settings.js'
import { getTemplates } from './templates.js'
import { recordSend } from './attio.js'
import { dealForWork, nextStepFor, pipelineOf } from './queue.js'
import { draftProblems, NO_DASHES } from './guardrails.js'

const VARIANT_COUNT = 5

/**
 * The HTML that actually goes out: body, then the signature, then any P.S.
 *
 * A draft ends on the ask; the signature is the sign-off. But a template's
 * P.S. ("attached a co-branded example") belongs after the signature, the
 * way a person writes one, so the body is split there. A trailing bare
 * sign-off in the body is dropped rather than sent twice.
 */
export function composeHtml(body, { signature = '', senderName = 'Matt' } = {}) {
  const paragraphs = String(body || '').replace(/\r\n/g, '\n').split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  const psAt = paragraphs.findIndex(p => /^p\.?s\.?[\s:.-]/i.test(p))
  const main = psAt >= 0 ? paragraphs.slice(0, psAt) : paragraphs
  const ps = psAt >= 0 ? paragraphs.slice(psAt) : []
  while (main.length) {
    const last = main[main.length - 1]
    const bare = last.replace(/[,.!]/g, '').trim().toLowerCase()
    const name = senderName.toLowerCase()
    if (bare === name || bare === `thanks\n${name}` || bare === `thanks ${name}` || bare === `best ${name}` || bare === `cheers ${name}`) { main.pop(); continue }
    break
  }
  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const para = t => `<p>${esc(t).replace(/\n/g, '<br>')}</p>`
  const parts = [
    ...main.map(para),
    signature ? `<div style="margin-top:14px">${signature}</div>` : '',
    ...ps.map(p => `<p style="margin-top:14px">${esc(p).replace(/\n/g, '<br>')}</p>`),
  ].filter(Boolean)
  return `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">\n${parts.join('\n')}\n</div>`
}

/** The deal as the template filler expects it (it predates Attio and reads company-ish fields). */
function templateCompany(deal) {
  return {
    name: deal.name || deal.company?.name || '',
    raceDate: deal.raceDate,
    courseLandmark: deal.courseLandmark,
    city: deal.company?.location || null,
  }
}

/**
 * The model-free draft for a step, with Attio's fields filled in.
 *
 * The templates are written in Matt's voice, founder story included. Another
 * rep's first touch keeps the structure and swaps the who-I-am sentence for
 * theirs: their name, their role, their story if they saved one.
 */
export function buildTemplate(deal, person, step, { socialProof, sender, templates } = {}) {
  const pipeline = pipelineOf(deal)
  const identity = pipeline === 'RACE' && deal.identity && RACE_ONE_LINERS[deal.identity]
  const oneLiner = step.touch === 1 && identity ? RACE_ONE_LINERS[deal.identity](templateCompany(deal)) : null
  const t = templateFor({ pipeline, angle: step.angle, company: templateCompany(deal), contact: person, oneLiner, socialProof, templates })
  if (sender?.name && sender.name !== 'Matt') {
    const intro = `I'm ${sender.name}, ${sender.role || 'from Trackstar'}.${sender.story ? ` ${sender.story}` : ''}`
    t.body = t.body
      .replace(/I'm Matt, founder at Trackstar\. I ran the NYC Marathon[^.]*\./, intro)
      .replace(/I'm Matt, founder at Trackstar\./, intro)
  }
  return t
}

const RACE_CONTEXT = `Trackstar makes personalized race prints in partnership with iconic US marathons: the runner's name, finish time, pace, race-day weather and the course map, on archival paper. Race partners get a co-branded print for their finishers with no work on their side and a revenue share on every order.`

const CHARITY_CONTEXT = `Trackstar makes personalized marathon posters: the runner's name, finish time, pace, race-day weather and the course map, on archival paper, shipped to the runner 7 to 10 days after the race.

The charity program sells these to marathon charity teams, the nonprofits that hold guaranteed race entries and give them to runners in exchange for a fundraising commitment. The pitch is recognition: a way to honour someone who just raised several thousand dollars, and something with the charity's logo on it that keeps them fundraising next year. Trackstar handles the design, the orders and the fulfillment, so it is turnkey for the charity.

Two tiers exist, but a cold email never names either the numbers or the terms. Money never flows back to the charity: there is no revenue share, no commission and no donation-back, deliberately.`

function buildSystem(pipeline, sender) {
  const charity = pipeline === 'CHARITY'
  return `You write cold and follow-up emails for ${sender.name}, ${sender.role}.

${charity ? CHARITY_CONTEXT : RACE_CONTEXT}

House style, which overrides anything else:
${HOUSE_STYLE.replace(/Write as Matt, founder of Trackstar/, `Write as ${sender.name}, ${sender.role}`)}
${charity ? `\nRules specific to charity outreach, which override the house style where they disagree:\n${CHARITY_RULES}` : ''}

You will be told which touch in the sequence this is and the one point it must make. Every variant makes that point; they differ in angle, opening, and phrasing, not in purpose.`
}

function nextSeasonYear(raceDate) {
  const now = new Date()
  if (!raceDate) return now.getFullYear() + 1
  const d = new Date(raceDate)
  return d > now ? d.getFullYear() : d.getFullYear() + 1
}

/** What the model is told. Everything here comes from Attio or the send log. */
export function buildPrompt({ deal, person, touchNumber, step, previous, socialProof, sender }) {
  const pipeline = pipelineOf(deal)
  const firstName = greetingName(person)
  const org = deal.name || deal.company?.name || 'the organisation'
  const lines = []
  lines.push(`Touch ${touchNumber} of ${cadenceFor(pipeline).length}. Angle: ${step.angle}.`)
  lines.push(`Point this email must make: ${step.purpose}`)
  lines.push(`Subject line rule: ${step.subject.replace('[Race Name]', org).replace('[Org Name]', org).replace('[next season year]', String(nextSeasonYear(deal.raceDate)))}`)
  lines.push('')
  lines.push(`Recipient: ${firstName} ${person?.lastName || ''}`.trim() + (person?.title ? `, ${person.title}` : ''))
  if (firstName === 'there') lines.push('We do not know this person\'s name. Greet them as "Hey there," and never guess a name.')
  if (person?.description) lines.push(`About the person (from the CRM): ${person.description}`)
  if (person?.location) lines.push(`Their location: ${person.location}`)
  lines.push(`Organisation: ${org}${deal.company?.location ? ` (${deal.company.location})` : ''}`)
  if (deal.company?.description) lines.push(`About the organisation (from the CRM): ${deal.company.description}`)
  if (deal.company?.categories?.length) lines.push(`Categories: ${deal.company.categories.join(', ')}`)
  if (deal.company?.employeeRange) lines.push(`Size: ${deal.company.employeeRange} people`)
  if (pipeline === 'RACE') {
    if (deal.runners) lines.push(`Field size: about ${Number(deal.runners).toLocaleString()} runners`)
    if (deal.raceDate) lines.push(`Race date: ${new Date(deal.raceDate).toDateString()}`)
    if (deal.identity && RACE_ONE_LINERS[deal.identity] && touchNumber === 1) {
      lines.push(`Identity: ${deal.identity}. Open the body with this line, verbatim or lightly adapted: "${RACE_ONE_LINERS[deal.identity](templateCompany(deal))}"`)
    }
    if (deal.courseLandmark) lines.push(`Course landmark: ${deal.courseLandmark}`)
    else if (step.angle === 'course-landmark') lines.push('No course landmark is on file. Use the most distinctive thing about the course you can infer from the organisation description, or the finish line, and name it specifically.')
  } else {
    if (deal.sizeTier) lines.push(`Size tier: ${deal.sizeTier}`)
    if (deal.runners) lines.push(`Charity team size: about ${Number(deal.runners).toLocaleString()} runners`)
    if (deal.raceDate) lines.push(`Race date: ${new Date(deal.raceDate).toDateString()}`)
  }
  if (step.angle === 'social-proof') lines.push(`Social proof to use: ${socialProof}`)
  if (sender?.story && touchNumber === 1) lines.push(`Sender's story, for the who-I-am line: ${sender.story}`)
  if (deal.notes) lines.push(`Deal notes (written by the team; use what is relevant, never recite): ${deal.notes}`)
  if (previous.length) {
    lines.push('')
    lines.push('Emails already sent in this sequence (do not repeat their wording):')
    for (const t of previous) lines.push(`--- Touch ${t.touchNumber} · subject: ${t.subject}\n${(t.body || '').slice(0, 800)}`)
  }
  lines.push('')
  lines.push(`Write ${VARIANT_COUNT} variants. Return JSON: {"variants":[{"subject":"...","body":"..."}]} with exactly ${VARIANT_COUNT} items.`)
  return lines.join('\n')
}

/**
 * @returns {Promise<{ touchNumber, step, exhausted, variants, personId, dealId, model, source, warning? }>}
 */
export async function draftVariants({ dealId, personId, useTemplate = false, force = false, actor }) {
  const deal = await dealForWork(dealId)
  const person = (personId && deal.people.find(p => p.id === personId)) || deal.person
  if (!person) throw new Error('This deal has nobody to write to. Add a person to it in Attio.')
  const { touchNumber, step, exhausted } = nextStepFor(deal)
  const settings = await getSettings()
  const sender = await getSenderFor(actor?.id, actor)
  const socialProof = settings.socialProof || DEFAULT_SOCIAL_PROOF
  const templates = await getTemplates()
  const base = { touchNumber, step, exhausted, personId: person.id, dealId: deal.id }

  // The overnight routine may already have written this one. It costs nothing
  // to use, so it wins whatever the AI switch says; only an explicit Rewrite
  // (force) or a draft written for a different touch sets it aside.
  const held = await prisma.salesPrep.findUnique({ where: { attioDealId: deal.id } })
  if (!force && held && held.touchNumber === touchNumber && Array.isArray(held.variants) && held.variants.length) {
    return { ...base, personId: held.attioPersonId && deal.people.some(p => p.id === held.attioPersonId) ? held.attioPersonId : person.id, variants: held.variants, model: held.source, source: 'prepared', preparedAt: held.preparedAt }
  }

  if (useTemplate || !isLlmConfigured()) {
    return { ...base, variants: [buildTemplate(deal, person, step, { socialProof, sender, templates })], model: 'template', source: 'template' }
  }

  const previous = deal.sends.map(s => ({ touchNumber: s.touchNumber, subject: s.subject, body: s.body }))
  let json, model, provider
  try {
    ({ json, model, provider } = await complete({
      system: buildSystem(pipelineOf(deal), sender),
      prompt: buildPrompt({ deal, person, touchNumber, step, previous, socialProof, sender }),
      json: true,
      effort: 'low',
      maxTokens: 3000,
      purpose: `sales.draft.t${touchNumber}`,
    }))
  } catch (err) {
    console.warn(`[sales.draft] model failed (${err.message}); falling back to the template`)
    return { ...base, variants: [buildTemplate(deal, person, step, { socialProof, sender, templates })], model: 'template', source: 'template', warning: `Wrote this from the template: ${err.message}` }
  }

  const raw = Array.isArray(json?.variants) ? json.variants : Array.isArray(json) ? json : []
  const variants = raw
    .map(v => ({ subject: String(v.subject || '').trim(), body: String(v.body || '').trim() }))
    .filter(v => v.subject && v.body)
    .slice(0, VARIANT_COUNT)
  if (!variants.length) throw new Error('The model returned no usable variants')
  return { ...base, variants, model: `${provider}/${model}`, source: 'model' }
}

/**
 * Rewrite one draft to an instruction ("shorter", "mention their Boston
 * team", "less salesy"). The house rules still apply; the server checks the
 * result the same as any other draft before it can go.
 */
export async function reviseDraft({ dealId, subject, body, instruction, actor }) {
  if (!isLlmConfigured()) throw new Error('No model is configured. Edit the draft by hand.')
  const deal = await dealForWork(dealId)
  const { touchNumber, step } = nextStepFor(deal)
  const sender = await getSenderFor(actor?.id, actor)
  const { json, model, provider } = await complete({
    system: buildSystem(pipelineOf(deal), sender),
    prompt: [
      `Touch ${touchNumber}. Angle: ${step.angle}. Point it must make: ${step.purpose}`,
      `Recipient: ${greetingName(deal.person)} at ${deal.name}.`,
      '',
      'Current draft:',
      `Subject: ${subject}`,
      body,
      '',
      `Rewrite it to this instruction, keeping everything else that works: ${instruction}`,
      'Return JSON: {"subject":"...","body":"..."}',
    ].join('\n'),
    json: true,
    effort: 'low',
    maxTokens: 1200,
    purpose: 'sales.revise',
  })
  const out = { subject: String(json?.subject || subject).trim(), body: String(json?.body || '').trim() }
  if (!out.body) throw new Error('The model returned nothing usable')
  return { ...out, model: `${provider}/${model}` }
}

/**
 * Touches whose copy points at an attached example, so sending one without
 * an image would send a promise the message does not keep. The charity
 * runbook puts it plainly: no attachment, no send.
 */
export function requiresImage(pipeline, touchNumber) {
  return pipeline === 'CHARITY' && touchNumber === 1
}

/**
 * Send it. Same checks the overnight drafts pass, then Gmail, then the log,
 * then Attio. The undo window happens in the client; here the decision is
 * final.
 */
/**
 * `adhoc` is a rep writing to a deal outside the queue: any stage, any
 * point in the sequence. It still logs, still tells Attio, still moves Not
 * Contacted to Reached Out; it just does not stamp a next action, because
 * a person chose to write and knows what comes next.
 */
export async function sendDraft({ dealId, personId, subject, body, assetIds = [], actor, adhoc = false }) {
  if (!actor?.id) throw new Error('Sending needs a signed-in person with a connected Gmail')
  if (!subject?.trim() || !body?.trim()) throw new Error('Subject and body are required')
  const deal = await dealForWork(dealId, { fresh: true })
  const person = (personId && deal.people.find(p => p.id === personId)) || deal.person
  if (!person) throw new Error('This deal has nobody to write to')
  if (!person.email) throw new Error(`${person.fullName || 'This person'} has no email address in Attio`)
  if (!adhoc && !['Not Contacted', 'Needs Enrichment', 'Reached Out'].includes(deal.stage)) {
    throw new Error(`${deal.name} is at ${deal.stage}. The sequence only runs up to Reached Out; use New email to write to them.`)
  }

  const status = await gmailStatus(actor.id)
  if (!status.connected) throw new Error('Gmail is not connected. Open Settings and press Connect Gmail.')

  const { touchNumber: nextTouch, step, exhausted } = nextStepFor(deal)
  if (exhausted && !adhoc) throw new Error(`${deal.name} has finished its sequence. Change its stage in Attio instead of sending another touch.`)
  // Past the cadence, an ad hoc email still counts as one more touch.
  const touchNumber = exhausted ? deal.touchCount + 1 : nextTouch
  const pipeline = pipelineOf(deal)

  const problems = draftProblems({ subject, body }, { pipeline, touchNumber, companyName: deal.name })
  if (problems.length) {
    const err = new Error(problems[0])
    err.problems = problems
    throw err
  }

  // Follow-ups reply in the thread of the first send when the step says so.
  let threadId = null
  let inReplyTo = null
  if (touchNumber > 1 && /reply in thread/i.test(step.subject)) {
    const firstSend = deal.sends.find(s => s.gmailThreadId)
    threadId = firstSend?.gmailThreadId || null
    inReplyTo = (await prisma.salesSend.findFirst({ where: { attioDealId: deal.id, rfcMessageId: { not: null } }, orderBy: { sentAt: 'asc' } }))?.rfcMessageId || null
  }

  // Attachments: what the rep chose, or the auto-picked example when the
  // touch needs one and nothing was chosen.
  const attachments = []
  const attached = []
  if (isAssetStorageConfigured()) {
    let ids = [...new Set((assetIds || []).map(String).filter(Boolean))]
    if (!ids.length && requiresImage(pipeline, touchNumber)) {
      const pick = await pickAssetFor(deal)
      if (pick) ids = [pick.id]
    }
    for (const id of ids) {
      const a = await readAsset(id)
      attachments.push(a)
      attached.push(id)
    }
  }
  if (requiresImage(pipeline, touchNumber) && !attachments.some(a => a.inline)) {
    throw new Error('A charity first touch has to carry a co-branded example. Drag one in from the library, then send again.')
  }
  const total = attachments.reduce((n, a) => n + a.bytes.length, 0)
  if (total > 18 * 1024 * 1024) throw new Error('Attachments add up to more than 18 MB, which Gmail will bounce. Drop one.')

  const sender = await getSenderFor(actor.id, actor)
  const html = composeHtml(body, { signature: sender.signature, senderName: sender.name })
  const sent = await sendMessage({ userId: actor.id, to: person.email, subject: subject.trim(), html, threadId, inReplyTo, attachments })

  const now = new Date()
  const cadence = cadenceFor(pipeline)
  const nextActionDate = adhoc ? null : new Date(now.getTime() + step.nextActionDays * 86400000)
  const nextAction = adhoc ? null : touchNumber >= cadence.length
    ? 'Sequence complete: decide next year vs. lost'
    : `Send touch ${touchNumber + 1}: ${cadence[touchNumber].angle}`

  const sync = await recordSend(deal, {
    sentAt: now, touchNumber, nextAction, nextActionDate,
    subject: subject.trim(), body: body.trim(), toEmail: person.email, sentBy: actor.email,
  })

  const send = await prisma.salesSend.create({
    data: {
      attioDealId: deal.id,
      attioPersonId: person.id,
      toEmail: person.email,
      touchNumber,
      angle: adhoc ? 'adhoc' : step.angle,
      subject: subject.trim(),
      body: body.trim(),
      attachments: attached,
      gmailMessageId: sent.gmailMessageId,
      gmailThreadId: sent.threadId,
      rfcMessageId: sent.rfcMessageId,
      sentAt: now,
      sentById: actor.id,
      sentByEmail: actor.email || null,
      attioOk: Boolean(sync.ok),
      attioError: sync.ok ? null : (sync.error || sync.skipped || null),
    },
  })
  // The held draft, if any, has been used.
  await prisma.salesPrep.deleteMany({ where: { attioDealId: deal.id } })
  await prisma.salesSkip.deleteMany({ where: { attioDealId: deal.id } })

  return { send: { id: send.id, touchNumber, sentAt: now, gmailThreadId: sent.threadId }, attached, sync }
}

/**
 * A one-off email to an address with no deal behind it. Same mailbox, same
 * signature, same attachments and undo; logged so "sent today" is right;
 * nothing written to Attio because there is nothing to write it to. The
 * house rule on dashes still holds; the pipeline rules do not, since this
 * is not a cadence email.
 */
export async function sendFree({ to, subject, body, assetIds = [], actor }) {
  if (!actor?.id) throw new Error('Sending needs a signed-in person with a connected Gmail')
  const address = String(to || '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error('That is not an email address')
  if (!subject?.trim() || !body?.trim()) throw new Error('Subject and body are required')
  if (NO_DASHES.test(subject) || NO_DASHES.test(body)) throw new Error('No em or en dashes. Use a comma or a full stop.')
  const status = await gmailStatus(actor.id)
  if (!status.connected) throw new Error('Gmail is not connected. Open Settings and press Connect Gmail.')

  const attachments = []
  const attached = []
  for (const id of [...new Set((assetIds || []).map(String).filter(Boolean))]) {
    if (!isAssetStorageConfigured()) break
    attachments.push(await readAsset(id)); attached.push(id)
  }
  if (attachments.reduce((n, a) => n + a.bytes.length, 0) > 18 * 1024 * 1024) throw new Error('Attachments add up to more than 18 MB, which Gmail will bounce. Drop one.')

  const sender = await getSenderFor(actor.id, actor)
  const html = composeHtml(body, { signature: sender.signature, senderName: sender.name })
  const sent = await sendMessage({ userId: actor.id, to: address, subject: subject.trim(), html, attachments })
  const now = new Date()
  const send = await prisma.salesSend.create({
    data: {
      attioDealId: null, attioPersonId: null, toEmail: address, touchNumber: 0, angle: 'free',
      subject: subject.trim(), body: body.trim(), attachments: attached,
      gmailMessageId: sent.gmailMessageId, gmailThreadId: sent.threadId, rfcMessageId: sent.rfcMessageId,
      sentAt: now, sentById: actor.id, sentByEmail: actor.email || null, attioOk: true,
    },
  })
  return { send: { id: send.id, touchNumber: 0, sentAt: now, gmailThreadId: sent.threadId }, attached, sync: { ok: true } }
}

/** What would stop this draft going, as plain reasons. Empty means it passes. */
export async function checkDraft({ dealId, subject, body }) {
  const deal = await dealForWork(dealId)
  const { touchNumber } = nextStepFor(deal)
  return { touchNumber, problems: draftProblems({ subject, body }, { pipeline: pipelineOf(deal), touchNumber, companyName: deal.name }) }
}
