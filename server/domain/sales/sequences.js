/**
 * Sequences and variables: the Sales workspace's settings.
 *
 * A sequence is an ordered list of steps per pipeline (Race, Charity, PR).
 * A step is just which saved template to start from and how many days to
 * wait after the previous email, plus whether it replies on the same thread.
 * No copy lives in a sequence: all wording is in the template library
 * (templateLibrary.js), so a template is edited in one place.
 *
 * Variables are the [Bracketed] words a template can use. The built-in ones
 * are filled from Attio and the sender; custom ones are plain text you set
 * here (Social Proof, a Loom link) and change without touching a template.
 *
 * Templates start with [First line]: an opener written per email, shown in
 * the composer as a visible blank the guardrails will not let go out. A
 * template can leave it out when its opening needs no personal line.
 *
 * The first read migrates what came before: the cadence that lived in code,
 * with the per-touch copy edited in Settings, becomes library templates and
 * the sequences that point at them. Nothing is lost and it happens once.
 */
import prisma from '../../db.js'
import { RACE_CADENCE, CHARITY_CADENCE, PR_CADENCE, DEFAULT_SOCIAL_PROOF, setLiveCadences } from './angles.js'
import { getTemplates } from './templates.js'
import { listTemplates, writeTemplates, withFirstLine } from './templateLibrary.js'
import { getSettings } from './settings.js'

export const SEQUENCES_KEY = 'sales_sequences'
export const VARIABLES_KEY = 'sales_variables'
export const PIPELINES = ['RACE', 'CHARITY', 'PR']
const MOTION_OF = { RACE: 'Race', CHARITY: 'Charity', PR: 'PR' }
const CODE_CADENCE = { RACE: RACE_CADENCE, CHARITY: CHARITY_CADENCE, PR: PR_CADENCE }

/** Filled by the tool, not editable: what each one becomes. */
export const BUILT_IN_VARIABLES = [
  ['First line', 'Always written by you, per email. Shows as a blank the tool will not send.'],
  ['First Name', 'The person\'s first name from Attio, or "there" when Attio has a mailbox name'],
  ['Org Name', 'The deal name: the charity, the outlet for PR'],
  ['Team Name', 'The same as Org Name'],
  ['Race Name', 'The deal name, for races'],
  ['Season Year', 'The year of the race\'s next edition, from its race date'],
  ['Landmark', 'The course landmark if the deal has one, else "Your finish line"'],
  ['Your name', 'Your first name, from Settings, Me'],
]
const BUILT_IN_NAMES = new Set(BUILT_IN_VARIABLES.map(([n]) => n.toLowerCase()).concat(['one-liner']))

async function readConfig(key) {
  const row = await prisma.systemConfig.findUnique({ where: { key } })
  try { return row?.value ? JSON.parse(row.value) : null } catch { return null }
}
async function writeConfig(key, value) {
  const v = JSON.stringify(value)
  await prisma.systemConfig.upsert({ where: { key }, update: { value: v }, create: { key, value: v } })
}

/**
 * The one-time move from the coded cadence to the library. Each touch's copy
 * (with any edits made in Settings) becomes a template named for its place
 * in the sequence; every library template gets its [First line].
 */
async function migrate() {
  const [library, perTouch] = await Promise.all([listTemplates({ force: true }), getTemplates({ force: true })])
  const out = library.map(t => ({ ...t, body: withFirstLine(t.body) }))
  const sequences = {}
  for (const p of PIPELINES) {
    sequences[p] = CODE_CADENCE[p].map(step => {
      const id = `seq-${p.toLowerCase()}-${step.touch}`
      const copy = perTouch?.[p]?.[step.angle] || { subject: '', body: '' }
      const reply = /reply in thread/i.test(step.subject)
      if (!out.some(t => t.id === id)) {
        out.push({
          id,
          name: `${MOTION_OF[p]} touch ${step.touch}: ${step.angle.replace(/-/g, ' ')}`,
          motion: MOTION_OF[p],
          useFor: step.purpose.split('\n')[0].slice(0, 300),
          subject: reply ? null : (copy.subject || null),
          body: withFirstLine(copy.body || 'Hey [First Name],'),
        })
      }
      return { templateId: id, waitDays: step.days, replyInThread: reply }
    })
  }
  await writeTemplates(out)
  await writeConfig(SEQUENCES_KEY, sequences)
  return sequences
}

let cache = { at: 0, value: null }

