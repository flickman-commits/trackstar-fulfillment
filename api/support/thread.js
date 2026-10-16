/**
 * /api/support/thread - one thread.
 *
 *   GET  ?id=                     the thread, its messages, the customer's orders and past threads
 *   POST { id, action: 'assign', assigneeId }
 *   POST { id, action: 'status', status }      open | waiting | escalated | closed
 *   POST { id, action: 'snooze', until }       ISO time, or null to unsnooze
 *
 * Every change is audited with who made it.
 */
import { setCors } from '../_lib/auth.js'
import { requireCapability, recordAudit } from '../_lib/users.js'
import { getThread, assign, setStatus, snooze } from '../../server/domain/support/threads.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS' })) return
  const user = await requireCapability(req, res, 'support')
  if (!user) return
  try {
    if (req.method === 'GET') {
      const id = String(req.query?.id || '')
      if (!id) return res.status(400).json({ error: 'id is required' })
      const t = await getThread(id)
      if (!t) return res.status(404).json({ error: 'No such thread' })
      return res.status(200).json(t)
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const id = String(body.id || '')
    if (!id) return res.status(400).json({ error: 'id is required' })

    if (body.action === 'assign') {
      const t = await assign(id, body.assigneeId ? String(body.assigneeId) : null)
      await recordAudit({ action: 'support.assign', summary: `Assigned "${t.subject}" to ${t.assignee ? t.assignee.firstName : 'nobody'}`, detail: { threadId: id, assigneeId: t.assignee?.id || null }, actor: user })
      return res.status(200).json(t)
    }
    if (body.action === 'status') {
      const t = await setStatus(id, String(body.status || ''))
      await recordAudit({ action: 'support.status', summary: `Marked "${t.subject}" ${t.status}`, detail: { threadId: id, status: t.status }, actor: user })
      return res.status(200).json(t)
    }
    if (body.action === 'snooze') {
      const t = await snooze(id, body.until || null)
      await recordAudit({ action: 'support.snooze', summary: body.until ? `Snoozed "${t.subject}" until ${new Date(body.until).toLocaleString()}` : `Unsnoozed "${t.subject}"`, detail: { threadId: id, until: body.until || null }, actor: user })
      return res.status(200).json(t)
    }
    return res.status(400).json({ error: `Unknown action: ${body.action}` })
  } catch (error) {
    console.error('[API /support/thread]', error)
    return res.status(500).json({ error: error.message })
  }
}
