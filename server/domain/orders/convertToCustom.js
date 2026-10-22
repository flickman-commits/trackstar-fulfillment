/**
 * Turn a standard print into a custom one, for the case the shop does not
 * cover: the customer bought a race print but their runner ran a race we have
 * no design for, and we would rather design it than refund it (#5407: a
 * Eugene Marathon print for a runner who ran the Foot Traffic Flat).
 *
 * Shopify is not touched: price, line item and payment stay as they are.
 * Only our row changes, so the print leaves the standard queue and goes
 * through the custom flow (designer, proofs, approval):
 *   - the race and year go in the overrides, which an import never rewrites
 *     (the base fields are re-read from Shopify on every import);
 *   - the bib, time and what the customer asked for go in the custom fields;
 *   - due date and designer match the order's other custom prints when it
 *     has any, so the customer's prints are designed together; otherwise the
 *     usual 14 days and the custom queue's assignee;
 *   - an open automated design is closed, and a comment records what it was.
 * An import never turns a custom row back into a standard one.
 */
import prisma from '../../db.js'
import { assigneeForNewOrder } from './assignment.js'

export class ConvertError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; this.expose = true }
}

const CUSTOM_DUE_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

function personName(actor) {
  return actor?.firstName || actor?.name || actor?.email || 'Someone'
}

export async function convertToCustom({ orderId, raceName, raceYear, bib, time, creativeDirection, reason, actor }) {
  const o = await prisma.order.findUnique({ where: { id: String(orderId || '') } })
  if (!o) throw new ConvertError('Order not found', 404)
  if (o.trackstarOrderType !== 'standard') throw new ConvertError('Only a standard print can be converted to a custom order')
  if (o.status === 'completed') throw new ConvertError('This print is already complete; reopen it first')
  const race = String(raceName || '').trim()
  if (!race) throw new ConvertError('Say which race the print is for')
  const year = raceYear ? Number(raceYear) : null
  if (raceYear && (!Number.isInteger(year) || year < 1970 || year > 2100)) throw new ConvertError('The year does not look right')
  const why = String(reason || '').trim()
  if (!why) throw new ConvertError('Say why, for the record (e.g. ran a race we do not carry)')

  // The order's other custom prints set the due date and the designer.
  const siblings = await prisma.order.findMany({
    where: { parentOrderNumber: o.parentOrderNumber, source: o.source, trackstarOrderType: 'custom', id: { not: o.id } },
    select: { dueDate: true, assigneeId: true },
    orderBy: { lineItemIndex: 'asc' },
  })
  const dueDate = siblings.map(s => s.dueDate).filter(Boolean).sort((a, b) => a - b)[0]
    || new Date(Date.now() + CUSTOM_DUE_DAYS * DAY_MS)
  const assigneeId = siblings.find(s => s.assigneeId)?.assigneeId || await assigneeForNewOrder('custom', race)

  const before = `${o.raceNameOverride ?? o.raceName ?? 'unknown race'}${(o.yearOverride ?? o.raceYear) ? ` ${o.yearOverride ?? o.raceYear}` : ''}`
  const after = `${race}${year ? ` ${year}` : ''}`
  const by = personName(actor)

  const [updated] = await prisma.$transaction([
    prisma.order.update({
      where: { id: o.id },
      data: {
        trackstarOrderType: 'custom',
        designStatus: 'not_started',
        status: 'pending',
        raceNameOverride: race,
        ...(year ? { yearOverride: year } : {}),
        bibNumberCustomer: String(bib || '').trim() || o.customerBib || null,
        timeCustomer: String(time || '').trim() || o.customerFinishTime || null,
        creativeDirection: String(creativeDirection || '').trim() || null,
        dueDate,
        assigneeId,
      },
    }),
    // An automated design for the old race is not what gets printed now.
    prisma.renderJob.updateMany({
      where: { orderId: o.id, review: 'pending' },
      data: { review: 'closed', reviewNote: 'Converted to a custom order', reviewedAt: new Date() },
    }),
    prisma.orderComment.create({
      data: {
        orderId: o.id,
        text: `Converted from a standard ${before} print to a custom ${after} print by ${by}: ${why}. Shopify unchanged.`,
        authorId: actor?.id || null,
        authorName: by,
      },
    }),
  ])
  return { order: updated, before, after, dueDate, assigneeId, matchedSiblings: siblings.length > 0 }
}
