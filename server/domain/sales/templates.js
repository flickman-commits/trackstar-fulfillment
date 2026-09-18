/**
 * The email templates, editable in Settings.
 *
 * The copy in angles.js is the default. Anything a rep changes in Settings
 * is stored per pipeline and touch in SystemConfig and wins field by field,
 * so a wording change reaches the next draft, the next overnight run and
 * the next rep with no deploy. Reset means "delete the override".
 *
 * Placeholders ([First Name], [Race Name], ...) are filled at draft time from
 * the Attio deal; see TEMPLATE_PLACEHOLDERS in angles.js.
 */
import prisma from '../../db.js'
import { RACE_TEMPLATES, CHARITY_TEMPLATES, RACE_CADENCE, CHARITY_CADENCE } from './angles.js'
import { NO_DASHES } from './guardrails.js'

export const TEMPLATES_KEY = 'sales_templates'

export const DEFAULT_TEMPLATES = { RACE: RACE_TEMPLATES, CHARITY: CHARITY_TEMPLATES }

let cache = { at: 0, value: null }

async function overrides() {
  const row = await prisma.systemConfig.findUnique({ where: { key: TEMPLATES_KEY } })
  try { return row?.value ? JSON.parse(row.value) : {} } catch { return {} }
}

/** Defaults with the overrides laid over, per pipeline and angle. */
export async function getTemplates({ force = false } = {}) {
  if (!force && cache.value && Date.now() - cache.at < 30_000) return cache.value
  const over = await overrides()
  const value = {}
  for (const pipeline of ['RACE', 'CHARITY']) {
    value[pipeline] = {}
    for (const [angle, t] of Object.entries(DEFAULT_TEMPLATES[pipeline])) {
      const o = over[pipeline]?.[angle] || {}
      value[pipeline][angle] = { subject: o.subject ?? t.subject, body: o.body ?? t.body, edited: Boolean(o.subject !== undefined || o.body !== undefined) }
    }
  }
  cache = { at: Date.now(), value }
  return value
}

/** The touches in order for each pipeline, so the editor can label them. */
export function templateSteps() {
  return {
    RACE: RACE_CADENCE.map(s => ({ touch: s.touch, angle: s.angle, purpose: s.purpose })),
    CHARITY: CHARITY_CADENCE.map(s => ({ touch: s.touch, angle: s.angle, purpose: s.purpose })),
  }
}

/**
 * Save one touch's copy. An empty subject or body, or one equal to the
 * default, drops the override for that field. Dashes are refused here the
 * same as in a draft, since a template with one would poison every email.
 */
export async function setTemplate({ pipeline, angle, subject, body }) {
  if (!DEFAULT_TEMPLATES[pipeline]) throw new Error('pipeline must be RACE or CHARITY')
  const def = DEFAULT_TEMPLATES[pipeline][angle]
  if (!def) throw new Error(`No template for ${pipeline} / ${angle}`)
  for (const [k, v] of [['subject', subject], ['body', body]]) {
    if (v !== undefined && NO_DASHES.test(String(v))) throw new Error(`The ${k} contains an em or en dash. Use a comma or a full stop.`)
  }
  const over = await overrides()
  over[pipeline] = over[pipeline] || {}
  const cur = { ...(over[pipeline][angle] || {}) }
  if (subject !== undefined) { const s = String(subject).trim(); if (!s || s === def.subject) delete cur.subject; else cur.subject = s.slice(0, 200) }
  if (body !== undefined) { const b = String(body).replace(/\r\n/g, '\n').trim(); if (!b || b === def.body) delete cur.body; else cur.body = b.slice(0, 4000) }
  if (Object.keys(cur).length) over[pipeline][angle] = cur
  else delete over[pipeline][angle]
  await prisma.systemConfig.upsert({
    where: { key: TEMPLATES_KEY },
    update: { value: JSON.stringify(over) },
    create: { key: TEMPLATES_KEY, value: JSON.stringify(over) },
  })
  cache = { at: 0, value: null }
  return getTemplates({ force: true })
}
