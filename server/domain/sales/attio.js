/**
 * Attio is the CRM. This is the only file that talks to it.
 *
 * Workspace `trackstar-usa`, object `deals`. A deal is the unit of work: it
 * carries the stage, the motion (Race or Charity), the owner, the touch count
 * and the next action. The company and the people hang off it as record
 * references, and Attio's own enrichment (a description of the org, the
 * person's title and LinkedIn) lives on those records. The Sales tool reads
 * all of that live and never copies it anywhere.
 *
 * Reads: every open deal in one paged query, then the companies and people
 * those deals reference in a handful of batched queries. Cached for a short
 * while per process so a page load is not sixty round trips.
 *
 * Writes: exactly what a send changes. touch_count, next_action (only when
 * the field is empty or already carries the `[auto]` prefix, because a human
 * who typed a next action owns it), next_action_date, the stage from Not
 * Contacted to Reached Out and never further, and a note on the deal with the
 * email that went. A person changing the stage by hand from the tool is a
 * human decision and is written as given.
 *
 * API notes worth keeping: PATCH replaces single-value attributes and appends
 * to multiselects, so never PATCH a multiselect from here. Clear a value with
 * [] and never null. Status and select values are written by option title.
 * Filtering on select and status attributes has its own syntax and a wrong
 * guess silently returns nothing, which is why stage and motion are filtered
 * in JavaScript after a plain paged fetch.
 */
import { fetchWithTimeout } from '../../lib/fetchWithTimeout.js'

const BASE = process.env.ATTIO_BASE_URL || 'https://api.attio.com/v2'
const PAGE = 500
const CACHE_MS = 45_000

export const WORKSPACE_SLUG = 'trackstar-usa'

/** Stage titles, in pipeline order. From the CRM upkeep skill; the workspace is the authority. */
export const STAGES = ['Needs Enrichment', 'Not Contacted', 'Reached Out', 'In Conversation', 'Call Booked', 'Deck Sent', 'Won', 'Revisit Next Year', 'Lost']
export const MOTIONS = ['Race', 'Charity', 'Corporate']

/** Deal attributes the tool reads or writes. The settings check reports any that are missing. */
export const DEAL_ATTRIBUTES = {
  reads: ['name', 'stage', 'motion', 'owner', 'associated_company', 'associated_people', 'touch_count', 'next_action', 'next_action_date', 'race_date', 'runners', 'tier', 'size_tier', 'priority', 'races', 'deal_notes', 'value', 'units'],
  writes: ['stage', 'touch_count', 'next_action', 'next_action_date'],
}

export function isAttioConfigured() { return Boolean(process.env.ATTIO_API_KEY) }

async function attio(path, { method = 'GET', body } = {}) {
  if (!isAttioConfigured()) throw new Error('Attio is not connected: ATTIO_API_KEY is not set')
  const res = await fetchWithTimeout(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.ATTIO_API_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }, 20000)
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = null }
  if (!res.ok) {
    const err = new Error(`Attio ${method} ${path} -> ${res.status}: ${json?.message || text.slice(0, 200)}`)
    err.status = res.status
    throw err
  }
  return json
}

// ── Reading values off records ───────────────────────────────────────────────

/** The first entry of an attribute, whatever its type, or null. */
function first(record, slug) {
  const v = record?.values?.[slug]
  return Array.isArray(v) && v.length ? v[0] : null
}

/** A scalar: text, number, date, select title, status title. */
export function val(record, slug) {
  const f = first(record, slug)
  if (!f) return null
  if (f.status?.title) return f.status.title
  if (f.option?.title) return f.option.title
  if ('currency_value' in f) return f.currency_value
  if ('value' in f) return f.value
  return null
}

function refs(record, slug) {
  const v = record?.values?.[slug]
  return Array.isArray(v) ? v.map(x => x.target_record_id).filter(Boolean) : []
}

function actorId(record, slug) {
  const f = first(record, slug)
  return f?.referenced_actor_id || null
}

function personName(record) {
  const n = first(record, 'name')
  return { firstName: n?.first_name || '', lastName: n?.last_name || '', fullName: n?.full_name || '' }
}

