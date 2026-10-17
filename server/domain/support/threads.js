/**
 * The inbox as the page reads it: the views, one conversation, and what we
 * know about the person writing in. Nothing here talks to Gmail; the mirror
 * does (mailbox.js). The order context comes from our own orders table and,
 * for what it cannot know, from Shopify: fulfillment, tracking, what was paid.
 *
 * The views are Intercom's: Your inbox (assigned to you), Mentions (a note
 * named you), Unassigned, All open, then Waiting, Escalated, Snoozed and
 * Closed, and one per teammate. Unread is per person: bold until you have
 * opened the thread since the customer last wrote.
 */
import prisma from '../../db.js'
import { shopifyGraphQL } from '../../services/shopifyAuth.js'
import { approvalUrl, shopifyAdminUrl, arteloOrderUrl } from '../../lib/links.js'
import { getProductInfo, loadProductCatalog } from '../../lib/productCatalog.js'
import { stripQuoted } from './mailbox.js'
import { can } from '../../../api/_lib/roles.js'
import { replyWindow } from './instagram.js'

export const STATUSES = ['open', 'waiting', 'escalated', 'closed']
export const SORTS = ['waiting', 'newest', 'oldest', 'priority']

/** The playbook's scenarios, offered when tagging. Free text is fine too. */
export const TAG_SUGGESTIONS = [
  'Where is my order', 'Damaged print', 'Broken frame', 'Wrong personalization', 'Race not available',
  'Refund', 'Product question', 'Custom print', 'Race organizer', 'Pre-race order', 'Order change',
  'Pre-race motivation', 'Happy customer', 'Missing detail', 'Wrong frame', 'Discount not applied',
  'Note from owner', 'Cart trouble', 'Add-on', 'Address change', 'We messed up', 'Results changed',
  'Preview request', 'Unsure of results', 'Press', 'Spam',
]

const TEAM_SELECT = { id: true, firstName: true, lastName: true }
const notSnoozed = () => ({ OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: new Date() } }] })
const OPENISH = { status: { in: ['open', 'waiting', 'escalated'] } }

/** The where clause for a view. `teammate:<id>` is that person's open work. */
export function viewWhere(view, userId) {
  if (view.startsWith('teammate:')) return { assigneeId: view.slice('teammate:'.length), ...OPENISH }
  switch (view) {
    case 'inbox': return { assigneeId: userId, ...OPENISH }
    case 'mentions': return { ...OPENISH, notes: { some: { kind: 'note', mentions: { has: userId } } } }
    case 'unassigned': return { assigneeId: null, status: 'open', ...notSnoozed() }
    case 'all': return { status: 'open', ...notSnoozed() }
    case 'waiting': return { status: 'waiting' }
    case 'escalated': return { status: 'escalated' }
    case 'snoozed': return { status: 'open', snoozedUntil: { gt: new Date() } }
    case 'closed': return { status: 'closed' }
    default: return { status: 'open', ...notSnoozed() }
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
      { igUsername: { contains: s.replace(/^@/, ''), mode: 'insensitive' } },
      { tags: { has: s } },
    ],
  }
}

function orderBy(sort) {
  switch (sort) {
    case 'newest': return [{ lastMessageAt: 'desc' }]
    case 'oldest': return [{ lastMessageAt: 'asc' }]
    case 'priority': return [{ priority: 'desc' }, { lastInboundAt: 'asc' }, { lastMessageAt: 'asc' }]
    default: return [{ lastInboundAt: 'asc' }, { lastMessageAt: 'asc' }] // waiting longest first
  }
}

