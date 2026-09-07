/**
 * Write the next email for a company, and file the one Matt picks.
 *
 * draftVariants(): works out which touch in the cadence comes next, gathers
 * what we know (contact, research, previous touches), and asks the model for
 * five variants that all make the same point from different angles. Nothing is
 * stored; the variants are for the review screen.
 *
 * queueDraft(): the chosen variant becomes a Gmail draft in Matt's account and
 * a Touch row, and the company's cadence clock advances. Follow-ups after the
 * first touch reply in the same Gmail thread when the cadence step says so.
 */
import prisma from '../../db.js'
import { complete, isLlmConfigured } from '../../lib/llm.js'
import { cadenceFor, pickIdentityTag, RACE_ONE_LINERS, HOUSE_STYLE, DEFAULT_SOCIAL_PROOF, templateFor, greetingName } from './angles.js'
import { createDraft, textToHtml, gmailStatus } from './gmail.js'

const VARIANT_COUNT = 5

async function socialProofLine() {
  const row = await prisma.systemConfig.findUnique({ where: { key: 'sales_social_proof' } })
  return row?.value || DEFAULT_SOCIAL_PROOF
}

function nextSeasonYear(raceDate) {
  const now = new Date()
  const y = raceDate ? new Date(raceDate).getFullYear() : now.getFullYear()
  return Math.max(y, now.getFullYear()) + (raceDate && new Date(raceDate) > now ? 0 : 1)
}

/** The model-free draft for a step, with the identity one-liner filled in. */
function buildTemplate(company, contact, touchNumber, step) {
  const tag = company.pipeline === 'RACE' ? pickIdentityTag(company.identityTags) : null
  const oneLiner = touchNumber === 1 && tag && RACE_ONE_LINERS[tag] ? RACE_ONE_LINERS[tag](company) : null
  return templateFor({
    pipeline: company.pipeline,
    angle: step.angle,
    company,
    contact,
    oneLiner,
    socialProof: undefined, // resolved inside templateFor via the default
  })
}

/** What the company and its cadence say the next email is. */
export async function nextStepFor(company) {
  const cadence = cadenceFor(company.pipeline)
  const touchNumber = Math.min(company.touchCount + 1, cadence.length)
  const step = cadence[touchNumber - 1]
  return { touchNumber, step, cadenceLength: cadence.length, exhausted: company.touchCount >= cadence.length }
}

function buildSystem(pipeline) {
  const who = pipeline === 'CHARITY'
    ? 'Trackstar makes custom race prints: a finisher keepsake with the runner\'s name, time and the course map. The charity program gives an organisation\'s runners a co-branded print, Trackstar handles design, orders and fulfillment, and a share of every order is paid back to the cause.'
    : 'Trackstar makes custom race prints in partnership with iconic US marathons: a finisher keepsake with the runner\'s name, time, and the race\'s logo and course map. Partners get a co-branded print for their finishers with no work on their side and a revenue share on every order.'
  return `You write cold and follow-up emails for Matt, founder of Trackstar.

${who}

House style, which overrides anything else:
${HOUSE_STYLE}

You will be told which touch in the sequence this is and the one point it must make. Every variant makes that point; they differ in angle, opening, and phrasing, not in purpose.`
}

async function buildPrompt({ company, contact, touchNumber, step, previousTouches }) {
  const research = contact?.research || {}
  const firstName = greetingName(contact)
  const lines = []
  lines.push(`Touch ${touchNumber} of ${cadenceFor(company.pipeline).length}. Angle: ${step.angle}.`)
  lines.push(`Point this email must make: ${step.purpose}`)
  lines.push(`Subject line rule: ${step.subject.replace('[Race Name]', company.name).replace('[Org Name]', company.name).replace('[next season year]', String(nextSeasonYear(company.raceDate)))}`)
  lines.push('')
  lines.push(`Recipient: ${firstName} ${contact?.lastName || ''}`.trim() + (contact?.title ? `, ${contact.title}` : ''))
  if (firstName === 'there') lines.push('We do not know this person\'s name. Greet them as "Hey there," and never guess a name.')
  lines.push(`Organisation: ${company.name}${company.city ? ` (${company.city}${company.state ? `, ${company.state}` : ''})` : ''}`)
  if (company.pipeline === 'RACE') {
    if (company.runnerCount) lines.push(`Field size: about ${company.runnerCount.toLocaleString()} runners`)
    if (company.raceDate) lines.push(`Race date: ${new Date(company.raceDate).toDateString()}`)
    const tag = pickIdentityTag(company.identityTags)
    if (touchNumber === 1 && tag && RACE_ONE_LINERS[tag]) {
      lines.push(`Identity: ${tag}. Open the body with this line, verbatim or lightly adapted: "${RACE_ONE_LINERS[tag](company)}"`)
    } else if (tag) {
      lines.push(`Identity: ${tag}`)
    }
    if (company.courseLandmark) lines.push(`Course landmark: ${company.courseLandmark}`)
    else if (step.angle === 'course-landmark') lines.push('No course landmark is on file. Use the most distinctive thing about the course from the research, or the finish line, and name it specifically.')
  } else {
    if (company.tier) lines.push(`Tier: ${company.tier}`)
    if (company.units) lines.push(`Estimated units: ${company.units}`)
  }
  if (step.angle === 'social-proof') lines.push(`Social proof to use: ${await socialProofLine()}`)
  if (company.notes) lines.push(`Notes on file: ${company.notes}`)
  if (research.personInfo?.length) lines.push(`About the person:\n- ${research.personInfo.join('\n- ')}`)
  if (research.companyInfo?.length) lines.push(`About the organisation:\n- ${research.companyInfo.join('\n- ')}`)
  if (previousTouches.length) {
    lines.push('')
    lines.push('Emails already sent in this sequence (do not repeat their wording):')
    for (const t of previousTouches) lines.push(`--- Touch ${t.touchNumber} · subject: ${t.subject}\n${(t.body || '').slice(0, 800)}`)
  }
  lines.push('')
  lines.push(`Write ${VARIANT_COUNT} variants. Return JSON: {"variants":[{"subject":"...","body":"..."}]} with exactly ${VARIANT_COUNT} items.`)
  return lines.join('\n')
}