function emails(record) {
  const v = record?.values?.email_addresses
  return Array.isArray(v) ? v.map(x => x.email_address).filter(Boolean) : []
}

function domain(record) {
  const f = first(record, 'domains')
  return f?.root_domain || f?.domain || null
}

function location(record) {
  const f = first(record, 'primary_location')
  if (!f) return null
  const parts = [f.locality, f.region].filter(Boolean)
  return parts.length ? parts.join(', ') : (f.country_code || null)
}

function interaction(record, slug) {
  const f = first(record, slug)
  return f?.interacted_at || null
}

function multi(record, slug) {
  const v = record?.values?.[slug]
  return Array.isArray(v) ? v.map(x => x.option?.title).filter(Boolean) : []
}

function recordId(record) { return record?.id?.record_id || null }

// ── Views: the shapes the rest of the app sees ───────────────────────────────

export function companyView(record) {
  if (!record) return null
  return {
    id: recordId(record),
    name: val(record, 'name'),
    domain: domain(record),
    description: val(record, 'description'),
    location: location(record),
    employeeRange: val(record, 'employee_range'),
    categories: multi(record, 'categories'),
    linkedin: val(record, 'linkedin'),
    twitter: val(record, 'twitter'),
    lastInteractionAt: interaction(record, 'last_interaction'),
    lastEmailAt: interaction(record, 'last_email_interaction'),
    nextCalendarAt: interaction(record, 'next_calendar_interaction'),
    webUrl: record.web_url || null,
  }
}

export function personView(record) {
  if (!record) return null
  const name = personName(record)
  const all = emails(record)
  return {
    id: recordId(record),
    firstName: name.firstName,
    lastName: name.lastName,
    fullName: name.fullName || `${name.firstName} ${name.lastName}`.trim(),
    email: all[0] || null,
    emails: all,
    title: val(record, 'job_title'),
    description: val(record, 'description'),
    linkedin: val(record, 'linkedin'),
    location: location(record),
    lastInteractionAt: interaction(record, 'last_interaction'),
    lastEmailAt: interaction(record, 'last_email_interaction'),
    webUrl: record.web_url || null,
  }
}

export function dealView(record) {
  if (!record) return null
  return {
    id: recordId(record),
    name: val(record, 'name'),
    stage: val(record, 'stage'),
    motion: val(record, 'motion'),
    ownerId: actorId(record, 'owner'),
    companyId: refs(record, 'associated_company')[0] || null,
    personIds: refs(record, 'associated_people'),
    touchCount: Number(val(record, 'touch_count') || 0),
    nextAction: val(record, 'next_action'),
    nextActionDate: val(record, 'next_action_date'),
    raceDate: val(record, 'race_date'),
    runners: val(record, 'runners'),
    tier: val(record, 'tier'),
    sizeTier: val(record, 'size_tier'),
    // Titled "🔥 High" in the workspace; the emoji is decoration.
    priority: (val(record, 'priority') || '').replace(/[^\p{L}\s]/gu, '').trim() || null,
    // Charity deals: which marathons the team fields. Drives the mockup pick.
    races: multi(record, 'races'),
    notes: val(record, 'deal_notes'),
    value: val(record, 'value'),
    units: val(record, 'units'),
    // Optional: only present if someone adds these to the workspace.
    courseLandmark: val(record, 'course_landmark'),
    identity: val(record, 'identity'),
    createdAt: record.created_at || null,
    webUrl: record.web_url || null,
  }
}

// ── Queries ──────────────────────────────────────────────────────────────────

async function queryAll(object, body = {}) {
  const out = []
  for (let offset = 0; ; offset += PAGE) {
    const res = await attio(`/objects/${object}/records/query`, { method: 'POST', body: { ...body, limit: PAGE, offset } })
    const data = res?.data || []
    out.push(...data)
    if (data.length < PAGE) break
  }
  return out
}

/**
 * One record by id. A plain read: Attio's query complexity limit does not
 * apply, unlike a filter with fifty $or clauses, which it refuses outright.
 */
