/**
 * /api/admin/audit - the "who did what" log.
 *
 *   GET ?limit=100&action=price.apply&userId=...
 *
 * Admin only, as part of the admin view. It is append-only regardless:
 * nothing in this file writes or deletes, so the log cannot be edited from
 * the application at all.
 */
import prisma from '../_lib/prisma.js'
import { setCors, requireAdmin } from '../_lib/auth.js'
import { requireAdminRole } from '../_lib/users.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, OPTIONS' })) return
  const actor = requireAdmin(req, res)
  if (!actor) return
  if (!await requireAdminRole(req, res, actor)) return

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const limit = Math.min(Math.max(Number(req.query?.limit) || 100, 1), 500)
    const where = {}
    if (req.query?.action) where.action = String(req.query.action)
    if (req.query?.userId) where.userId = String(req.query.userId)

    const events = await prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { name: true, email: true } } },
    })

    return res.status(200).json({
      events: events.map(e => ({
        id: e.id,
        action: e.action,
        summary: e.summary,
        detail: e.detail,
        createdAt: e.createdAt,
        // Prefer the live name; fall back to the email stamped at write time so
        // deleted accounts still show as someone rather than as nothing.
        actor: e.user?.name || e.actorEmail,
        actorEmail: e.user?.email || e.actorEmail,
      })),
    })
  } catch (error) {
    console.error('[admin/audit] Error:', error)
    return res.status(500).json({ error: error.message })
  }
}
