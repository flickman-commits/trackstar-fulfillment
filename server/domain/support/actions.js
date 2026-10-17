/**
 * The quick actions beside a conversation: the things the playbook has a
 * rep do over and over, each one a button. Every one is pressed by a
 * person, leaves an event in the thread and a line in the audit log, and
 * does one thing:
 *
 *   discount15        a one-time FIRSTNAME-<percent> code in Shopify, any whole percent (the Make-It-Right toolkit)
 *   lookupCode        what Shopify says about a code the customer pasted
 *   orderNote         a comment on our order row, for whoever is fulfilling it
 *   fixPersonalization the runner's name or year on our order row, before production (scenario 3)
 *   shippingAddress   a new ship-to on the Shopify order and our rows (scenario 19); Artelo is changed by hand
 *   refund            money back on a Shopify order, all or part (scenarios 5, 15); over $150 is an admin's
 *   cancelOrder       cancel and fully refund an order not yet in production, once the customer said yes (scenario 14)
 *   slackMatt         the escalation rules: a line in Slack with a link to the thread
 *
 * Refunds, cancellations and order edits are money and stay in Shopify;
 * the panel links straight to the right Shopify page for them.
 */
import prisma from '../../db.js'
import { shopifyGraphQL, shopifyFetch } from '../../services/shopifyAuth.js'
import { appBaseUrl, arteloOrderUrl } from '../../lib/links.js'
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

/** A personal code named after the customer, one use, 30 days: JANE-15, then JANE-15-2 if she has had one. */
export async function discount15({ thread, actor, percent = 15, days = 30 }) {
  // Whole percent, 1 to 100. Always one use, once per customer: a code is a gift to one person.
  percent = Number(percent)
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) throw new Error('The discount is a whole percent from 1 to 100.')
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
  if (o.status === 'completed' || o.designStatus === 'sent_to_production') throw new Error('That one has gone to production. It is a reprint now, not an edit; ask Matt.')
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

/**
 * A new ship-to address (scenario 19, gifts going to the runner instead).
 *
 * Shopify's order takes it through the Admin API, and our rows keep it for
 * the dashboard. Artelo has no endpoint that edits an order (its open API
 * reads orders and manages uploads only), so the address is handed back
 * formatted for pasting, with the Artelo order's link, and the thread says
 * plainly that Artelo still needs it until someone confirms it there.
 */
