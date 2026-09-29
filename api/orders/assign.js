/**
 * /api/orders/assign - who fulfills which order.
 *
 *   GET                                   the team (active users) and the per-type defaults
 *   POST { orderId, assigneeId }          reassign one order; null unassigns
 *   POST { action:'defaults', standard, custom }   change the import defaults (admins only)
 *
 * Reassigning is open to the whole team: covering for someone is the point.
 * Changing the defaults changes where every future order lands, so it needs
 * the admin role. Both are written to the audit log.
 */
import prisma from '../_lib/prisma.js'
import { setCors, requireAdmin } from '../_lib/auth.js'
import { requireAdminRole, recordAudit } from '../_lib/users.js'
import { getAssignmentDefaults, setAssignmentDefaults, ASSIGNABLE_TYPES } from '../../server/domain/orders/assignment.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS' })) return
  const actor = requireAdmin(req, res)
  if (!actor) return

  try {
    if (req.method === 'GET') {
      const users = await prisma.user.findMany({
        where: { isActive: true },
        orderBy: { firstName: 'asc' },
        select: { id: true, firstName: true, lastName: true },
      })
      return res.status(200).json({ users, defaults: await getAssignmentDefaults({ force: true }), me: actor.id || null })
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})

    if (body.action === 'defaults') {
      const admin = await requireAdminRole(req, res, actor)
      if (!admin) return
      const map = {}
      for (const t of ASSIGNABLE_TYPES) {
        if (!body[t]) continue
        const u = await prisma.user.findUnique({ where: { id: String(body[t]) }, select: { isActive: true } })
        if (!u?.isActive) return res.status(400).json({ error: `No active teammate for ${t}` })
        map[t] = String(body[t])
      }
      const saved = await setAssignmentDefaults(map)
      await recordAudit({ action: 'order.assignment-defaults', summary: 'Changed default assignees', detail: saved, actor: admin })
      return res.status(200).json({ defaults: saved })
    }

    const orderId = String(body.orderId || '')
    if (!orderId) return res.status(400).json({ error: 'orderId is required' })
    const assigneeId = body.assigneeId ? String(body.assigneeId) : null
    if (assigneeId) {
      const u = await prisma.user.findUnique({ where: { id: assigneeId }, select: { isActive: true } })
      if (!u?.isActive) return res.status(400).json({ error: 'That teammate is not active' })
    }
    const order = await prisma.order.update({
      where: { id: orderId },
      data: { assigneeId },
      select: { id: true, orderNumber: true, assigneeId: true, assignee: { select: { firstName: true } } },
    })
    await recordAudit({
      action: 'order.assign',
      summary: `Assigned ${order.orderNumber} to ${order.assignee?.firstName || 'nobody'}`,
      detail: { orderId, assigneeId },
      actor,
    })
    return res.status(200).json({ orderId: order.id, assigneeId: order.assigneeId, assigneeName: order.assignee?.firstName || null })
  } catch (error) {
    console.error('[API /orders/assign]', error)
    return res.status(500).json({ error: error.message })
  }
}
