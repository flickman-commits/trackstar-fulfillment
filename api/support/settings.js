/**
 * /api/support/settings - how the inbox is run.
 *
 *   GET                                               { defaultAssigneeId }
 *   POST { defaultAssigneeId, applyToOpen? }          admin: who new conversations go to; applyToOpen hands over the open unassigned ones now
 */
import { setCors } from '../_lib/auth.js'
import { requireCapability, requireAdminOnly, recordAudit } from '../_lib/users.js'
import { defaultAssigneeId, setDefaultAssignee } from '../../server/domain/support/routing.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS' })) return
  try {
    if (req.method === 'GET') {
      const user = await requireCapability(req, res, 'support')
      if (!user) return
      return res.status(200).json({ defaultAssigneeId: await defaultAssigneeId() })
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const user = await requireAdminOnly(req, res)
    if (!user) return
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const out = await setDefaultAssignee(body.defaultAssigneeId ? String(body.defaultAssigneeId) : null, { applyToOpen: Boolean(body.applyToOpen), actor: user })
    await recordAudit({ action: 'support.routing', summary: out.defaultAssigneeId ? `New support conversations go to ${out.defaultAssigneeId}${out.assigned ? ` (${out.assigned} open ones handed over)` : ''}` : 'New support conversations go to nobody', detail: out, actor: user })
    return res.status(200).json(out)
  } catch (error) {
    console.error('[API /support/settings]', error)
    return res.status(500).json({ error: error.message })
  }
}
