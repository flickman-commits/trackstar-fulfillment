/**
 * /api/support/compose - "Email customer" from the fulfillment tool.
 *
 *   POST { orderId, subject, text }   sends from fast@ to the order's customer; returns { threadId, to, subject }
 *
 * The address comes from the order, never from the page.
 */
import { setCors } from '../_lib/auth.js'
import { requireCapability, recordAudit } from '../_lib/users.js'
import { emailCustomer } from '../../server/domain/support/compose.js'

const SAFE = /^(No such order|This order has no customer email to write to|Write the email first|Fill in what we need from them first|The support mailbox|Gmail is rate limiting us)/

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'POST, OPTIONS' })) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const user = await requireCapability(req, res, 'support')
  if (!user) return
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const out = await emailCustomer({ orderId: body.orderId, subject: body.subject, text: body.text, actor: user })
    await recordAudit({ action: 'support.compose', summary: `Emailed ${out.to}: "${out.subject}"`, detail: { orderId: body.orderId, threadId: out.threadId }, actor: user })
    return res.status(200).json(out)
  } catch (error) {
    console.error('[API /support/compose]', error)
    const msg = String(error?.message || '')
    return res.status(SAFE.test(msg) ? 400 : 500).json({ error: SAFE.test(msg) ? msg : 'Could not send that email. Try again, or send it from Support.' })
  }
}
