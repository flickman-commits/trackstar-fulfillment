/**
 * The knobs a business decision turns, kept out of the code.
 *
 * The cadence wording, the daily cap, which races to source from, the social
 * proof line: these change when the business changes its mind, and that
 * should not need a deploy. Defaults live here so the tool works with nothing
 * configured; overrides live in SystemConfig and win field by field. Every
 * caller reads the merged result through one function,
 * so there is exactly one answer to "what are the current settings".
 *
 * What is NOT here, on purpose: the guardrails (no dashes, no money-back
 * language for a charity). Those are invariants with reasons behind them, not
 * preferences, and they live in guardrails.js as code.
 */
import prisma from '../../db.js'
import { DEFAULT_SOCIAL_PROOF } from './angles.js'

export const SETTINGS_KEY = 'sales_settings'

export const DEFAULTS = {
  /** Outreach emails the routine prepares per night. The runbook says 10. */
  dailyCap: 10,
  /** Who the emails are from. First person; the founder story is the pitch's spine. */
  sender: {
    name: 'Matt',
    role: 'founder at Trackstar',
    story: 'I ran the NYC Marathon with New York Urban League two years ago and had a wonderful experience, which is actually what made me start this company.',
    partnerCount: 20,
  },
  /** The social-proof line the fourth race touch leads with. */
  socialProof: DEFAULT_SOCIAL_PROOF,
  /**
   * Appended to every email the app sends, after the body and before any
   * P.S. HTML, because it carries links. The drafts themselves carry no
   * sign-off; this is the sign-off.
   */
  signature: [
    '<p style="margin:0;font-family:Inter,\'Helvetica Neue\',Helvetica,Arial,sans-serif;font-size:21px;font-weight:700;color:#111">Matt Hickman</p>',
    '<p style="margin:0;font-family:Inter,\'Helvetica Neue\',Helvetica,Arial,sans-serif;color:#444">Owner | <a href="https://www.trackstar.art" style="color:#1a56db">Trackstar</a>, <a href="https://www.flickmanmedia.com" style="color:#1a56db">Flickman Media</a></p>',
    '<p style="margin:0;font-family:Inter,\'Helvetica Neue\',Helvetica,Arial,sans-serif;color:#8a8a8a">New York, NY</p>',
  ].join('\n'),
  /** What "today" means for the daily count. The business runs on Eastern time. */
  timezone: 'America/New_York',
  /** Seconds between pressing Send and the message actually going. Long enough to catch a typo. */
  undoSeconds: 10,
}

/** Deep-ish merge: one level of nesting is all these settings have. */
function merge(base, over) {
  if (!over || typeof over !== 'object') return base
  const out = { ...base }
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined || v === null) continue
    out[k] = base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) && typeof v === 'object' && !Array.isArray(v)
      ? { ...base[k], ...v }
      : v
  }
  return out
}

let cache = { at: 0, value: null }

export async function getSettings({ force = false } = {}) {
  if (!force && cache.value && Date.now() - cache.at < 30_000) return cache.value
  const row = await prisma.systemConfig.findUnique({ where: { key: SETTINGS_KEY } })
  let over = {}
  try { over = row?.value ? JSON.parse(row.value) : {} } catch { over = {} }
  const env = process.env.SALES_DAILY_CAP ? { dailyCap: Number(process.env.SALES_DAILY_CAP) } : {}
  const value = merge(merge(DEFAULTS, over), env)
  cache = { at: Date.now(), value }
  return value
}

/** Replace the overrides. Pass only what should differ from the defaults. */
export async function setSettings(patch) {
  const row = await prisma.systemConfig.findUnique({ where: { key: SETTINGS_KEY } })
  let current = {}
  try { current = row?.value ? JSON.parse(row.value) : {} } catch { current = {} }
  const next = merge(current, patch)
  if (next.dailyCap !== undefined) {
    const n = Number(next.dailyCap)
    if (!Number.isInteger(n) || n < 1 || n > 50) throw new Error('dailyCap must be a whole number from 1 to 50')
    next.dailyCap = n
  }
  if (next.undoSeconds !== undefined) {
    const n = Number(next.undoSeconds)
    if (!Number.isInteger(n) || n < 0 || n > 60) throw new Error('undoSeconds must be a whole number from 0 to 60')
    next.undoSeconds = n
  }
  if (next.timezone !== undefined) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: String(next.timezone) }) }
    catch { throw new Error(`Unknown timezone: ${next.timezone}`) }
  }
  if (next.signature !== undefined) {
    next.signature = String(next.signature).slice(0, 4000)
    if (/<script|javascript:/i.test(next.signature)) throw new Error('The signature cannot contain scripts')
  }
  await prisma.systemConfig.upsert({
    where: { key: SETTINGS_KEY },
    update: { value: JSON.stringify(next) },
    create: { key: SETTINGS_KEY, value: JSON.stringify(next) },
  })
  cache = { at: 0, value: null }
  return getSettings({ force: true })
}