async function getRecord(object, id) {
  try {
    const out = await attio(`/objects/${object}/records/${id}`)
    return out?.data || null
  } catch (err) {
    if (err.status === 404) return null
    throw err
  }
}

/** Run `fn` over `items` with at most `n` in flight; a 429 waits and retries once. */
async function mapLimit(items, n, fn) {
  const out = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      try {
        out[idx] = await fn(items[idx])
      } catch (err) {
        if (err.status !== 429) throw err
        await new Promise(r => setTimeout(r, 1500))
        out[idx] = await fn(items[idx])
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker))
  return out
}

/**
 * People by id. The people object holds thousands of records from the inbox
 * sync, so it is never read whole; the ones a deal points at are fetched one
 * by one and remembered for a while.
 */
const peopleCache = new Map()
const PEOPLE_MS = 10 * 60_000
async function peopleByIds(ids) {
  const unique = [...new Set(ids.filter(Boolean))]
  const missing = unique.filter(id => !(peopleCache.get(id) && Date.now() - peopleCache.get(id).at < PEOPLE_MS))
  await mapLimit(missing, 8, async id => {
    const rec = await getRecord('people', id)
    peopleCache.set(id, { at: Date.now(), value: rec ? personView(rec) : null })
  })
  return Object.fromEntries(unique.map(id => [id, peopleCache.get(id)?.value || null]))
}

const cache = new Map()
function cached(key, ms, fn) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ms) return hit.value
  const value = fn().catch(err => { cache.delete(key); throw err })
  cache.set(key, { at: Date.now(), value })
  return value
}
export function forgetAttioCache() { cache.clear() }

/**
 * Every deal in the workspace, as views, with the companies and people they
 * point at. One paged fetch plus batched lookups; cached briefly.
 */
/** The stages the queue works. People are loaded up front only for these. */
const WORKED_STAGES = ['Needs Enrichment', 'Not Contacted', 'Reached Out']

/**
 * Every deal in the workspace, as views, with the companies they point at
 * and the people on the ones the queue works. Companies are read whole (a
 * few hundred, plain paged reads); people only by reference. Cached briefly.
 */
export async function loadDeals({ fresh = false } = {}) {
  if (fresh) { cache.delete('deals'); cache.delete('members') }
  return cached('deals', CACHE_MS, async () => {
    const [dealRecords, companyRecords] = await Promise.all([queryAll('deals'), queryAll('companies')])
    const deals = dealRecords.map(dealView).filter(d => d.id)
    const companyById = Object.fromEntries(companyRecords.map(c => [recordId(c), companyView(c)]))
    const worked = deals.filter(d => WORKED_STAGES.includes(d.stage))
    const personById = await peopleByIds(worked.flatMap(d => d.personIds))
    return deals.map(d => ({
      ...d,
      company: companyById[d.companyId] || null,
      people: d.personIds.map(id => personById[id]).filter(Boolean),
      peopleLoaded: WORKED_STAGES.includes(d.stage),
    }))
  })
}

export async function getDeal(id, { fresh = false } = {}) {
  const deals = await loadDeals({ fresh })
  const deal = deals.find(d => d.id === id)
  if (!deal) return null
  if (deal.peopleLoaded) return deal
  // A deal outside the worked stages: its people were not read up front.
  const personById = await peopleByIds(deal.personIds)
  return { ...deal, people: deal.personIds.map(pid => personById[pid]).filter(Boolean), peopleLoaded: true }
}

/** People who can own a deal: id, name, email. Cached longer; the roster rarely changes. */
export async function workspaceMembers() {
  return cached('members', 10 * 60_000, async () => {
    const res = await attio('/workspace_members')
    return (res?.data || []).map(m => ({
      id: m.id?.workspace_member_id || null,
      email: (m.email_address || '').toLowerCase(),
      firstName: m.first_name || '',
      lastName: m.last_name || '',
      access: m.access_level || null,
    })).filter(m => m.id)
  })
}

/** The workspace member whose email matches the signed-in person, or null. */
export async function memberForEmail(email) {
  if (!email) return null
  const want = String(email).toLowerCase()
  return (await workspaceMembers()).find(m => m.email === want) || null
}

