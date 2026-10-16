/**
 * The inbox as the page reads it: the queue, one thread, and what we know
 * about the person writing in. Nothing here talks to Gmail; the mirror does
 * (mailbox.js). The order context comes from our own orders table and, for
 * what it cannot know, from Shopify: fulfillment, tracking, what was paid.
 */
import prisma from '../../db.js'
import { shopifyGraphQL } from '../../services/shopifyAuth.js'
import { approvalUrl, shopifyAdminUrl } from '../../lib/links.js'
import { stripQuoted } from './mailbox.js'

export const STATUSES = ['open', 'waiting', 'escalated', 'closed']
export const VIEWS = ['open', 'mine', 'waiting', 'escalated', 'closed', 'all']

const TEAM_SELECT = { id: true, firstName: true, lastName: true }

function viewWhere(view, userId) {
  const now = new Date()
  switch (view) {
    case 'open': return { status: 'open', OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] }
    case 'mine': return { assigneeId: userId, status: { not: 'closed' } }
    case 'waiting': return { status: 'waiting' }
    case 'escalated': return { status: 'escalated' }
    case 'closed': return { status: 'closed' }
    default: return {}
  }
}

function searchWhere(q) {
  const s = String(q || '').trim()
  if (!s) return {}
  return {
    OR: [
      { subject: { contains: s, mode: 'insensitive' } },
      { customerEmail: { contains: s, mode: 'insensitive' } },
      { customerName: { contains: s, mode: 'insensitive' } },
      { snippet: { contains: s, mode: 'insensitive' } },
    ],
  }
}

/**
 * The queue. Open threads come oldest-unanswered first, because same-day
 * reply is the first habit; every other view is newest first.
 */
export async function listThreads({ view = 'open', userId, q = '', limit = 150 } = {}) {
  const v = VIEWS.includes(view) ? view : 'open'
  const where = { AND: [viewWhere(v, userId), searchWhere(q)] }
  const [threads, open, mine, waiting, escalated, snoozed] = await Promise.all([
    prisma.supportThread.findMany({
      where,
      orderBy: v === 'open' ? [{ lastInboundAt: 'asc' }, { lastMessageAt: 'asc' }] : [{ lastMessageAt: 'desc' }],
      take: limit,
      include: { assignee: { select: TEAM_SELECT } },
    }),
    prisma.supportThread.count({ where: viewWhere('open') }),
    prisma.supportThread.count({ where: viewWhere('mine', userId) }),
    prisma.supportThread.count({ where: viewWhere('waiting') }),
    prisma.supportThread.count({ where: viewWhere('escalated') }),
    prisma.supportThread.count({ where: { status: 'open', snoozedUntil: { gt: new Date() } } }),
  ])
  return {
    threads: threads.map(row),
    counts: { open, mine, waiting, escalated, snoozed },
  }
}

function row(t) {
  return {
    id: t.id,
    subject: t.subject,
    customerEmail: t.customerEmail,
    customerName: t.customerName,
    status: t.status,
    snoozedUntil: t.snoozedUntil,
    assignee: t.assignee || null,
    snippet: t.snippet,
    messageCount: t.messageCount,
    lastMessageAt: t.lastMessageAt,
    lastInboundAt: t.lastInboundAt,
    lastOutboundAt: t.lastOutboundAt,
    backfilled: t.backfilled,
  }
}

export async function team() {
  return prisma.user.findMany({ where: { isActive: true }, orderBy: { firstName: 'asc' }, select: TEAM_SELECT })
}

