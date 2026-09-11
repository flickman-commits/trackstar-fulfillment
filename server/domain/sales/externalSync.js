/**
 * Keep Notion and ClickUp telling the truth after the app becomes it.
 *
 * The app is the system of record for the pipeline. Jimmy's charity CRM in
 * Notion and the race list in ClickUp stay as mirrors, so anyone still looking
 * there, or a weekly review that reads from there, sees what actually
 * happened. Writes go one way: app to mirror. There is no sync engine and no
 * reconciliation, because two-way sync is where these projects go to die; the
 * importer's fill-blanks pull is the only road back in.
 *
 * Every call here is best effort. A Notion outage must never stop an email
 * being marked sent. Failures are logged with the org's name so they can be
 * fixed by hand, and the caller carries on.
 *
 * Notion: the Charity CRM data source. Rows were imported with their page URL
 * as externalId. Updates the exact fields the runbook says to log after a send:
 * Status, Send Date, Last Touch, Touches, and the opening line into Hook.
 *
 * ClickUp: the Race Partnerships list. Rows carry the task id as externalId.
 * Only the task status is written, because that is what the pipeline review
 * reads; the activation subtasks stay ClickUp's business.
 */
import { Client } from '@notionhq/client'
import { fetchWithTimeout } from '../../lib/fetchWithTimeout.js'

let notionClient = null
function notion() {
  if (notionClient) return notionClient
  const token = process.env.NOTION_API_KEY
  if (!token) throw new Error('NOTION_API_KEY not set')
  notionClient = new Client({ auth: token })
  return notionClient
}

export function isNotionConfigured() { return Boolean(process.env.NOTION_API_KEY) }
export function isClickUpConfigured() { return Boolean(process.env.CLICKUP_API_TOKEN) }

