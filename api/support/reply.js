/**
 * POST /api/support/reply { id, text }
 *
 * Send a reply on a thread, from the support mailbox, as this person. The
 * only place support mail leaves the app, and only ever reached by a person
 * pressing Send on text they wrote or read. Plain text in; the same HTML
 * shape the Sales emails use goes out, so a reply reads as typed, not sent
 * by a system. The thread moves to waiting on the customer.
 */
import { setCors } from '../_lib/auth.js'
import { requireCapability, recordAudit } from '../_lib/users.js'
import prisma from '../_lib/prisma.js'
import { textToHtml } from '../../server/domain/sales/gmail.js'
import { sendReply } from '../../server/domain/support/mailbox.js'
import { getThread } from '../../server/domain/support/threads.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'POST, OPTIONS' })) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const user = await requireCapability(req, res, 'support')
  if (!user) return
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const id = String(body.id || '')
    const text = String(body.text || '').replace(/\r\n/g, '\n').trim()
    if (!id) return res.status(400).json({ error: 'id is required' })
    if (!text) return res.status(400).json({ error: 'Write something first' })
    if (/—/.test(text)) return res.status(400).json({ error: 'No em dashes in anything a customer sees. Use a comma, a period or parentheses.', code: 'em_dash' })

    const thread = await prisma.supportThread.findUnique({ where: { id } })
    if (!thread) return res.status(404).json({ error: 'No such thread' })

    const sent = await sendReply({ userId: user.id, thread, html: textToHtml(text), text })
    await recordAudit({ action: 'support.reply', summary: `Replied to ${thread.customerEmail} on "${thread.subject}"`, detail: { threadId: id, gmailMessageId: sent?.gmailMessageId || null, chars: text.length }, actor: user })
    const fresh = await getThread(id)
    return res.status(200).json(fresh)
  } catch (error) {
    console.error('[API /support/reply]', error)
    return res.status(500).json({ error: error.message })
  }
}