/** One thread with its messages, and the customer's orders and past threads beside it. */
export async function getThread(id) {
  const t = await prisma.supportThread.findUnique({
    where: { id },
    include: {
      assignee: { select: TEAM_SELECT },
      messages: { orderBy: { sentAt: 'asc' }, include: { sentBy: { select: TEAM_SELECT } } },
    },
  })
  if (!t) return null
  const [context, pastThreads] = await Promise.all([
    customerContext(t.customerEmail),
    t.customerEmail ? prisma.supportThread.findMany({
      where: { customerEmail: t.customerEmail, id: { not: t.id } },
      orderBy: { lastMessageAt: 'desc' }, take: 6,
      select: { id: true, subject: true, status: true, lastMessageAt: true, messageCount: true },
    }) : [],
  ])
  return {
    ...row(t),
    gmailThreadId: t.gmailThreadId,
    messages: t.messages.map(m => {
      const text = stripQuoted(m.bodyText)
      return {
        id: m.id,
        gmailMessageId: m.gmailMessageId,
        direction: m.direction,
        fromEmail: m.fromEmail,
        fromName: m.fromName,
        toEmails: m.toEmails,
        ccEmails: m.ccEmails,
        subject: m.subject,
        text,
        quoted: m.bodyText.length > text.length ? m.bodyText.slice(text.length).trim() : '',
        attachments: Array.isArray(m.attachments) ? m.attachments : [],
        sentAt: m.sentAt,
        sentBy: m.sentBy || null,
      }
    }),
    context,
    pastThreads,
  }
}

// ---------------------------------------------------------------------------
// Changing a thread
// ---------------------------------------------------------------------------

export async function setStatus(id, status) {
  if (!STATUSES.includes(status)) throw new Error(`Unknown status: ${status}`)
  return prisma.supportThread.update({ where: { id }, data: { status, snoozedUntil: null }, include: { assignee: { select: TEAM_SELECT } } }).then(row)
}

export async function assign(id, assigneeId) {
  if (assigneeId) {
    const u = await prisma.user.findUnique({ where: { id: assigneeId }, select: { isActive: true } })
    if (!u?.isActive) throw new Error('That teammate is not active')
  }
  return prisma.supportThread.update({ where: { id }, data: { assigneeId: assigneeId || null }, include: { assignee: { select: TEAM_SELECT } } }).then(row)
}

/** Hide an open thread until a time; it comes back on its own, or sooner if the customer writes. */
export async function snooze(id, until) {
  const d = until ? new Date(until) : null
  if (d && Number.isNaN(d.getTime())) throw new Error('Bad snooze time')
  return prisma.supportThread.update({ where: { id }, data: { snoozedUntil: d, status: 'open' }, include: { assignee: { select: TEAM_SELECT } } }).then(row)
}

// ---------------------------------------------------------------------------
// Who is writing in
// ---------------------------------------------------------------------------

const ORDERS_BY_EMAIL = `
  query($q: String!) {
    orders(first: 10, query: $q, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id legacyResourceId name createdAt
        displayFinancialStatus displayFulfillmentStatus
        totalPriceSet { shopMoney { amount currencyCode } }
        discountCodes
        shippingAddress { name address1 address2 city provinceCode zip countryCodeV2 }
        fulfillments { status createdAt trackingInfo { url number company } }
        lineItems(first: 20) { nodes { title variantTitle quantity customAttributes { key value } } }
      }
    }
  }
`

/** What a line item was personalised with, from its properties. */
function lineProps(li) {
  const out = {}
  for (const a of li.customAttributes || []) {
    if (!a.key || a.key.startsWith('_')) continue
    out[a.key] = a.value
  }
  return out
}

function shipToLine(a) {
  if (!a) return ''
  return [a.name, a.address1, a.address2, [a.city, a.provinceCode, a.zip].filter(Boolean).join(' '), a.countryCodeV2].filter(Boolean).join(', ')
}

/** Our row for a line item, as the pane shows it. */
function itemRow(o) {
  return {
    orderId: o.id,
    orderNumber: o.orderNumber,
    item: o.lineItemIndex + 1,
    type: o.trackstarOrderType,
    status: o.status,
    designStatus: ['custom', 'race_partner'].includes(o.trackstarOrderType) ? o.designStatus : null,
    runner: o.runnerNameOverride || o.runnerName,
    race: o.raceNameOverride || o.raceName,
    year: o.yearOverride || o.raceYear,
    size: o.productSize,
    frame: o.frameType,
    isRush: o.isRushOrder || o.rushOverride,
    dueDate: o.dueDate,
    proofSentAt: o.proofSentAt,
    approvalUrl: approvalUrl(o.approvalToken?.token),
    assignee: o.assignee || null,
    lookupVerified: o.lookupVerified,
    customerBib: o.customerBib,
    customerFinishTime: o.customerFinishTime,
    tracking: o.trackingNumber ? { number: o.trackingNumber, carrier: o.trackingCarrier } : null,
    hasPhoto: Boolean(o.photoPath),
  }
}

