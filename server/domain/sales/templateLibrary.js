/**
 * The template library: the emails a rep can pick from the composer's
 * Templates menu, kept and edited in Settings.
 *
 * One JSON list in SystemConfig, so adding or rewording a template is a save
 * in the app with no deploy and nothing else to connect. The first read
 * seeds it with the templates from the team's Notion page ("Outreach
 * Templates (Charity + Race)"); from then on this list is the one to edit.
 *
 * These sit beside the sequence templates (templates.js), which are what a
 * draft starts from at each touch. A library template is one a person
 * chooses on purpose: a Loom version, a reply to "what does it cost".
 */
import crypto from 'node:crypto'
import prisma from '../../db.js'
import { NO_DASHES } from './guardrails.js'

export const LIBRARY_KEY = 'sales_template_library'
const LOOM = 'https://www.loom.com/share/560a96f9b3ac409096445e264345bac3'
export const MOTIONS = ['Charity', 'Race', 'Any']

/** The Notion page's templates as of 2026-09-24, raw. Seeds the library once. */
const NOTION_SEED = [
  {
    group: 'Charities', title: 'First Touch', useFor: null,
    subject: '[Team Name] - personalized marathon posters',
    body: `Hey [First Name],\n\n<insert personalized line>\n\nMy name is Jimmy Woodrow and I work at a company called Trackstar. Our founder ran the New York City Marathon with a charity two years ago and had a wonderful experience, which is actually what caused him to start this company. We make beautiful personalized marathon posters.\n\nWe just opened up a charity program this year and would love to have [Team Name] in it. It costs you nothing to get started, and there's a co-branded tier if you want your logo built into the design like the one attached.\n\nAny interest in being involved? If so we can hop on a quick call.\n\nThanks,\nJimmy Woodrow\nPartnerships @ Trackstar\n\nP.S. Attached a co-branded example so you can see what these look like with a charity logo built in.\n<attach image here - options below>`,
  },
  {
    group: 'Charities', title: 'First Touch (Loom)', useFor: 'cold first touch that leads with the video. Same rules as the standard first touch, including the attachment.',
    subject: '[Team Name] - personalized marathon posters',
    body: `Hey [First Name],\n\n<insert personalized line>\n\nMy name is Jimmy Woodrow and I work at a company called Trackstar. Our founder ran the New York City Marathon with a charity two years ago and had a wonderful experience, which is actually what caused him to start this company. We make beautiful personalized marathon posters.\n\nWe just opened up a charity program this year and would love to have [Team Name] in it. Our founder Matt made a quick video explaining the program and the free sample we want to send you.\n\nSee video here: ${LOOM}\n\nShoot me an email back if you’re interested in the free sample, and we can get you setup\n\nThanks,\nJimmy Woodrow\nPartnerships @ Trackstar\n\nP.S. Attached a co-branded example so you can see what these look like with a charity logo built in.\n<attach image here - options below>`,
  },
  {
    group: 'Charities', title: 'Second Touch (Loom)', useFor: 'follow-up on a thread where the first touch went out without the video.',
    subject: null,
    body: `Hey [First Name],\n\nOur founder Matt made a quick video walking through the program and the free sample we want to send you.\n\nSee video here: ${LOOM}\n\nAny interest in the sample print for [Team Name]?\n\nThanks,\nJimmy`,
  },
  {
    group: 'Charities', title: 'First Touch (Matt, Free Sample Ask)', useFor: 'cold first touch sent from Matt. Proven winner (got a reply from Achilles International). Leads with Matt\'s personal running story and a no-strings free sample instead of asking for a call.',
    subject: '[Team Name] - personalized marathon posters',
    body: `Hey [First Name],\n\n<insert personalized line>\n\nMy name is Matt Hickman, I ran the NYC Marathon with New York Urban League 2 years ago and had a wonderful experience. Since then I started a company called Trackstar that makes personalized marathon prints.\n\nWe're piloting our charity program this year, where we partner with charities to create a co-branded version of our prints (see below) that they can give to their runners as a gift of appreciation.\n\nWe're a new company and really just trying to get our name out there, so would love to send you a free sample of one of our prints so you can get a sense of our product quality. Would you be open to that?\n\nMatt Hickman\nOwner | Trackstar, Flickman Media\nTraining for: NYC Marathon '26\nNew York, NY\n\nP.S. This is a co-branded version we did for Ulman Foundation that they're using as a gift for their runners.\n<attach Ulman co-branded image here>`,
  },
  {
    group: 'Charities', title: 'They Replied, Asking About Pricing', useFor: 'the most common reply we get, some version of "this is cool, what does it cost?"',
    subject: null,
    body: `Hey [First Name],\n\nGreat to hear from you! I attached our charity program deck. It walks through the 3 ways we can work together, from a fully custom design all the way to an exclusive discount code that costs you nothing.\n\nThe big idea: your top fundraisers just trained for months and raised thousands for you. A personalized print with your logo on it shows them you noticed, and keeps [Team Name] on their wall for years.\n\nPricing depends on the tier and how many runners you have, so the easiest next step is a quick 15 minute call. I'll walk you through the numbers and we can figure out what fits your team best.\n\nDo you have time this week or next? Happy to work around your schedule.\n\nThanks,\n[Your name]\n<attach the NO PRICING deck PDF>`,
  },
]

