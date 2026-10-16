/**
 * /api/support/thread - one conversation.
 *
 *   GET  ?id=                                   the thread, its messages, notes and events, the customer's orders and other threads; marks it read for you
 *   POST { id, action: 'assign', assigneeId }
 *   POST { id, action: 'status', status }       open | waiting | escalated | closed
 *   POST { id, action: 'snooze', until }        ISO time, or null to unsnooze
 *   POST { id, action: 'priority', priority }
 *   POST { id, action: 'tags', tags }
 *   POST { id, action: 'note', body, mentions }  an internal note; mentions are teammate ids
 *   POST { id, action: 'deleteNote', noteId }
 *   POST { id, action: 'unread' }               back to unread for you
 *
 * Every change leaves an event in the thread and a line in the audit log.
 */
import { setCors } from '../_lib/auth.js'
import { requireCapability, recordAudit } from '../_lib/users.js'
import { getThread, assign, setStatus, snooze, setPriority, setTags, addNote, deleteNote, markRead, markUnread } from '../../server/domain/support/threads.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS' })) return
  const user = await requireCapability(req, res, 'support')
  if (!user) return
  try {
    if (req.method === 'GET') {
      const id = String(req.query?.id || '')
      if (!id) return res.status(400).json({ error: 'id is required' })
      const t = await getThread(id, { userId: user.id })
      if (!t) return res.status(404).json({ error: 'No such thread' })
      await markRead(id, user.id)
      return res.status(200).json({ ...t, unread: false })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const id = String(body.id || '')
    if (!id) return res.status(400).json({ error: 'id is required' })
    const audit = (summary, detail) => recordAudit({ action: `support.${body.action}`, summary, detail: { threadId: id, ...detail }, actor: user })

    switch (body.action) {
      case 'assign': {
        const t = await assign(id, body.assigneeId ? String(body.assigneeId) : null, user)
        await audit(`Assigned "${t.subject}" to ${t.assignee ? t.assignee.firstName : 'nobody'}`, { assigneeId: t.assignee?.id || null })
        return res.status(200).json(t)
      }
      case 'status': {
        const t = await setStatus(id, String(body.status || ''), user)
        await audit(`Marked "${t.subject}" ${t.status}`, { status: t.status })
        return res.status(200).json(t)
      }
      case 'snooze': {
        const t = await snooze(id, body.until || null, user)
        await audit(body.until ? `Snoozed "${t.subject}"` : `Unsnoozed "${t.subject}"`, { until: body.until || null })
        return res.status(200).json(t)
      }
      case 'priority': {
        const t = await setPriority(id, Boolean(body.priority), user)
        return res.status(200).json(t)
      }
      case 'tags': {
        const t = await setTags(id, body.tags)
        return res.status(200).json(t)
      }
      case 'note': {
        const n = await addNote(id, { body: body.body, mentions: Array.isArray(body.mentions) ? body.mentions : [] }, user)
        return res.status(200).json(n)
      }
      case 'deleteNote': {
        return res.status(200).json(await deleteNote(String(body.noteId || ''), user))
      }
      case 'unread': {
        await markUnread(id, user.id)
        return res.status(200).json({ ok: true })
      }
      default:
        return res.status(400).json({ error: `Unknown action: ${body.action}` })
    }
  } catch (error) {
    console.error('[API /support/thread]', error)
    return res.status(500).json({ error: error.message })
  }
}