// ── Writes ───────────────────────────────────────────────────────────────────

function day(d) { return new Date(d).toISOString().slice(0, 10) }

async function patchDeal(id, values) {
  const out = await attio(`/objects/deals/records/${id}`, { method: 'PATCH', body: { data: { values } } })
  cache.delete('deals')
  return out?.data || null
}

/** A note on a deal. Plain text; the title is what shows in the timeline. */
export async function addDealNote(id, { title, content }) {
  return attio('/notes', {
    method: 'POST',
    body: { data: { parent_object: 'deals', parent_record_id: id, title, format: 'plaintext', content } },
  })
}

/**
 * After a send. The email is gone by the time this runs, so nothing here
 * throws: the result says whether Attio now agrees, and the caller shows it.
 */
export async function recordSend(deal, { sentAt, touchNumber, nextAction, nextActionDate, subject, body, toEmail, sentBy }) {
  if (!isAttioConfigured()) return { ok: false, skipped: 'ATTIO_API_KEY not set' }
  try {
    const values = { touch_count: touchNumber }
    if (nextActionDate) values.next_action_date = day(nextActionDate)
    // A next action a person typed is theirs. Only the tool's own are replaced.
    if (nextAction && (!deal.nextAction || /^\[auto\]/i.test(deal.nextAction))) values.next_action = `[auto] ${nextAction}`
    if (deal.stage === 'Not Contacted' || deal.stage === 'Needs Enrichment') values.stage = 'Reached Out'
    await patchDeal(deal.id, values)
    try {
      await addDealNote(deal.id, {
        title: `${day(sentAt)} Email ${touchNumber} sent: ${subject}`,
        content: `Sent from the Sales tool by ${sentBy || 'a rep'} to ${toEmail}.\nAlready counted in touch_count.\n\nSubject: ${subject}\n\n${body}`,
      })
    } catch (err) {
      console.warn(`[sales.attio] note failed for ${deal.name}: ${err.message}`)
    }
    return { ok: true }
  } catch (err) {
    console.error(`[sales.attio] send write failed for ${deal.name}: ${err.message}`)
    return { ok: false, error: err.message }
  }
}

/** A person changed the stage from the tool. Written exactly. */
export async function setStage(dealId, stage) {
  if (!STAGES.includes(stage)) throw new Error(`Unknown stage: ${stage}`)
  await patchDeal(dealId, { stage })
  return getDeal(dealId, { fresh: true })
}

/** A rep's note on the deal, from the tool. */
export async function noteOnDeal(dealId, text, byEmail) {
  await addDealNote(dealId, { title: `${day(new Date())} Note from ${byEmail || 'the Sales tool'}`, content: text })
}

// ── Health ───────────────────────────────────────────────────────────────────

/**
 * Can we reach the workspace, and does the deals object have the attributes
 * the tool expects. Missing ones are reported by slug so they can be added
 * in Attio settings; the tool keeps working without the optional ones.
 */
export async function checkAttio() {
  if (!isAttioConfigured()) return { configured: false, ok: false }
  try {
    const self = await attio('/self')
    const attrs = await attio('/objects/deals/attributes')
    const slugs = new Set((attrs?.data || []).map(a => a.api_slug))
    const missing = [...DEAL_ATTRIBUTES.reads, ...DEAL_ATTRIBUTES.writes].filter(s => !slugs.has(s))
    const stageAttr = (attrs?.data || []).find(a => a.api_slug === 'stage')
    let stages = null
    if (stageAttr) {
      try {
        const st = await attio(`/objects/deals/attributes/${stageAttr.id?.attribute_id || 'stage'}/statuses`)
        stages = (st?.data || []).map(s => s.title)
      } catch { stages = null }
    }
    const unknownStages = stages ? STAGES.filter(s => !stages.includes(s)) : []
    return {
      configured: true,
      ok: missing.length === 0 && unknownStages.length === 0,
      workspace: self?.data?.workspace_name || null,
      missing: [...new Set(missing)],
      stages,
      unknownStages,
    }
  } catch (err) {
    return { configured: true, ok: false, error: err.message }
  }
}
