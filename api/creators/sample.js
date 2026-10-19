/**
 * POST /api/creators/sample - admin only. Send an existing creator another
 * sample print (a second race, a reshoot, a replacement).
 *
 *   { creatorId, raceName, raceYear, productTitle?, bibNumber?, finishTime?, productSize?, frameType? }
 *
 * Creates another creator_sample order in the Standard queue, numbered
 * CREATOR-XXXXXX-2, -3..., shipped to the creator's address on file. The
 * creator's sample link moves to the newest one (tracking and status follow
 * it); earlier samples stay in the queue and history as they were. Audited.
 */
import { setCors, requireAdmin } from '../_lib/auth.js'
import { requireAdminRole, recordAudit } from '../_lib/users.js'
import prisma from '../_lib/prisma.js'
import { defaultAssigneeFor } from '../../server/domain/orders/assignment.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'POST, OPTIONS' })) return
  const actor = requireAdmin(req, res)
  if (!actor) return
  const admin = await requireAdminRole(req, res, actor)
  if (!admin) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const creator = await prisma.creator.findUnique({ where: { id: String(b.creatorId || '') } })
    if (!creator) return res.status(404).json({ error: 'Creator not found' })
    const raceName = String(b.raceName || '').trim()
    const raceYear = Number(b.raceYear)
    if (!raceName || !Number.isFinite(raceYear)) return res.status(400).json({ error: 'Race and year are required' })

    const base = `CREATOR-${creator.id.slice(-6).toUpperCase()}`
    const existing = await prisma.order.count({ where: { orderNumber: { startsWith: base } } })
    let orderNumber = existing ? `${base}-${existing + 1}` : base
    while (await prisma.order.findUnique({ where: { orderNumber }, select: { id: true } })) {
      orderNumber = `${base}-${Number(orderNumber.split('-').pop()) + 1 || 2}`
    }

    const order = await prisma.order.create({
      data: {
        orderNumber,
        parentOrderNumber: orderNumber,
        lineItemIndex: 0,
        source: 'creator_sample',
        trackstarOrderType: 'standard',
        assigneeId: await defaultAssigneeFor('standard'),
        status: 'pending',
        raceName,
        raceYear,
        runnerName: creator.name || 'Creator',
        productSize: String(b.productSize || creator.productSize || '-'),
        frameType: String(b.frameType || creator.frameType || '-'),
        arteloOrderData: {
          creatorSample: true,
          creatorId: creator.id,
          bibNumber: b.bibNumber ? String(b.bibNumber) : null,
          finishTime: b.finishTime ? String(b.finishTime) : null,
          shipping: {
            name: creator.shippingName || creator.name || null,
            address1: creator.shippingAddress1 || null,
            address2: creator.shippingAddress2 || null,
            city: creator.shippingCity || null,
            state: creator.shippingState || null,
            zip: creator.shippingZip || null,
            country: creator.shippingCountry || 'US',
          },
          instagramHandle: creator.instagramHandle || null,
          additionalSample: true,
        },
        // The product title picks the design edition (World Majors) at render time.
        ...(b.productTitle ? { shopifyOrderData: { line_items: [{ title: String(b.productTitle), name: String(b.productTitle) }] } } : {}),
        customerName: creator.name || null,
        customerEmail: creator.email || null,
      },
    })
    await prisma.creator.update({ where: { id: creator.id }, data: { sampleOrderId: order.id, status: creator.status === 'denied' ? creator.status : 'active' } })
    await recordAudit({
      action: 'creator.sample-added',
      summary: `New sample ${order.orderNumber} for ${creator.name || 'a creator'}: ${raceName} ${raceYear}`,
      detail: { creatorId: creator.id, orderId: order.id },
      actor: admin,
    })
    return res.status(200).json({ ok: true, orderNumber: order.orderNumber })
  } catch (error) {
    console.error('[API /creators/sample]', error)
    // Admin-only endpoint: say what went wrong rather than a blank failure.
    return res.status(500).json({ error: `Could not create the sample: ${String(error.message || error).split('\n').filter(Boolean).pop().slice(0, 300)}` })
  }
}
