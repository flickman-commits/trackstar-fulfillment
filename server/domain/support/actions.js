/**
 * The quick actions beside a conversation: the things the playbook has a
 * rep do over and over, each one a button. Every one is pressed by a
 * person, leaves an event in the thread and a line in the audit log, and
 * does one thing:
 *
 *   discount15        a one-time FIRSTNAME-15 code in Shopify (the Make-It-Right toolkit)
 *   lookupCode        what Shopify says about a code the customer pasted
 *   tagReprint        REPRINT tag and a note on the Shopify order (scenarios 2A, 13)
 *   orderNote         a comment on our order row, for whoever is fulfilling it
 *   fixPersonalization the runner's name or year on our order row, before production (scenario 3)
 *   slackMatt         the escalation rules: a line in Slack with a link to the thread
 *
 * Refunds, cancellations and order edits are money and stay in Shopify;
 * the panel links straight to the right Shopify page for them.
 */
import prisma from '../../db.js'
import { shopifyGraphQL, shopifyFetch } from '../../services/shopifyAuth.js'
import { appBaseUrl } from '../../lib/links.js'
import { setStatus } from './threads.js'

function actorName(actor) {
  return [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') || 'Someone'
}
async function event(threadId, body, actor) {
  await prisma.supportNote.create({ data: { threadId, kind: 'event', body, authorId: actor?.id || null, authorName: actorName(actor) } })
}

/** The link a Slack message or a note points at. */
export function threadUrl(threadId) {
  return `${appBaseUrl()}/support?thread=${encodeURIComponent(threadId)}`
}

// ---------------------------------------------------------------------------
// Discount codes
// ---------------------------------------------------------------------------

const CREATE_CODE = `
  mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }`

/** A personal 15% code named after the customer, one use, 30 days. JANE-15, then JANE-15-2 if she has had one. */
export async function discount15({ thread, actor, percent = 15, days = 30 }) {
  const first = String(thread.customerName || '').trim().split(/\s+/)[0] || ''
  const stem = (first.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'TRACKSTAR').slice(0, 20)
  const endsAt = new Date(Date.now() + days * 86400000).toISOString()
  let lastError = ''
  for (let i = 1; i <= 5; i++) {
    const code = i === 1 ? `${stem}-${percent}` : `${stem}-${percent}-${i}`
    const data = await shopifyGraphQL(CREATE_CODE, {
      basicCodeDiscount: {
        title: code, code, startsAt: new Date().toISOString(), endsAt, usageLimit: 1, appliesOncePerCustomer: true,
        customerSelection: { all: true },
        customerGets: { value: { percentage: percent / 100 }, items: { all: true } },
      },
    })
    const errs = data?.discountCodeBasicCreate?.userErrors || []
    if (!errs.length) {
      await event(thread.id, `${actorName(actor)} created code ${code} (${percent}% off, one use, ${days} days)`, actor)
      return { code, percent, endsAt }
    }
    lastError = errs.map(e => e.message).join('; ')
    if (!/already|taken|exists|in use/i.test(lastError)) break
  }
  throw new Error(`Shopify would not create the code: ${lastError || 'unknown error'}`)
}

const CODE_BY_STRING = `
  query($code: String!) {
    codeDiscountNodeByCode(code: $code) {
      id
      codeDiscount {
        ... on DiscountCodeBasic { title status startsAt endsAt usageLimit appliesOncePerCustomer asyncUsageCount
          customerGets { value { __typename ... on DiscountPercentage { percentage } ... on DiscountAmount { amount { amount currencyCode } } } } }
        ... on DiscountCodeBxgy { title status startsAt endsAt usageLimit appliesOncePerCustomer asyncUsageCount }
        ... on DiscountCodeFreeShipping { title status startsAt endsAt usageLimit appliesOncePerCustomer asyncUsageCount }
      }
    }
  }`

/** What Shopify knows about a code, with the plain-words reason it would fail. */
export async function lookupCode(code) {
  const c = String(code || '').trim().toUpperCase()
  if (!c) throw new Error('Which code?')
  const data = await shopifyGraphQL(CODE_BY_STRING, { code: c })
  const node = data?.codeDiscountNodeByCode
  if (!node?.codeDiscount) return { code: c, found: false, verdict: 'No such code in Shopify. Check the spelling, or it was never created.' }
  const d = node.codeDiscount
  const v = d.customerGets?.value
  const value = v?.__typename === 'DiscountPercentage' ? `${Math.round(v.percentage * 100)}% off` : v?.amount ? `$${v.amount.amount} off` : d.title
  const now = Date.now()
  let verdict = 'Valid right now.'
  if (d.status === 'EXPIRED' || (d.endsAt && new Date(d.endsAt).getTime() < now)) verdict = `Expired ${d.endsAt ? new Date(d.endsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}.`
  else if (d.status === 'SCHEDULED' || (d.startsAt && new Date(d.startsAt).getTime() > now)) verdict = 'Not active yet.'
  else if (d.usageLimit && d.asyncUsageCount >= d.usageLimit) verdict = `Already used (${d.asyncUsageCount} of ${d.usageLimit}).`
  else if (d.status !== 'ACTIVE') verdict = `Status is ${String(d.status).toLowerCase()}.`
  return {
    code: c, found: true, title: d.title, value, status: d.status, startsAt: d.startsAt, endsAt: d.endsAt,
    usageLimit: d.usageLimit, used: d.asyncUsageCount, oncePerCustomer: d.appliesOncePerCustomer,
    // Klaviyo's unique codes live in Shopify as a batch named after the campaign.
    fromKlaviyo: /\(\d{4}-\d{2}-\d{2}/.test(d.title || ''),
    verdict,
  }
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/** REPRINT on the Shopify order's tags, and why in its note. Also a comment on our rows for it. */
export async function tagReprint({ thread, shopifyOrderId, reason, actor }) {
  const id = String(shopifyOrderId || '').trim()
  if (!/^\d+$/.test(id)) throw new Error('That order has no Shopify id')
  const { order } = await shopifyFetch(`/orders/${id}.json?fields=id,name,tags,note`)
  const tags = String(order.tags || '').split(',').map(s => s.trim()).filter(Boolean)
  if (!tags.includes('REPRINT')) tags.push('REPRINT')
  const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const line = `REPRINT (${stamp}, ${actor?.firstName || 'support'}): ${String(reason || '').trim() || 'see support thread'}`
  const note = [order.note, line].filter(Boolean).join('\n')
  await shopifyFetch(`/orders/${id}.json`, { method: 'PUT', body: JSON.stringify({ order: { id: Number(id), tags: tags.join(', '), note } }) })
  const ours = await prisma.order.findMany({ where: { source: 'shopify', parentOrderNumber: id }, select: { id: true } })
  if (ours.length) {
    await prisma.orderComment.createMany({ data: ours.map(o => ({ orderId: o.id, text: line, authorId: actor?.id || null, authorName: actorName(actor) })) })
  }
  const number = String(order.name || '').replace(/^#/, '') || id
  await event(thread.id, `${actorName(actor)} tagged #${number} REPRINT: ${String(reason || '').trim() || 'no reason given'}`, actor)
  return { number, tags }
}

/** A comment on our order row, where fulfillment reads it. */
export async function orderNote({ thread, orderId, text, actor }) {
  const t = String(text || '').trim()
  if (!t) throw new Error('Write the note first')
  const o = await prisma.order.findUnique({ where: { id: String(orderId || '') }, select: { id: true, parentOrderNumber: true, shopifyOrderData: true } })
  if (!o) throw new Error('No such order')
  await prisma.orderComment.create({ data: { orderId: o.id, text: `${t} (from support: ${threadUrl(thread.id)})`, authorId: actor?.id || null, authorName: actorName(actor) } })
  const number = String(o.shopifyOrderData?.name || o.parentOrderNumber).replace(/^#/, '')
  await event(thread.id, `${actorName(actor)} left a note on #${number}: ${t}`, actor)
  return { number }
}

/** The runner's name or the race year on our row, before it is produced. */
export async function fixPersonalization({ thread, orderId, runnerName, year, actor }) {
  const o = await prisma.order.findUnique({ where: { id: String(orderId || '') } })
  if (!o) throw new Error('No such order')
  if (o.status === 'completed' || o.designStatus === 'sent_to_production') throw new Error('That one has gone to production. It is a reprint now (tag REPRINT), not an edit.')
  const data = {}
  const name = String(runnerName || '').trim()
  const y = Number(year)
  if (name && name !== (o.runnerNameOverride || o.runnerName)) data.runnerNameOverride = name
  if (Number.isFinite(y) && y >= 1990 && y <= 2100 && y !== (o.yearOverride || o.raceYear)) data.yearOverride = y
  if (!Object.keys(data).length) throw new Error('Nothing changed')
  await prisma.order.update({ where: { id: o.id }, data })
  const what = [data.runnerNameOverride ? `name to ${data.runnerNameOverride}` : null, data.yearOverride ? `year to ${data.yearOverride}` : null].filter(Boolean).join(' and ')
  const number = String(o.shopifyOrderData?.name || o.parentOrderNumber).replace(/^#/, '')
  await prisma.orderComment.create({ data: { orderId: o.id, text: `Support changed ${what} (customer asked: ${threadUrl(thread.id)})`, authorId: actor?.id || null, authorName: actorName(actor) } })
  await event(thread.id, `${actorName(actor)} changed #${number}: ${what}`, actor)
  return { number, what }
}

// ---------------------------------------------------------------------------
// Escalation
// ---------------------------------------------------------------------------

/** A line to Matt in Slack with the thread link, and the thread marked escalated. */
export async function slackMatt({ thread, text, actor }) {
  const url = process.env.SLACK_DM_WEBHOOK_URL || process.env.SLACK_PROOF_WEBHOOK_URL
  if (!url) throw new Error('No Slack webhook is set (SLACK_DM_WEBHOOK_URL)')
  const who = thread.customerName || thread.customerEmail || 'a customer'
  const msg = `:rotating_light: *Support escalation* from ${actorName(actor)}\n*${who}*: ${thread.subject || '(no subject)'}\n${String(text || '').trim() || 'Needs your call.'}\n${threadUrl(thread.id)}`
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: msg }) })
  if (!res.ok) throw new Error(`Slack said ${res.status}`)
  if (thread.status !== 'escalated') await setStatus(thread.id, 'escalated', actor)
  await event(thread.id, `${actorName(actor)} pinged Matt in Slack${text ? `: ${String(text).trim()}` : ''}`, actor)
  return { ok: true }
}