export async function listThreads({ view = 'all', userId, q = '', sort = 'waiting', limit = 150 } = {}) {
  const where = { AND: [viewWhere(view, userId), searchWhere(q)] }
  const [threads, inbox, mentions, unassigned, all, waiting, escalated, snoozed, perAssignee] = await Promise.all([
    prisma.supportThread.findMany({ where, orderBy: orderBy(SORTS.includes(sort) ? sort : 'waiting'), take: limit, include: { assignee: { select: TEAM_SELECT } } }),
    prisma.supportThread.count({ where: viewWhere('inbox', userId) }),
    prisma.supportThread.count({ where: viewWhere('mentions', userId) }),
    prisma.supportThread.count({ where: viewWhere('unassigned') }),
    prisma.supportThread.count({ where: viewWhere('all') }),
    prisma.supportThread.count({ where: viewWhere('waiting') }),
    prisma.supportThread.count({ where: viewWhere('escalated') }),
    prisma.supportThread.count({ where: viewWhere('snoozed') }),
    prisma.supportThread.groupBy({ by: ['assigneeId'], where: OPENISH, _count: { _all: true } }),
  ])
  const reads = userId && threads.length
    ? await prisma.supportRead.findMany({ where: { userId, threadId: { in: threads.map(t => t.id) } } })
    : []
  const readAt = new Map(reads.map(r => [r.threadId, r.readAt]))
  const byAssignee = {}
  for (const g of perAssignee) if (g.assigneeId) byAssignee[g.assigneeId] = g._count._all
  return {
    threads: threads.map(t => row(t, readAt.get(t.id))),
    counts: { inbox, mentions, unassigned, all, waiting, escalated, snoozed, byAssignee },
  }
}

function row(t, readAt) {
  return {
    id: t.id,
    channel: t.channel || 'email',
    igUsername: t.igUsername || '',
    subject: t.subject,
    customerEmail: t.customerEmail,
    customerName: t.customerName,
    status: t.status,
    snoozedUntil: t.snoozedUntil,
    assignee: t.assignee || null,
    priority: t.priority,
    tags: t.tags || [],
    snippet: t.snippet,
    messageCount: t.messageCount,
    lastMessageAt: t.lastMessageAt,
    lastInboundAt: t.lastInboundAt,
    lastOutboundAt: t.lastOutboundAt,
    backfilled: t.backfilled,
    unread: Boolean(t.lastInboundAt) && (!readAt || new Date(t.lastInboundAt) > new Date(readAt)),
  }
}

/** Who can work the inbox: active people whose role includes Support (admins always). */
export async function team() {
  const users = await prisma.user.findMany({ where: { isActive: true }, orderBy: { firstName: 'asc' }, select: { ...TEAM_SELECT, role: true } })
  const out = []
  for (const u of users) if (await can(u.role, 'support')) out.push({ id: u.id, firstName: u.firstName, lastName: u.lastName })
  return out
}

