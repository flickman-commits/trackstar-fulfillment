/**
 * POST /api/orders/cancel-creator-sample { orderId } - admin only.
 *
 * Cancel a creator's free sample print: remove its order from the queue and
 * put the creator back to pending, so the sample can be approved again later
 * or declined. Refused once the sample is completed (already uploaded to
 * Artelo); that one is shipping. Audited.
 */
import { setCors, requireAdmin } from '../_lib/auth.js'
import { requireAdminRole, recordAudit } from '../_lib/users.js'
import prisma from '../_lib/prisma.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'POST, OPTIONS' })) return
  const actor = requireAdmin(req, res)
  if (!actor) return
  const admin = await requireAdminRole(req, res, actor)
  if (!admin) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const order = await prisma.order.findUnique({
      where: { id: String(body.orderId || '') },
      select: { id: true, orderNumber: true, source: true, status: true, runnerName: true },
    })
    if (!order) return res.status(404).json({ error: 'Order not found' })
    if (order.source !== 'creator_sample') return res.status(400).json({ error: 'Only creator samples can be cancelled here' })
    if (order.status === 'completed') return res.status(409).json({ error: 'This sample was already uploaded to Artelo. Cancel it there instead.' })

    const creator = await prisma.creator.findUnique({ where: { sampleOrderId: order.id }, select: { id: true, name: true } })
    await prisma.$transaction([
      ...(creator ? [prisma.creator.update({ where: { id: creator.id }, data: { sampleOrderId: null, status: 'pending' } })] : []),
      prisma.runnerResearch.deleteMany({ where: { orderId: order.id } }),
      prisma.order.delete({ where: { id: order.id } }),
    ])
    await recordAudit({
      action: 'creator.sample-cancelled',
      summary: `Cancelled creator sample ${order.orderNumber}${creator?.name ? ` (${creator.name})` : ''}`,
      detail: { orderId: order.id, orderNumber: order.orderNumber, creatorId: creator?.id || null },
      actor: admin,
    })
    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error('[API /orders/cancel-creator-sample]', error)
    return res.status(500).json({ error: 'Could not cancel the sample' })
  }
}
