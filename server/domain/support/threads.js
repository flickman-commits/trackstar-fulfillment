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
import { approvalUrl, shopifyAdminUrl } from '../../lib/links.js'
import { stripQuoted } from './mailbox.js'
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

export async function team() {
  return prisma.user.findMany({ where: { isActive: true }, orderBy: { firstName: 'asc' }, select: TEAM_SELECT })
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
        shippingAddress { name address1 address2 city provinceCode zip countryCodeV2 }
        fulfillments { status createdAt trackingInfo { url number company } }
        lineItems(first: 20) { nodes { title variantTitle quantity customAttributes { key value } } }
      }
    }
  }
`

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
 * each order with our rows for its line items beside it, then any of our
 * rows Shopify did not return (Etsy, or an email that differs). Shopify
 * being down costs the live half, never the page.
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
