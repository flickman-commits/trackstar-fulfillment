/**
 * "Email customer" from the fulfillment tool: one email from fast@ about one
 * order, usually asking for what we cannot find (a bib number, a last name,
 * a finish time). It goes out through the support mailbox, so it is a
 * Support conversation from the start: assigned to whoever sent it, waiting
 * on the customer, with the order linked. The order gets a comment saying
 * it was sent, so the fulfillment side sees it too.
 */
import prisma from '../../db.js'
import { sendNew } from './mailbox.js'
import { replyToHtml } from './format.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** "4985" from "4985" or "4985-2". */
export function shopOrderNumber(orderNumber) {
  return String(orderNumber || '').split('-')[0].replace(/^#/, '')
}

export function defaultSubject(orderNumber) {
  return `Trackstar order #${shopOrderNumber(orderNumber)} (action required)`
}

function actorName(actor) {
  return [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') || 'Someone'
}

export async function emailCustomer({ orderId, subject, text, actor }) {
  const order = await prisma.order.findUnique({ where: { id: String(orderId || '') }, select: { id: true, orderNumber: true, customerEmail: true, customerName: true } })
  if (!order) throw new Error('No such order')
  const to = String(order.customerEmail || '').trim().toLowerCase()
  if (!EMAIL.test(to)) throw new Error('This order has no customer email to write to')
  const body = String(text || '').replace(/\r\n/g, '\n').trim()
  if (!body) throw new Error('Write the email first')
  if (/\[[^\]\n]*what we need[^\]\n]*\]/i.test(body)) throw new Error('Fill in what we need from them first')
  const subj = String(subject || '').trim().slice(0, 200) || defaultSubject(order.orderNumber)

  const stored = await sendNew({ userId: actor?.id || null, to, subject: subj, html: replyToHtml(body), text: body })
  const number = shopOrderNumber(order.orderNumber)
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
