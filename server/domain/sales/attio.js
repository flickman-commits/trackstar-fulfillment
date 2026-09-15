/**
 * Attio is the CRM. Postgres is the machinery.
 *
 * After a send, the deal in Attio has to say so: last contacted, touch count,
 * next action and date, and the stage moves to Reached Out if it was Not
 * Contacted. Nothing here ever advances a deal further than that; a reply is
 * what moves it to In Conversation, and the overnight upkeep handles those.
 *
 * Every call is best effort and returns { target: 'attio', ok, error }. The
 * email has already gone by the time this runs. A failed write is logged and
 * shown; it is never a reason to retry the send.
 *
 * Linking: a Company row does not carry an Attio id until the first time it
 * is needed. Deals were created with the same name as the Postgres company,
 * so the first link is an exact name match within the same motion, cached on
 * the row. A company with no deal, or two deals with the same name, is left
 * unlinked and reported rather than guessed.
 *
 * API notes worth keeping: PATCH replaces single-value attributes (all the
 * ones written here); it appends on multiselects, so never use it for those.
 * Clear a value with [] and never null. Status and select values are written
 * by option title.
 */
import prisma from '../../../api/_lib/prisma.js'
import { fetchWithTimeout } from '../../lib/fetchWithTimeout.js'

const BASE = 'https://api.attio.com/v2'

export function isAttioConfigured() { return Boolean(process.env.ATTIO_API_KEY) }

async function attio(path, { method = 'GET', body } = {}) {
  const res = await fetchWithTimeout(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.ATTIO_API_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }, 15000)
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = null }
  if (!res.ok) throw new Error(`Attio ${method} ${path} -> ${res.status}: ${json?.message || text.slice(0, 200)}`)
  return json
}

/** Our stages, as Attio's deal stage titles. */
export const ATTIO_STAGE = {
  NOT_CONTACTED: 'Not Contacted',
  QUEUED: 'Not Contacted',
  SENT: 'Reached Out',
  FOLLOWED_UP: 'Reached Out',
  REPLIED: 'In Conversation',
  CALL_BOOKED: 'Call Booked',
  PROPOSAL_SENT: 'Proposal Sent',
  INTERESTED: 'Proposal Sent',
  SIGNED: 'Won',
  INVOICED: 'Won',
  PAID: 'Won',
  NEXT_YEAR: 'Revisit Next Year',
  PASSED: 'Lost',
  NOT_INTERESTED: 'Lost',
}

const MOTION = { CHARITY: 'Charity', RACE: 'Race' }

function day(d) { return new Date(d).toISOString().slice(0, 10) }

/** Read one value off a record the way Attio returns it: an array of entries. */
function val(record, slug) {
  const v = record?.values?.[slug]
  if (!Array.isArray(v) || !v.length) return null
  const first = v[0]
  if (first.status?.title) return first.status.title
  if (first.option?.title) return first.option.title
  if ('value' in first) return first.value
  return null
}

/** Find the deal for a company by exact name within its motion. */
export async function findDeal(company) {
  const out = await attio('/objects/deals/records/query', { method: 'POST', body: { filter: { name: { $eq: company.name } }, limit: 10 } })
  const motion = MOTION[company.pipeline]
  // Motion is matched here rather than in the filter: a select filter has its
  // own syntax and a wrong guess silently returns nothing.
  const data = (out?.data || []).filter(d => !motion || !val(d, 'motion') || val(d, 'motion') === motion)
  if (data.length === 1) return data[0]
  if (data.length > 1) throw new Error(`${data.length} Attio deals are named "${company.name}"`)
  return null
}

/** The deal id for a company, linking and caching it on first use. */
export async function ensureDealId(company) {
  if (company.attioDealId) return company.attioDealId
  const deal = await findDeal(company)
  if (!deal) return null
  const id = deal.id?.record_id
  if (!id) return null
  await prisma.company.update({ where: { id: company.id }, data: { attioDealId: id } })
  return id
}

export async function getDeal(recordId) {
  const out = await attio(`/objects/deals/records/${recordId}`)
  return out?.data || null
}

async function patchDeal(recordId, values) {
  return attio(`/objects/deals/records/${recordId}`, { method: 'PATCH', body: { data: { values } } })
}

/**
 * After a send. Touch count and dates are written as the app now knows them;
 * the stage only moves off Not Contacted and never past Reached Out.
 */
export async function recordSend(company, { sentAt, touchCount, nextActionAt, nextAction }) {
  if (!isAttioConfigured()) return { target: 'attio', ok: false, skipped: 'ATTIO_API_KEY not set' }
  try {
    const recordId = await ensureDealId(company)
    if (!recordId) return { target: 'attio', ok: false, skipped: `no Attio deal named "${company.name}"` }
    const deal = await getDeal(recordId)
    const values = {
      last_contacted: day(sentAt || new Date()),
      touch_count: touchCount,
    }
    if (nextActionAt) values.next_action_date = day(nextActionAt)
    if (nextAction) values.next_action = nextAction
    if (val(deal, 'stage') === 'Not Contacted') values.stage = 'Reached Out'
    await patchDeal(recordId, values)
    return { target: 'attio', ok: true, recordId }
  } catch (err) {
    console.error(`[sales.attio] send write failed for ${company.name}: ${err.message}`)
    return { target: 'attio', ok: false, error: err.message }
  }
}

/** A person changed the stage by hand. Mirror it exactly. */
export async function recordStage(company) {
  if (!isAttioConfigured()) return { target: 'attio', ok: false, skipped: 'ATTIO_API_KEY not set' }
  const title = ATTIO_STAGE[company.stage]
  if (!title) return { target: 'attio', ok: false, skipped: `no Attio stage for ${company.stage}` }
  try {
    const recordId = await ensureDealId(company)
    if (!recordId) return { target: 'attio', ok: false, skipped: `no Attio deal named "${company.name}"` }
    const values = { stage: title }
    if (company.nextActionAt) values.next_action_date = day(company.nextActionAt)
    if (company.nextAction) values.next_action = company.nextAction
    await patchDeal(recordId, values)
    return { target: 'attio', ok: true, recordId }
  } catch (err) {
    console.error(`[sales.attio] stage write failed for ${company.name}: ${err.message}`)
    return { target: 'attio', ok: false, error: err.message }
  }
}

/** Settings check: can we reach the workspace at all. */
export async function checkAttio() {
  if (!isAttioConfigured()) return { configured: false, ok: false }
  try {
    const out = await attio('/self')
    return { configured: true, ok: true, workspace: out?.data?.workspace_name || null }
  } catch (err) {
    return { configured: true, ok: false, error: err.message }
  }
}
