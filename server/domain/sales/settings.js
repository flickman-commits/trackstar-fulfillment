/**
 * The knobs a business decision turns, kept out of the code.
 *
 * The cadence wording, the daily cap, which races to source from, the social
 * proof line: these change when the business changes its mind, and that
 * should not need a deploy. Defaults live here so the tool works with nothing
 * configured; overrides live in SystemConfig and win field by field. Both the
 * UI and the overnight routine read the merged result through one function,
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
  /** Where the routine looks for new charity teams, in priority order. From the runbook. */
  priorityRaces: [
    'St. Jude Memphis Marathon',
    'Berlin Marathon',
    'Marine Corps Marathon',
    'California International Marathon',
    'Houston Marathon',
    'Tokyo Marathon',
    'London Marathon',
  ],
  /** Follow-up gaps in days, per pipeline and touch. Overrides the cadence file. */
  followUpDays: { RACE: null, CHARITY: null },
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
  if (next.priorityRaces !== undefined) {
    if (!Array.isArray(next.priorityRaces)) throw new Error('priorityRaces must be a list')
    next.priorityRaces = next.priorityRaces.map(s => String(s).trim()).filter(Boolean).slice(0, 30)
  }
  await prisma.systemConfig.upsert({
    where: { key: SETTINGS_KEY },
    update: { value: JSON.stringify(next) },
    create: { key: SETTINGS_KEY, value: JSON.stringify(next) },
  })
  cache = { at: 0, value: null }
  return getSettings({ force: true })
}
