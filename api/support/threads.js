/**
 * GET /api/support/threads?view=open|mine|waiting|escalated|closed|all&q=
 *
 * The queue, the counts for the tabs, the team for the assignee picker, and
 * who is asking. Read from the mirror, never from Gmail.
 */
import { setCors } from '../_lib/auth.js'
import { requireCapability } from '../_lib/users.js'
import { listThreads, team } from '../../server/domain/support/threads.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, OPTIONS' })) return
  const user = await requireCapability(req, res, 'support')
  if (!user) return
  try {
    const view = String(req.query?.view || 'open')
    const q = String(req.query?.q || '')
    const [list, people] = await Promise.all([listThreads({ view, q, userId: user.id }), team()])
    return res.status(200).json({ ...list, team: people, me: { id: user.id, firstName: user.firstName, lastName: user.lastName, role: user.role } })
  } catch (error) {
    console.error('[API /support/threads]', error)
    return res.status(500).json({ error: error.message })
  }
}