/**
 * Sequences, custom variables and the library, read together and cached
 * briefly. Also hands the live cadence to angles.js, so every caller of
 * cadenceFor() sees the saved sequences. Call it before reasoning about
 * touches; dealForWork and morningQueue do.
 */
export async function loadWorkspace({ force = false } = {}) {
  if (!force && cache.value && Date.now() - cache.at < 30_000) return cache.value
  let sequences = await readConfig(SEQUENCES_KEY)
  if (!sequences) sequences = await migrate()
  let variables = await readConfig(VARIABLES_KEY)
  if (!Array.isArray(variables)) {
    const settings = await getSettings()
    variables = [{ name: 'Social Proof', value: settings.socialProof || DEFAULT_SOCIAL_PROOF }]
    await writeConfig(VARIABLES_KEY, variables)
  }
  const templates = await listTemplates({ force })
  const value = { sequences, variables, templates }
  setLiveCadences(toCadences(sequences, templates))
  cache = { at: Date.now(), value }
  return value
}

/** Saved steps in the shape the queue and drafting already use. */
function toCadences(sequences, templates) {
  const byId = Object.fromEntries(templates.map(t => [t.id, t]))
  const out = {}
  for (const p of PIPELINES) {
    const steps = sequences?.[p]
    if (!Array.isArray(steps) || !steps.length) continue
    out[p] = steps.map((s, i) => {
      const t = byId[s.templateId]
      const next = steps[i + 1]
      return {
        touch: i + 1,
        days: i === 0 ? 0 : Math.max(0, Number(s.waitDays) || 0),
        angle: t?.name || `touch ${i + 1}`,
        purpose: t?.useFor || t?.name || `Touch ${i + 1}`,
        subject: s.replyInThread && i > 0 ? 'Re: the original subject (reply in thread)' : (t?.subject || ''),
        nextActionDays: next ? Math.max(1, Number(next.waitDays) || 1) : 14,
        templateId: s.templateId,
      }
    })
  }
  return out
}

/** Save one pipeline's steps. Each step names a template that exists. */
export async function saveSequence(pipeline, steps) {
  if (!PIPELINES.includes(pipeline)) throw new Error('Unknown sequence')
  if (!Array.isArray(steps) || !steps.length) throw new Error('A sequence needs at least one step')
  if (steps.length > 12) throw new Error('Twelve steps is the most a sequence can have')
  const { sequences, templates } = await loadWorkspace({ force: true })
  const ids = new Set(templates.map(t => t.id))
  const clean = steps.map((s, i) => {
    if (!ids.has(s.templateId)) throw new Error(`Step ${i + 1} needs a template`)
    const wait = Math.round(Number(s.waitDays))
    if (i > 0 && (!Number.isFinite(wait) || wait < 1 || wait > 60)) throw new Error(`Step ${i + 1}: wait between 1 and 60 days`)
    return { templateId: s.templateId, waitDays: i === 0 ? 0 : wait, replyInThread: i > 0 && Boolean(s.replyInThread) }
  })
  const next = { ...sequences, [pipeline]: clean }
  await writeConfig(SEQUENCES_KEY, next)
  cache = { at: 0, value: null }
  return (await loadWorkspace({ force: true })).sequences
}

/** Save the custom variables. Names are plain words and cannot shadow a built-in one. */
export async function saveVariables(list) {
  if (!Array.isArray(list)) throw new Error('Variables must be a list')
  const seen = new Set()
  const clean = list.map(v => {
    const name = String(v?.name || '').replace(/[[\]]/g, '').trim().slice(0, 40)
    if (!name) throw new Error('Every variable needs a name')
    if (!/^[A-Za-z][A-Za-z0-9 '-]*$/.test(name)) throw new Error(`"${name}": letters, numbers and spaces only`)
    if (BUILT_IN_NAMES.has(name.toLowerCase())) throw new Error(`"${name}" is filled by the tool already`)
    if (seen.has(name.toLowerCase())) throw new Error(`"${name}" is there twice`)
    seen.add(name.toLowerCase())
    return { name, value: String(v?.value || '').slice(0, 2000) }
  })
  await writeConfig(VARIABLES_KEY, clean)
  cache = { at: 0, value: null }
  return clean
}

/** Templates a sequence step points at, so one is not deleted out from under it. */
export function usedBy(sequences, templateId) {
  const out = []
  for (const p of PIPELINES) (sequences?.[p] || []).forEach((s, i) => { if (s.templateId === templateId) out.push(`${MOTION_OF[p]} step ${i + 1}`) })
  return out
}