/**
 * @returns {Promise<{ touchNumber, step, exhausted, variants: Array<{subject, body}>, contact, company, model }>}
 */
export async function draftVariants({ companyId, contactId, useTemplate = false }) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } },
  })
  if (!company) throw new Error('Company not found')
  const contact = contactId ? company.contacts.find(c => c.id === contactId) : company.contacts[0]
  if (!contact) throw new Error('This company has no contact to write to')

  const { touchNumber, step, exhausted } = await nextStepFor(company)

  // Either there is no model, or the operator asked for the template. Same
  // answer: the cadence's own copy is a real first draft. This is what keeps
  // the tool usable when the API account runs dry, when it points at a local
  // model that is not running, or when a model is simply not worth the money
  // for this particular email.
  if (useTemplate || !isLlmConfigured()) {
    return {
      touchNumber, step, exhausted, contact, company,
      variants: [buildTemplate(company, contact, touchNumber, step)],
      model: 'template',
      source: 'template',
    }
  }

  const previousTouches = await prisma.touch.findMany({
    where: { companyId, kind: { in: ['EMAIL_DRAFT', 'EMAIL_SENT'] } },
    orderBy: { createdAt: 'asc' },
    select: { touchNumber: true, subject: true, body: true },
  })

  let json, model, provider
  try {
    ({ json, model, provider } = await complete({
    system: buildSystem(company.pipeline),
    prompt: await buildPrompt({ company, contact, touchNumber, step, previousTouches }),
    json: true,
    effort: 'low',
      maxTokens: 3000,
      purpose: `sales.draft.t${touchNumber}`,
    }))
  } catch (err) {
    // Out of credit, rate limited, endpoint down: hand back the template with
    // the reason attached rather than an empty screen. The work still moves.
    console.warn(`[sales.draft] model failed (${err.message}); falling back to the template`)
    return {
      touchNumber, step, exhausted, contact, company,
      variants: [buildTemplate(company, contact, touchNumber, step)],
      model: 'template',
      source: 'template',
      warning: `Wrote this from the template: ${err.message}`,
    }
  }

  const raw = Array.isArray(json?.variants) ? json.variants : Array.isArray(json) ? json : []
  const variants = raw
    .map(v => ({ subject: String(v.subject || '').trim(), body: String(v.body || '').trim() }))
    .filter(v => v.subject && v.body)
    .slice(0, VARIANT_COUNT)
  if (!variants.length) throw new Error('The model returned no usable variants')

  return { touchNumber, step, exhausted, variants, contact, company, model: `${provider}/${model}`, source: 'model' }
}

/**
 * File the chosen email: Gmail draft (when connected), Touch row, cadence
 * clock. Returns the touch and whether a Gmail draft was created.
 */
export async function queueDraft({ companyId, contactId, subject, body, actor }) {
  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company) throw new Error('Company not found')
  const contact = await prisma.contact.findUnique({ where: { id: contactId } })
  if (!contact) throw new Error('Contact not found')
  if (!contact.email) throw new Error(`${contact.firstName} has no email address`)
  if (!subject?.trim() || !body?.trim()) throw new Error('Subject and body are required')

  const { touchNumber, step } = await nextStepFor(company)

  // Follow-ups that say "reply in thread" go into the first email's thread.
  let threadId = null
  if (touchNumber > 1 && /reply in thread/i.test(step.subject)) {
    const first = await prisma.touch.findFirst({
      where: { companyId, gmailThreadId: { not: null } },
      orderBy: { createdAt: 'asc' },
    })
    threadId = first?.gmailThreadId || null
  }

  let gmail = null
  const status = await gmailStatus()
  if (status.connected) {
    gmail = await createDraft({ to: contact.email, subject: subject.trim(), html: textToHtml(body), threadId })
  }

  const now = new Date()
  const nextActionAt = new Date(now.getTime() + step.nextActionDays * 24 * 60 * 60 * 1000)
  const [touch] = await prisma.$transaction([
    prisma.touch.create({
      data: {
        companyId,
        contactId,
        kind: 'EMAIL_DRAFT',
        touchNumber,
        angle: step.angle,
        subject: subject.trim(),
        body: body.trim(),
        gmailDraftId: gmail?.draftId || null,
        gmailThreadId: gmail?.threadId || null,
        createdBy: actor?.email || null,
      },
    }),
    prisma.company.update({
      where: { id: companyId },
      data: {
        touchCount: touchNumber,
        lastTouchAt: now,
        nextActionAt,
        nextAction: touchNumber >= cadenceFor(company.pipeline).length
          ? 'Sequence complete: decide next year vs. pass'
          : `Send touch ${touchNumber + 1}: ${cadenceFor(company.pipeline)[touchNumber].angle}`,
        stage: ['NOT_CONTACTED', 'QUEUED', 'SENT', 'FOLLOWED_UP'].includes(company.stage)
          ? (touchNumber === 1 ? 'QUEUED' : 'FOLLOWED_UP')
          : company.stage,
      },
    }),
  ])

  return { touch, gmailDraft: Boolean(gmail), gmailConnected: status.connected }
}