/** "https://app.notion.com/3c9977ac2a3e81f49403dbf8b6142445" -> "3c9977ac-2a3e-81f4-9403-dbf8b6142445" */
export function notionPageId(externalId) {
  const m = String(externalId || '').match(/([0-9a-f]{32})(?:[?#].*)?$/i)
  if (!m) return null
  const h = m[1]
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** App stage -> Notion Status option. Only exact equivalents; anything else leaves Status alone. */
const NOTION_STATUS = {
  NOT_CONTACTED: 'Not Started',
  QUEUED: 'Queued',
  SENT: 'Sent',
  FOLLOWED_UP: 'Followed Up',
  CALL_BOOKED: 'Call Booked',
  PROPOSAL_SENT: 'Proposal Sent',
  INTERESTED: 'Interested',
  INVOICED: 'Invoiced',
  PAID: 'Paid',
  PASSED: 'Passed',
  NOT_INTERESTED: 'Not Interested',
}

/** App stage -> ClickUp status name. Names must match the list's statuses exactly. */
const CLICKUP_STATUS = {
  REPLIED: 'in conversation',
  PROPOSAL_SENT: 'proposal sent',
  SIGNED: 'signed',
  NEXT_YEAR: 'hit up next year',
}

/**
 * The line that opened the email, for Notion's Hook field, "so you don't
 * repeat yourself on follow-up". Skips the greeting and takes the first real
 * paragraph.
 */
export function openingLine(body) {
  const paragraphs = String(body || '').replace(/\r\n/g, '\n').split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  const first = paragraphs.find(p => !/^(hey|hi|hello|dear)\b/i.test(p))
  return (first || '').slice(0, 200)
}

const day = d => new Date(d).toISOString().slice(0, 10)

/**
 * Mirror a company's state out. `sent` carries the touch that just went out,
 * when the trigger is a send rather than a stage change.
 *
 * @param {object} company  Company row (needs pipeline, externalId, stage, touchCount, lastTouchAt, name)
 * @param {{ sent?: { body?: string, touchNumber?: number, sentAt?: Date } }} [opts]
 * @returns {Promise<{ target: 'notion'|'clickup'|null, ok: boolean, skipped?: string, error?: string }>}
 */
export async function syncCompanyOut(company, { sent } = {}) {
  if (!company?.externalId) return { target: null, ok: true, skipped: 'no external id' }

  if (company.pipeline === 'CHARITY') {
    if (!isNotionConfigured()) return { target: 'notion', ok: false, skipped: 'NOTION_API_KEY not set' }
    const pageId = notionPageId(company.externalId)
    if (!pageId) return { target: 'notion', ok: false, skipped: 'externalId is not a Notion page' }
    const properties = {}
    const status = NOTION_STATUS[company.stage]
    if (status) properties['Status'] = { select: { name: status } }
    if (sent) {
      const when = sent.sentAt || company.lastTouchAt || new Date()
      properties['Last Touch'] = { date: { start: day(when) } }
      properties['Touches'] = { number: company.touchCount }
      if ((sent.touchNumber || company.touchCount) === 1) properties['Send Date'] = { date: { start: day(when) } }
      const hook = openingLine(sent.body)
      if (hook) properties['Hook'] = { rich_text: [{ text: { content: hook } }] }
    }
    if (!Object.keys(properties).length) return { target: 'notion', ok: true, skipped: 'nothing to write' }
    try {
      await notion().pages.update({ page_id: pageId, properties })
      return { target: 'notion', ok: true }
    } catch (err) {
      console.error(`[sales.sync] Notion update failed for ${company.name}: ${err.message}`)
      return { target: 'notion', ok: false, error: err.message }
    }
  }

  if (company.pipeline === 'RACE') {
    if (!isClickUpConfigured()) return { target: 'clickup', ok: false, skipped: 'CLICKUP_API_TOKEN not set' }
    const status = CLICKUP_STATUS[company.stage]
    if (!status) return { target: 'clickup', ok: true, skipped: `no ClickUp status for ${company.stage}` }
    try {
      const res = await fetchWithTimeout(`https://api.clickup.com/api/v2/task/${encodeURIComponent(company.externalId)}`, {
        method: 'PUT',
        headers: { Authorization: process.env.CLICKUP_API_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }, 15_000)
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`${res.status} ${text.slice(0, 200)}`)
      }
      return { target: 'clickup', ok: true }
    } catch (err) {
      console.error(`[sales.sync] ClickUp update failed for ${company.name}: ${err.message}`)
      return { target: 'clickup', ok: false, error: err.message }
    }
  }

  return { target: null, ok: true, skipped: 'unknown pipeline' }
}

/**
 * Can the app actually reach the mirrors? Reads one known page; never writes.
 * The Notion integration has to be shared with the Charity CRM database by a
 * person in Notion, and nothing in code can do that, so this is how to tell
 * whether it happened.
 */
export async function checkMirrors(sampleNotionExternalId) {
  const out = { notion: { configured: isNotionConfigured(), ok: false }, clickup: { configured: isClickUpConfigured(), ok: false } }
  if (out.notion.configured) {
    const pageId = notionPageId(sampleNotionExternalId)
    if (!pageId) out.notion.error = 'No charity row with a Notion page to test against'
    else {
      try {
        const page = await notion().pages.retrieve({ page_id: pageId })
        out.notion.ok = true
        out.notion.sample = page?.properties?.Name?.title?.[0]?.plain_text || pageId
      } catch (err) {
        out.notion.error = /could not find|not found|404/i.test(err.message)
          ? 'The integration cannot see the Charity CRM. In Notion, open the CRM, three dots, Connections, add the Trackstar integration.'
          : err.message
      }
    }
  }
  if (out.clickup.configured) {
    try {
      const res = await fetchWithTimeout('https://api.clickup.com/api/v2/user', { headers: { Authorization: process.env.CLICKUP_API_TOKEN } }, 10_000)
      out.clickup.ok = res.ok
      if (!res.ok) out.clickup.error = `ClickUp answered ${res.status}`
    } catch (err) { out.clickup.error = err.message }
  }
  return out
}