/**
 * Who this email is from.
 *
 * Every rep sends from their own Gmail, so the name on the drafts and the
 * signature under them are theirs, not the workspace's. Stored per user;
 * the workspace defaults (Matt's) fill in anything a rep has not set, so a
 * new rep's first send still looks finished.
 */
export function senderKey(userId) { return `sales_sender:${userId}` }

export async function getSenderFor(userId, user = null) {
  const base = await getSettings()
  const row = userId ? await prisma.systemConfig.findUnique({ where: { key: senderKey(userId) } }) : null
  let over = {}
  try { over = row?.value ? JSON.parse(row.value) : {} } catch { over = {} }
  const firstName = user?.firstName || base.sender.name
  // Matt's role and founder story are his. Another rep starts plain.
  const isDefaultSender = firstName === base.sender.name
  const fallback = {
    name: firstName,
    role: isDefaultSender ? base.sender.role : 'from Trackstar',
    story: isDefaultSender ? base.sender.story : '',
    // A rep without a saved signature gets a plain one in their own name
    // rather than Matt's, so nothing goes out signed by the wrong person.
    signature: user && user.firstName && user.firstName !== base.sender.name
      ? `<p style="margin:0">Thanks,</p><p style="margin:0;font-weight:700">${escapeHtml(`${user.firstName} ${user.lastName || ''}`.trim())}</p><p style="margin:0">Trackstar</p>`
      : base.signature,
  }
  return { ...fallback, ...over, isDefault: !row }
}

export async function setSenderFor(userId, patch) {
  if (!userId) throw new Error('No user')
  const row = await prisma.systemConfig.findUnique({ where: { key: senderKey(userId) } })
  let current = {}
  try { current = row?.value ? JSON.parse(row.value) : {} } catch { current = {} }
  const next = { ...current }
  if (patch.name !== undefined) next.name = String(patch.name).trim().slice(0, 60)
  if (patch.role !== undefined) next.role = String(patch.role).trim().slice(0, 120)
  if (patch.story !== undefined) next.story = String(patch.story).trim().slice(0, 600)
  if (patch.signature !== undefined) {
    const sig = String(patch.signature)
    // Refuse an oversized signature rather than silently cutting it in half,
    // which is what happened to anyone pasting one with an inlined image.
    if (sig.length > 20000) throw new Error(`That signature is ${sig.length} characters. Keep it under 20,000, and host images at a URL rather than pasting them in.`)
    if (/<script|javascript:/i.test(sig)) throw new Error('The signature cannot contain scripts')
    next.signature = sig
  }
  await prisma.systemConfig.upsert({
    where: { key: senderKey(userId) },
    update: { value: JSON.stringify(next) },
    create: { key: senderKey(userId), value: JSON.stringify(next) },
  })
  return getSenderFor(userId)
}

function escapeHtml(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

/**
 * Start of "today" in the business timezone, as a Date. What "sent today"
 * means depends on this; a send at 11pm Eastern is today's, not tomorrow's.
 */
export function startOfToday(timezone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = t => parts.find(x => x.type === t).value
  // Midnight local expressed in UTC: find the offset at that instant.
  const localMidnightGuess = new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00Z`)
  const offsetMs = tzOffsetMs(timezone, localMidnightGuess)
  return new Date(localMidnightGuess.getTime() - offsetMs)
}

function tzOffsetMs(timezone, at) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const p = Object.fromEntries(f.formatToParts(at).map(x => [x.type, x.value]))
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return asUtc - at.getTime()
}