/**
 * Everything about this customer's orders, in one shape: Shopify's view of
 * each order (paid, fulfilled, tracking, what they typed at checkout) with
 * our rows for its line items beside it, then any of our rows Shopify did
 * not return (Etsy, or an email that differs). Shopify being down costs the
 * live half, never the page.
 */
export async function customerContext(email) {
  const e = String(email || '').trim().toLowerCase()
  if (!e) return { orders: [], shopifyError: null }

  const ours = await prisma.order.findMany({
    where: { customerEmail: { equals: e, mode: 'insensitive' } },
    orderBy: [{ createdAt: 'desc' }, { lineItemIndex: 'asc' }],
    take: 60,
    include: { approvalToken: { select: { token: true } }, assignee: { select: TEAM_SELECT } },
  })
  const byNumber = new Map()
  for (const o of ours) {
    const key = String(o.parentOrderNumber)
    if (!byNumber.has(key)) byNumber.set(key, [])
    byNumber.get(key).push(o)
  }

  let shopify = []
  let shopifyError = null
  if (process.env.SHOPIFY_STORE) {
    try {
      const data = await shopifyGraphQL(ORDERS_BY_EMAIL, { q: `email:${e}` })
      shopify = data?.orders?.nodes || []
    } catch (err) {
      shopifyError = err.message.slice(0, 200)
      console.warn(`[support] Shopify orders for ${e}: ${err.message}`)
    }
  }

  const orders = []
  const seen = new Set()
  for (const s of shopify) {
    const number = String(s.name || '').replace(/^#/, '')
    seen.add(number)
    const rows = byNumber.get(number) || []
    orders.push({
      number,
      source: 'shopify',
      shopifyOrderId: s.legacyResourceId,
      adminUrl: shopifyAdminUrl(s.legacyResourceId),
      createdAt: s.createdAt,
      financialStatus: s.displayFinancialStatus,
      fulfillmentStatus: s.displayFulfillmentStatus,
      total: s.totalPriceSet?.shopMoney?.amount || null,
      currency: s.totalPriceSet?.shopMoney?.currencyCode || null,
      discountCodes: s.discountCodes || [],
      shipTo: shipToLine(s.shippingAddress),
      tracking: (s.fulfillments || []).flatMap(f => (f.trackingInfo || []).map(t => ({ url: t.url, number: t.number, company: t.company, status: f.status, at: f.createdAt }))),
      lineItems: (s.lineItems?.nodes || []).map(li => ({ title: li.title, variant: li.variantTitle, quantity: li.quantity, properties: lineProps(li) })),
      items: rows.map(itemRow),
      imported: rows.length > 0,
    })
  }
  for (const [number, rows] of byNumber) {
    if (seen.has(number)) continue
    const first = rows[0]
    orders.push({
      number,
      source: first.source,
      shopifyOrderId: first.source === 'shopify' ? first.shopifyOrderData?.id || null : null,
      adminUrl: first.source === 'shopify' ? shopifyAdminUrl(first.shopifyOrderData?.id) : null,
      createdAt: first.createdAt,
      financialStatus: null,
      fulfillmentStatus: null,
      total: null,
      currency: null,
      discountCodes: [],
      shipTo: first.shippingAddress ? shipToLine({ ...first.shippingAddress, provinceCode: first.shippingAddress.state, countryCodeV2: first.shippingAddress.country }) : '',
      tracking: first.trackingNumber ? [{ url: null, number: first.trackingNumber, company: first.trackingCarrier, status: null, at: first.shippedAt }] : [],
      lineItems: [],
      items: rows.map(itemRow),
      imported: true,
    })
  }
  orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  return { orders, shopifyError }
}