const ADDRESS_FIELDS = ['name', 'address1', 'address2', 'city', 'province', 'zip', 'country', 'phone']
export function formatAddress(a) {
  return [a.name, a.address1, a.address2, [a.city, a.province, a.zip].filter(Boolean).join(' '), a.country].filter(Boolean).join('\n')
}
export async function shippingAddress({ thread, shopifyOrderId, address, actor }) {
  const a = {}
  for (const k of ADDRESS_FIELDS) a[k] = String(address?.[k] || '').trim()
  a.country = a.country.toUpperCase()
  a.province = a.province.toUpperCase()
  for (const k of ['name', 'address1', 'city', 'zip', 'country']) if (!a[k]) throw new Error(`The address needs a ${k === 'address1' ? 'street' : k}`)
  const id = String(shopifyOrderId || '').trim()
  if (!/^\d+$/.test(id)) throw new Error('That order has no Shopify id')

  const rows = await prisma.order.findMany({ where: { source: 'shopify', parentOrderNumber: id }, select: { id: true, status: true, designStatus: true, trackingNumber: true, arteloOrderData: true, shopifyOrderData: true } })
  if (rows.some(r => r.trackingNumber)) throw new Error('That order has shipped. Ask Matt; it is a reship now, not an address change.')

  const { order } = await shopifyFetch(`/orders/${id}.json?fields=id,name,fulfillment_status`)
  if (order.fulfillment_status === 'fulfilled') throw new Error('Shopify says that order is fulfilled already. Ask Matt; it is a reship now.')
  const [first, ...last] = a.name.split(/\s+/)
  await shopifyFetch(`/orders/${id}.json`, {
    method: 'PUT',
    body: JSON.stringify({ order: { id: Number(id), shipping_address: {
      first_name: first, last_name: last.join(' '), address1: a.address1, address2: a.address2 || null, city: a.city,
      province_code: a.province || null, zip: a.zip, country_code: a.country, phone: a.phone || null,
    } } }),
  })

  const ours = { name: a.name, line1: a.address1, line2: a.address2, city: a.city, state: a.province, zip: a.zip, country: a.country, phone: a.phone }
  const number = String(order.name || rows[0]?.shopifyOrderData?.name || id).replace(/^#/, '')
  const pasted = formatAddress(a)
  if (rows.length) {
    await prisma.order.updateMany({ where: { id: { in: rows.map(r => r.id) } }, data: { shippingAddress: ours } })
    await prisma.orderComment.createMany({ data: rows.map(r => ({ orderId: r.id, text: `Ship-to changed by support to: ${pasted.replace(/\n/g, ', ')}. Change it in Artelo too.`, authorId: actor?.id || null, authorName: actorName(actor) })) })
  }
  await event(thread.id, `${actorName(actor)} changed #${number}'s ship-to in Shopify to ${pasted.replace(/\n/g, ', ')}. Artelo still needs it.`, actor)
  return { number, address: a, pasted, arteloUrl: arteloOrderUrl(rows[0]?.arteloOrderData?.id) || null }
}

// ---------------------------------------------------------------------------
// Money: refunds and cancellations
// ---------------------------------------------------------------------------
//
// Amounts travel as integer cents and become Shopify's decimal strings only
// at the call. The playbook's line is $150: under it a rep refunds on their
// own, over it the server refuses anyone but an admin, whatever the page
// says. Nothing here notifies the customer through Shopify; the rep's reply
// is the message.

export const REFUND_LIMIT_CENTS = 15000

const ORDER_MONEY = `
  query($id: ID!) {
    order(id: $id) {
      id name cancelledAt displayFinancialStatus displayFulfillmentStatus
      totalReceivedSet { shopMoney { amount currencyCode } }
      totalRefundedSet { shopMoney { amount currencyCode } }
      transactions(first: 20) { id kind status gateway amountSet { shopMoney { amount currencyCode } } }
    }
  }`

const toCents = amount => Math.round(Number(amount || 0) * 100)
const toAmount = cents => (cents / 100).toFixed(2)
const money = cents => `$${toAmount(cents)}`

/** What can still be refunded on a Shopify order, and the payment to refund it against. */
export async function refundable(shopifyOrderId) {
  const id = String(shopifyOrderId || '').trim()
  if (!/^\d+$/.test(id)) throw new Error('That order has no Shopify id')
  const data = await shopifyGraphQL(ORDER_MONEY, { id: `gid://shopify/Order/${id}` })
  const o = data?.order
  if (!o) throw new Error('Shopify does not have that order')
  const received = toCents(o.totalReceivedSet?.shopMoney?.amount)
  const refunded = toCents(o.totalRefundedSet?.shopMoney?.amount)
  const sale = (o.transactions || []).find(t => (t.kind === 'SALE' || t.kind === 'CAPTURE') && t.status === 'SUCCESS') || null
  return {
    id, gid: o.id, name: String(o.name || '').replace(/^#/, ''),
    cancelled: Boolean(o.cancelledAt), financial: o.displayFinancialStatus, fulfillment: o.displayFulfillmentStatus,
    currency: o.totalReceivedSet?.shopMoney?.currencyCode || 'USD',
    receivedCents: received, refundedCents: refunded, availableCents: Math.max(0, received - refunded),
    sale,
  }
}

const REFUND_CREATE = `
  mutation refundCreate($input: RefundInput!) {
    refundCreate(input: $input) {
      refund { id totalRefundedSet { shopMoney { amount currencyCode } } }
      userErrors { field message }
    }
  }`

function guardLimit(cents, actor) {
  if (cents > REFUND_LIMIT_CENTS && actor?.role !== 'admin' && !actor?.isSystem) {
    throw new Error(`${money(cents)} is over the ${money(REFUND_LIMIT_CENTS)} line. That one is Matt's call: Slack Matt with the details.`)
  }
}

/** Money back, all or part, against the order's payment. The order itself stays as it is. */
export async function refund({ thread, shopifyOrderId, cents, reason, actor }) {
  const amount = Math.round(Number(cents))
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('How much? Enter an amount above zero.')
  const why = String(reason || '').trim()
  if (!why) throw new Error('Say why, in a few words. It goes on the refund in Shopify.')
  const o = await refundable(shopifyOrderId)
  if (!o.sale) throw new Error('No captured payment on that order to refund against.')
  if (amount > o.availableCents) throw new Error(`Only ${money(o.availableCents)} is left to refund on #${o.name}.`)
  guardLimit(amount, actor)

  const data = await shopifyGraphQL(REFUND_CREATE, {
    input: {
      orderId: o.gid,
      note: `${why} (support, ${actor?.firstName || 'rep'})`,
      notify: false,
      transactions: [{ orderId: o.gid, parentId: o.sale.id, gateway: o.sale.gateway, kind: 'REFUND', amount: toAmount(amount) }],
    },
  })
  const errs = data?.refundCreate?.userErrors || []
  if (errs.length) throw new Error(`Shopify refused the refund: ${errs.map(e => e.message).join('; ')}`)

  const rows = await prisma.order.findMany({ where: { source: 'shopify', parentOrderNumber: o.id }, select: { id: true } })
  if (rows.length) await prisma.orderComment.createMany({ data: rows.map(r => ({ orderId: r.id, text: `Refunded ${money(amount)} by support: ${why}`, authorId: actor?.id || null, authorName: actorName(actor) })) })
  await event(thread.id, `${actorName(actor)} refunded ${money(amount)} on #${o.name}: ${why}`, actor)
  return { number: o.name, cents: amount, display: money(amount), leftCents: o.availableCents - amount }
}

/**
 * Cancel and refund in full (scenario 14: wrong frame, changed their mind
 * before production). Only with the customer's yes, only while nothing has
 * been produced or shipped. Our rows leave the queue with a note; Artelo
 * has no API to cancel, so the thread says it still needs cancelling there.
 */
export async function cancelOrder({ thread, shopifyOrderId, reason, customerConfirmed, actor }) {
  if (!customerConfirmed) throw new Error('Only after the customer says yes to cancelling. Ask them first.')
  const why = String(reason || '').trim() || 'Customer asked to cancel'
  const o = await refundable(shopifyOrderId)
  if (o.cancelled) throw new Error(`#${o.name} is already cancelled in Shopify.`)
  if (o.fulfillment === 'FULFILLED' || o.fulfillment === 'PARTIALLY_FULFILLED') throw new Error(`#${o.name} has shipped. It cannot be cancelled; a refund is Matt's call.`)

  const rows = await prisma.order.findMany({ where: { source: 'shopify', parentOrderNumber: o.id }, select: { id: true, status: true, designStatus: true, trackingNumber: true, arteloOrderData: true } })
  const produced = rows.find(r => r.status === 'completed' || r.designStatus === 'sent_to_production' || r.trackingNumber)
  if (produced) throw new Error(`#${o.name} has gone to production. Too late to cancel; see the playbook's "too late" reply.`)
  guardLimit(o.availableCents, actor)

  // One call: cancel, and refund what was paid. No Shopify email; the reply says it.
  await shopifyFetch(`/orders/${o.id}/cancel.json`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'customer', email: false, restock: false, ...(o.availableCents > 0 ? { amount: toAmount(o.availableCents), currency: o.currency } : {}) }),
  })

  const note = `Cancelled and refunded ${money(o.availableCents)} by support: ${why}. Cancel it in Artelo too.`
  if (rows.length) {
    await prisma.order.updateMany({ where: { id: { in: rows.map(r => r.id) } }, data: { status: 'completed' } })
    await prisma.orderComment.createMany({ data: rows.map(r => ({ orderId: r.id, text: note, authorId: actor?.id || null, authorName: actorName(actor) })) })
  }
  await event(thread.id, `${actorName(actor)} cancelled #${o.name} and refunded ${money(o.availableCents)}: ${why}. Artelo still needs cancelling.`, actor)
  return { number: o.name, cents: o.availableCents, display: money(o.availableCents), arteloUrl: arteloOrderUrl(rows[0]?.arteloOrderData?.id) || null }
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
