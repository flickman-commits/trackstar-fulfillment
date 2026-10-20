/**
 * "Email customer" from TrackstarOS: one email from fast@ about one
 * order, usually asking for what we cannot find (a bib number, a last name,
 * a finish time). It goes out through the support mailbox, so it is a
 * Support conversation from the start: assigned to whoever sent it, waiting
 * on the customer, with the order linked. The order gets a comment saying
 * it was sent, so the fulfillment side sees it too.
 */
import prisma from '../../db.js'
import { sendNew } from './mailbox.js'
import { replyToHtml } from './format.js'
import { UserError } from './errors.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * The number the customer knows: Shopify's order name ("4985"). Our row's
 * orderNumber is Shopify's internal id plus the line, which means nothing to
 * them. Same rule as the order list (api/orders/index.js).
 */
export function customerOrderNumber(order) {
  const name = order?.shopifyOrderData?.name
  return String(name || order?.parentOrderNumber || order?.orderNumber || '').replace(/^#/, '')
}

export function defaultSubject(number) {
  return `Trackstar Order ${number} (Action Required)`
}

function actorName(actor) {
  return [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') || 'Someone'
}

export async function emailCustomer({ orderId, subject, text, actor }) {
  const order = await prisma.order.findUnique({ where: { id: String(orderId || '') }, select: { id: true, orderNumber: true, parentOrderNumber: true, shopifyOrderData: true, customerEmail: true, customerName: true } })
  if (!order) throw new UserError('No such order')
  const to = String(order.customerEmail || '').trim().toLowerCase()
  if (!EMAIL.test(to)) throw new UserError('This order has no customer email to write to')
  const body = String(text || '').replace(/\r\n/g, '\n').trim()
  if (!body) throw new UserError('Write the email first')
  if (/\[[^\]\n]*what we need[^\]\n]*\]/i.test(body)) throw new UserError('Fill in what we need from them first')
  const number = customerOrderNumber(order)
  // A page loaded before the fix filled in our internal id; the customer only knows the display number.
  let subj = String(subject || '').trim().slice(0, 200) || defaultSubject(number)
  for (const internal of [order.parentOrderNumber, order.orderNumber].filter(v => v && String(v) !== number)) {
    subj = subj.split(`#${internal}`).join(number).split(String(internal)).join(number)
  }

  const stored = await sendNew({ userId: actor?.id || null, to, subject: subj, html: replyToHtml(body), text: body })
  const by = actorName(actor)
  await prisma.$transaction([
    prisma.supportThread.update({
      where: { id: stored.threadId },
      data: { assigneeId: actor?.id || undefined, ...(order.customerName ? { customerName: order.customerName } : {}) },
    }),
    prisma.supportNote.create({ data: { threadId: stored.threadId, kind: 'event', body: `${by} emailed from Fulfillment about #${number}`, authorId: actor?.id || null, authorName: by } }),
    prisma.orderComment.create({ data: { orderId: order.id, text: `Emailed the customer from Support: "${subj}"`, authorId: actor?.id || null, authorName: by } }),
  ])
  return { threadId: stored.threadId, to, subject: subj }
}

/**
 * The Support conversations still going with an order's customer (anything
 * not closed), for the order view in TrackstarOS. Matched on the
 * order's email; filtered and merged-away threads never show.
 */
export async function conversationsForOrder(orderId) {
  const order = await prisma.order.findUnique({ where: { id: String(orderId || '') }, select: { customerEmail: true } })
  const email = String(order?.customerEmail || '').trim()
  if (!email) return []
  const rows = await prisma.supportThread.findMany({
    where: { customerEmail: { equals: email, mode: 'insensitive' }, mergedIntoId: null, filtered: false, status: { not: 'closed' } },
    orderBy: { lastMessageAt: 'desc' },
    take: 5,
    select: { id: true, subject: true, status: true, snippet: true, lastMessageAt: true, snoozedUntil: true, channel: true, assignee: { select: { firstName: true } } },
  })
  return rows.map(t => ({
    id: t.id, subject: t.subject || '(no subject)', status: t.status, snippet: t.snippet || '', lastMessageAt: t.lastMessageAt,
    snoozed: Boolean(t.snoozedUntil && t.snoozedUntil > new Date()), channel: t.channel, assignee: t.assignee?.firstName || null,
  }))
}