/** One thread: messages, notes and events, the customer's orders and other threads. */
export async function getThread(id, { userId } = {}) {
  const t = await prisma.supportThread.findUnique({
    where: { id },
    include: {
      assignee: { select: TEAM_SELECT },
      messages: { orderBy: { sentAt: 'asc' }, include: { sentBy: { select: TEAM_SELECT } } },
      notes: { orderBy: { createdAt: 'asc' }, include: { author: { select: TEAM_SELECT } } },
      reads: userId ? { where: { userId } } : false,
    },
  })
  if (!t) return null
  const [context, pastThreads, customerSince, customerCount] = await Promise.all([
    customerContext(t.customerEmail),
    t.customerEmail ? prisma.supportThread.findMany({
      where: { customerEmail: t.customerEmail, id: { not: t.id } },
      orderBy: { lastMessageAt: 'desc' }, take: 6,
      select: { id: true, subject: true, status: true, lastMessageAt: true, messageCount: true },
    }) : [],
    t.customerEmail ? prisma.supportThread.aggregate({ where: { customerEmail: t.customerEmail }, _min: { createdAt: true } }) : null,
    t.customerEmail ? prisma.supportThread.count({ where: { customerEmail: t.customerEmail } }) : 0,
  ])
  const readAt = userId ? t.reads?.[0]?.readAt : null
  const instagram = t.channel === 'instagram'
  return {
    ...row(t, readAt),
    gmailThreadId: t.gmailThreadId,
    createdAt: t.createdAt,
    // Meta's rule: a DM may be answered within 24 hours of the customer's last message. Null for email.
    replyWindow: instagram ? replyWindow(t) : null,
    messages: t.messages.map(m => {
      const text = instagram ? m.bodyText : stripQuoted(m.bodyText)
      return {
        id: m.id,
        channel: m.channel || 'email',
        gmailMessageId: m.gmailMessageId,
        igMessageId: m.igMessageId,
        direction: m.direction,
        fromEmail: m.fromEmail,
        // A DM stored before Meta told us who they are keeps saying "Instagram user"; show what we know now.
        fromName: instagram && m.direction === 'in' ? (t.customerName || (t.igUsername ? `@${t.igUsername}` : m.fromName)) : m.fromName,
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
    notes: t.notes.map(noteRow),
    customer: {
      email: t.customerEmail,
      name: t.customerName,
      instagram: t.igUsername || null,
      firstSeen: customerSince?._min?.createdAt || t.createdAt,
      // An Instagram customer has one conversation, this one, for as long as the thread lives.
      conversations: t.customerEmail ? customerCount : 1,
    },
    context,
    pastThreads,
  }
}

function noteRow(n) {
  return { id: n.id, kind: n.kind, body: n.body, author: n.author || null, authorName: n.authorName, mentions: n.mentions || [], createdAt: n.createdAt }
}

// ---------------------------------------------------------------------------
// Changing a thread. Each change leaves an event in the timeline.
// ---------------------------------------------------------------------------

function actorName(actor) {
  return [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') || 'Someone'
}

async function event(threadId, body, actor) {
  return prisma.supportNote.create({ data: { threadId, kind: 'event', body, authorId: actor?.id || null, authorName: actorName(actor) } })
}

const withAssignee = { include: { assignee: { select: TEAM_SELECT } } }

export async function setStatus(id, status, actor) {
  if (!STATUSES.includes(status)) throw new Error(`Unknown status: ${status}`)
  const before = await prisma.supportThread.findUnique({ where: { id }, select: { status: true } })
  const t = await prisma.supportThread.update({ where: { id }, data: { status, snoozedUntil: null }, ...withAssignee })
  if (before?.status !== status) {
    const verb = status === 'closed' ? 'closed this' : status === 'open' && before?.status === 'closed' ? 'reopened this'
      : status === 'escalated' ? 'escalated this' : status === 'waiting' ? 'marked this waiting on the customer' : 'reopened this'
    await event(id, `${actorName(actor)} ${verb}`, actor)
  }
  return row(t)
}

export async function assign(id, assigneeId, actor) {
  let who = null
  if (assigneeId) {
    who = await prisma.user.findUnique({ where: { id: assigneeId }, select: { ...TEAM_SELECT, isActive: true } })
    if (!who?.isActive) throw new Error('That teammate is not active')
  }
  const t = await prisma.supportThread.update({ where: { id }, data: { assigneeId: assigneeId || null }, ...withAssignee })
  const target = !who ? 'unassigned this' : who.id === actor?.id ? 'took this' : `assigned this to ${who.firstName}`
  await event(id, `${actorName(actor)} ${target}`, actor)
  return row(t)
}

export async function snooze(id, until, actor) {
  const d = until ? new Date(until) : null
  if (d && Number.isNaN(d.getTime())) throw new Error('Bad snooze time')
  const t = await prisma.supportThread.update({ where: { id }, data: { snoozedUntil: d, status: 'open' }, ...withAssignee })
  await event(id, d ? `${actorName(actor)} snoozed this until ${d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : `${actorName(actor)} unsnoozed this`, actor)
  return row(t)
}

export async function setPriority(id, priority, actor) {
  const t = await prisma.supportThread.update({ where: { id }, data: { priority: Boolean(priority) }, ...withAssignee })
  await event(id, `${actorName(actor)} ${priority ? 'marked this priority' : 'removed priority'}`, actor)
  return row(t)
}

export async function setTags(id, tags) {
  const clean = [...new Set((Array.isArray(tags) ? tags : []).map(s => String(s).trim()).filter(Boolean))].slice(0, 12)
  const t = await prisma.supportThread.update({ where: { id }, data: { tags: clean }, ...withAssignee })
  return row(t)
}

/** An internal note. Mentions are teammate ids the client resolved from @names; only active ones are kept. */
export async function addNote(id, { body, mentions = [] }, actor) {
  const text = String(body || '').trim()
  if (!text) throw new Error('Write something first')
  const ids = [...new Set(mentions.map(String))]
  const valid = ids.length ? await prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } }) : []
  const n = await prisma.supportNote.create({
    data: { threadId: id, kind: 'note', body: text, authorId: actor?.id || null, authorName: actorName(actor), mentions: valid.map(u => u.id) },
    include: { author: { select: TEAM_SELECT } },
  })
  return noteRow(n)
}

export async function deleteNote(noteId, actor) {
  const n = await prisma.supportNote.findUnique({ where: { id: noteId } })
  if (!n || n.kind !== 'note') throw new Error('No such note')
  if (n.authorId !== actor?.id && actor?.role !== 'admin') throw new Error('Only the author or an admin can delete a note')
  await prisma.supportNote.delete({ where: { id: noteId } })
  return { id: noteId }
}

/** This person has seen the thread as it stands now. */
export async function markRead(id, userId) {
  if (!userId) return
  await prisma.supportRead.upsert({ where: { threadId_userId: { threadId: id, userId } }, update: { readAt: new Date() }, create: { threadId: id, userId } })
}

export async function markUnread(id, userId) {
  if (!userId) return
  await prisma.supportRead.deleteMany({ where: { threadId: id, userId } })
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
        shippingAddress { name address1 address2 city provinceCode zip countryCodeV2 phone }
        fulfillments { status createdAt trackingInfo { url number company } }
        lineItems(first: 20) { nodes { title variantTitle quantity customAttributes { key value } } }
      }
    }
  }
`

function shipToLine(a) {
  if (!a) return ''
  return [a.name, a.address1, a.address2, [a.city, a.province, a.zip].filter(Boolean).join(' '), a.country].filter(Boolean).join(', ')
}

/** One address shape for Shopify, Artelo and our own column. */
function fromShopifyAddress(a) {
  if (!a) return null
  return { name: a.name || '', address1: a.address1 || '', address2: a.address2 || '', city: a.city || '', province: a.provinceCode || '', zip: a.zip || '', country: a.countryCodeV2 || '', phone: a.phone || '' }
}
function fromArteloAddress(a) {
  if (!a || !(a.street1 || a.city)) return null
  return { name: a.name || '', address1: a.street1 || '', address2: a.street2 || '', city: a.city || '', province: a.state || '', zip: a.zipcode || '', country: a.countryCode || '', phone: a.phone || '' }
}
function fromOurAddress(a) {
  if (!a || !(a.line1 || a.address1 || a.city)) return null
  return { name: a.name || '', address1: a.line1 || a.address1 || '', address2: a.line2 || a.address2 || '', city: a.city || '', province: a.state || a.province || '', zip: a.zip || '', country: a.country || '', phone: a.phone || '' }
}

/** Our row for a line item, as the panel shows it: what was ordered, where it is, and its picture. */
function itemRow(o, catalog) {
  const info = getProductInfo(o, catalog)
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
    approvalUrl: approvalUrl(o.approvalToken?.token),
    hasPhoto: Boolean(o.photoPath),
    heroImageUrl: info?.heroImageUrl || null,
    productLabel: info?.label || null,
  }
}

/**
 * Everything about this customer's orders, in one shape: Shopify's view of
 * each order with our rows for its line items beside it, then any of our
 * rows Shopify did not return (Etsy, or an email that differs). Shopify
 * being down costs the live half, never the page.
 */
export async function customerContext(email) {
  const e = String(email || '').trim().toLowerCase()
  if (!e) return { orders: [], shopifyError: null }

  const [ours, catalog] = await Promise.all([
    prisma.order.findMany({
      where: { customerEmail: { equals: e, mode: 'insensitive' } },
      orderBy: [{ createdAt: 'desc' }, { lineItemIndex: 'asc' }],
      take: 60,
      include: { approvalToken: { select: { token: true } } },
    }),
    loadProductCatalog().catch(() => null),
  ])
  // Our Shopify rows carry Shopify's numeric order id as parentOrderNumber
  // and the number a person reads (#4517) inside shopifyOrderData.name, so
  // a Shopify order is matched by its id first and its name second.
  const byKey = new Map()
  const keyOf = o => String(o.shopifyOrderData?.id || o.parentOrderNumber)
  const nameOf = o => String(o.shopifyOrderData?.name || o.parentOrderNumber).replace(/^#/, '')
  for (const o of ours) {
    const key = keyOf(o)
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(o)
  }
  const byName = new Map()
  for (const [, rows] of byKey) byName.set(nameOf(rows[0]), rows)

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

  const fromRows = rows => {
    const first = rows[0]
    return {
      arteloUrl: arteloOrderUrl(first?.arteloOrderData?.id) || null,
      arteloAddress: fromArteloAddress(first?.arteloOrderData?.customerAddress),
      items: rows.map(o => itemRow(o, catalog)),
    }
  }

  const orders = []
  const seen = new Set()
  for (const s of shopify) {
    const number = String(s.name || '').replace(/^#/, '')
    const rows = byKey.get(String(s.legacyResourceId)) || byName.get(number) || []
    if (rows.length) seen.add(keyOf(rows[0]))
    const shipTo = fromShopifyAddress(s.shippingAddress)
    orders.push({
      number,
      source: 'shopify',
      shopifyOrderId: s.legacyResourceId,
      adminUrl: shopifyAdminUrl(s.legacyResourceId),
      createdAt: s.createdAt,
      financialStatus: s.displayFinancialStatus,
      fulfillmentStatus: s.displayFulfillmentStatus,
      discountCodes: s.discountCodes || [],
      shipTo,
      shipToLine: shipToLine(shipTo),
      tracking: (s.fulfillments || []).flatMap(f => (f.trackingInfo || []).map(t => ({ url: t.url, number: t.number, company: t.company, at: f.createdAt }))),
      // When none of our rows exist yet (not imported), what was bought, from Shopify.
      lineItems: rows.length ? [] : (s.lineItems?.nodes || []).filter(li => !/add-?on/i.test(li.title)).map(li => ({ title: li.title, variant: li.variantTitle, quantity: li.quantity })),
      imported: rows.length > 0,
      ...fromRows(rows),
    })
  }
  for (const [key, rows] of byKey) {
    if (seen.has(key)) continue
    const first = rows[0]
    const shipTo = fromOurAddress(first.shippingAddress) || fromArteloAddress(first.arteloOrderData?.customerAddress)
    orders.push({
      number: nameOf(first),
      source: first.source,
      shopifyOrderId: first.source === 'shopify' ? String(first.shopifyOrderData?.id || '') || null : null,
      adminUrl: first.source === 'shopify' ? shopifyAdminUrl(first.shopifyOrderData?.id) : null,
      createdAt: first.shopifyOrderData?.created_at || first.createdAt,
      financialStatus: null,
      fulfillmentStatus: null,
      discountCodes: (first.shopifyOrderData?.discount_codes || []).map(d => d.code).filter(Boolean),
      shipTo,
      shipToLine: shipToLine(shipTo),
      tracking: first.trackingNumber ? [{ url: null, number: first.trackingNumber, company: first.trackingCarrier, at: first.shippedAt }] : [],
      lineItems: [],
      imported: true,
      ...fromRows(rows),
    })
  }
  orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  return { orders, shopifyError }
}
