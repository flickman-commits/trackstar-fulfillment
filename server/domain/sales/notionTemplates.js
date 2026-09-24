/**
 * The team's outreach templates, from the Notion page that holds them.
 *
 * "Outreach Templates (Charity + Race)" in Notion is where the wording is
 * worked out and edited, so the composer's Templates menu reads it rather
 * than keeping a second copy to drift. Each toggle heading on the page is one
 * template: a "Use this for:" line, a "Subject:" line, and the email itself
 * as a quote. The H1 above it ("Charities", "Races") is its group.
 *
 * Reading Notion needs NOTION_API_KEY, an internal integration the page is
 * shared with. Without it, or if Notion is down, the menu uses SNAPSHOT,
 * the same page as of the date below, so the menu always has something.
 *
 * The page is written for a person pasting into Gmail, so normalize() makes
 * each body fit this tool: the sign-off goes (the signature is added on
 * send), "<attach ...>" reminders go (attachments are chips), and the page's
 * placeholders become the ones fill() knows.
 */
import { fillTemplate } from './angles.js'

export const NOTION_TEMPLATES_URL = 'https://app.notion.com/p/flickman-media/Outreach-Templates-Charity-Race-3c7977ac2a3e81dcb7f3ee73904299df'
const PAGE_ID = process.env.NOTION_TEMPLATES_PAGE_ID || '3c7977ac2a3e81dcb7f3ee73904299df'
const CACHE_MS = 5 * 60_000
const LOOM = 'https://www.loom.com/share/560a96f9b3ac409096445e264345bac3'

/** The page as of 2026-09-24, raw, exactly as Notion has it. */
export const SNAPSHOT = [
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
    group: 'Charities', title: 'Template 2: They Replied, Asking About Pricing', useFor: 'the most common reply we get, some version of "this is cool, what does it cost?"',
    subject: null,
    body: `Hey [First Name],\n\nGreat to hear from you! I attached our charity program deck. It walks through the 3 ways we can work together, from a fully custom design all the way to an exclusive discount code that costs you nothing.\n\nThe big idea: your top fundraisers just trained for months and raised thousands for you. A personalized print with your logo on it shows them you noticed, and keeps [Team Name] on their wall for years.\n\nPricing depends on the tier and how many runners you have, so the easiest next step is a quick 15 minute call. I'll walk you through the numbers and we can figure out what fits your team best.\n\nDo you have time this week or next? Happy to work around your schedule.\n\nThanks,\n[Your name]\n<attach the NO PRICING deck PDF>`,
  },
]

// ── Making a page body fit the composer ──────────────────────────────────────

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

/** A page body, ready for fill(): placeholders mapped, reminders and sign-off out. */
export function normalize(body) {
  const paragraphs = String(body || '')
    .replace(/\r\n/g, '\n')
    // A dash between words would trip the house rule; the page never means one.
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/<insert personali[sz]ed line>/gi, '[One-liner]')
    .replace(/\[Team Name\]/g, '[Org Name]')
    .split('\n')
    .filter(l => !/^\s*<[^>]*attach[^>]*>\s*$/i.test(l))
    .join('\n')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
  return paragraphs.filter(p => !isSignOff(p)).join('\n\n')
}

// ── Reading the page from Notion ─────────────────────────────────────────────

async function notion(path) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    headers: { Authorization: `Bearer ${process.env.NOTION_API_KEY}`, 'Notion-Version': '2022-06-28' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Notion ${res.status}`)
  return res.json()
}

async function children(id) {
  const out = []
  let cursor
  do {
    const page = await notion(`/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`)
    out.push(...(page.results || []))
    cursor = page.has_more ? page.next_cursor : null
  } while (cursor)
  return out
}

/** Rich text as plain text. A link keeps its address: "See video here: https://...". */
function plain(richText = []) {
  return richText.map(r => {
    const text = r.plain_text || ''
    const href = r.href || r.text?.link?.url
    return href && !text.includes(href) ? `${text.trim()}: ${href}` : text
  }).join('')
}

function textOf(block) {
  return plain(block?.[block.type]?.rich_text)
}

/** The page's templates, as { group, title, useFor, subject, body } with raw bodies. */
export async function readPage(pageId = PAGE_ID) {
  const blocks = await children(pageId)
  const out = []
  let group = null
  for (const b of blocks) {
    if (b.type === 'heading_1') { group = textOf(b).trim(); continue }
    if (!/^heading_[23]$/.test(b.type) || !b.has_children) continue
    const inner = await children(b.id)
    let useFor = null, subject, body = null
    for (const c of inner) {
      const t = textOf(c).trim()
      if (c.type === 'quote' && !body) body = t
      else if (/^use this for:/i.test(t)) useFor = t.replace(/^use this for:\s*/i, '')
      else if (/^subject:/i.test(t)) {
        const s = t.replace(/^subject:\s*/i, '')
        subject = /existing thread/i.test(s) ? null : s
      }
    }
    if (body) out.push({ group, title: textOf(b).trim(), useFor, subject: subject ?? null, body })
  }
  return out
}

let cache = { at: 0, value: null }

/** The templates and where they came from ("notion" or "snapshot"). */
export async function outreachTemplates() {
  if (cache.value && Date.now() - cache.at < CACHE_MS) return cache.value
  let value = { source: 'snapshot', items: SNAPSHOT }
  if (process.env.NOTION_API_KEY) {
    try {
      const items = await readPage()
      if (items.length) value = { source: 'notion', items }
    } catch (e) {
      console.warn('[sales] Notion templates unreadable, using the snapshot:', e.message)
    }
  }
  cache = { at: Date.now(), value }
  return value
}

/**
 * Every template, filled in for one person on one deal. A null subject means
 * "reply on the thread"; the composer keeps the subject it has.
 */
export async function templatesFor({ deal, person, sender }) {
  const { source, items } = await outreachTemplates()
  const company = { name: deal?.name || deal?.company?.name || '', raceDate: deal?.raceDate, courseLandmark: deal?.courseLandmark }
  const senderName = sender?.name || ''
  const fill = text => fillTemplate(normalize(text), { company, contact: person }).replaceAll('[Your name]', senderName)
  return {
    source,
    url: NOTION_TEMPLATES_URL,
    items: items.map((t, i) => ({
      id: `${i}:${t.title}`,
      group: t.group || 'Templates',
      title: t.title,
      useFor: t.useFor || null,
      subject: t.subject ? fill(t.subject) : null,
      body: fill(t.body),
    })),
  }
}