// ── Making a Notion body fit the composer ────────────────────────────────────
// The page is written for pasting into Gmail. Here the signature is added on
// send and attachments are chips, so the sign-off and "<attach ...>" lines go.

const SIGN_OFF = /^(thanks|thank you|best|cheers|talk soon)[,!.]?$/i
const NAME_LINE = /^(\[your name\]|[A-Z][a-z]+(?: [A-Z][a-z'-]+)?)$/

/**
 * A sign-off paragraph: "Thanks,\nJimmy Woodrow\n...", or a bare name block
 * ("Matt Hickman\nOwner | Trackstar..."). The signature replaces both.
 */
function isSignOff(paragraph) {
  const lines = paragraph.split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) return false
  if (SIGN_OFF.test(lines[0])) return true
  return lines.length >= 2 && NAME_LINE.test(lines[0]) && lines.slice(1).some(l => /[|@]|^(Owner|Founder|Partnerships|Training for)/i.test(l))
}

/** A Notion body, ready for the library: the opener marker mapped, reminders and sign-off out. */
export function normalize(body) {
  const paragraphs = String(body || '')
    .replace(/\r\n/g, '\n')
    // A dash between words would trip the house rule; the page never means one.
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/<insert personali[sz]ed line>/gi, '[One-liner]')
    .split('\n')
    .filter(l => !/^\s*<[^>]*attach[^>]*>\s*$/i.test(l))
    .join('\n')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
  return paragraphs.filter(p => !isSignOff(p)).join('\n\n')
}

// ── The library ──────────────────────────────────────────────────────────────

function seed() {
  return NOTION_SEED.map((t, i) => ({
    id: `seed-${i}`,
    name: t.title,
    motion: t.group === 'Races' ? 'Race' : 'Charity',
    useFor: t.useFor ? t.useFor.charAt(0).toUpperCase() + t.useFor.slice(1) : null,
    subject: t.subject,
    body: normalize(t.body),
  }))
}

let cache = { at: 0, value: null }

/** Every template, in the order they were added. Seeds the list on first read. */
export async function listTemplates({ force = false } = {}) {
  if (!force && cache.value && Date.now() - cache.at < 30_000) return cache.value
  const row = await prisma.systemConfig.findUnique({ where: { key: LIBRARY_KEY } })
  let value
  try { value = row?.value ? JSON.parse(row.value) : null } catch { value = null }
  if (!Array.isArray(value)) {
    value = seed()
    await write(value)
  }
  cache = { at: Date.now(), value }
  return value
}

async function write(list) {
  const value = JSON.stringify(list)
  await prisma.systemConfig.upsert({ where: { key: LIBRARY_KEY }, update: { value }, create: { key: LIBRARY_KEY, value } })
  cache = { at: Date.now(), value: list }
}

/**
 * Add or change one template. No id adds it. An empty subject means "reply
 * on the thread" and keeps whatever subject the draft has. Dashes are
 * refused here as in a draft, since one would go out in every email.
 */
export async function saveTemplate({ id, name, motion, useFor, subject, body }, actor) {
  const clean = {
    name: String(name || '').trim().slice(0, 120),
    motion: MOTIONS.includes(motion) ? motion : 'Any',
    useFor: String(useFor || '').trim().slice(0, 300) || null,
    subject: String(subject || '').trim().slice(0, 200) || null,
    body: String(body || '').replace(/\r\n/g, '\n').trim().slice(0, 6000),
  }
  if (!clean.name) throw new Error('Give the template a name')
  if (!clean.body) throw new Error('The template needs a body')
  for (const k of ['name', 'subject', 'body']) {
    if (clean[k] && NO_DASHES.test(clean[k])) throw new Error(`The ${k} contains an em or en dash. Use a comma or a full stop.`)
  }
  const list = (await listTemplates({ force: true })).slice()
  const stamp = { updatedAt: new Date().toISOString(), updatedBy: actor?.email || null }
  if (id) {
    const i = list.findIndex(t => t.id === id)
    if (i < 0) throw new Error('That template is gone. Reload Settings.')
    list[i] = { ...list[i], ...clean, ...stamp }
  } else {
    list.push({ id: crypto.randomUUID(), ...clean, ...stamp })
  }
  await write(list)
  return list
}

export async function deleteTemplate(id) {
  const list = (await listTemplates({ force: true })).filter(t => t.id !== id)
  await write(list)
  return list
}
