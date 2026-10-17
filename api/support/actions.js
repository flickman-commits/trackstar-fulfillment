/**
 * POST /api/support/actions { id, action, ... } - the quick actions beside a conversation.
 *
 *   discount15          { id }                                 -> { code, percent, endsAt }
 *   lookupCode          { code }                               -> what Shopify says about it
 *   tagReprint          { id, shopifyOrderId, reason }
 *   orderNote           { id, orderId, text }
 *   fixPersonalization  { id, orderId, runnerName?, year? }
 *   slackMatt           { id, text }
 *   shippingAddress     { id, shopifyOrderId, address: { name, address1, address2, city, province, zip, country, phone } }
 *
 * Anyone on Support; a discount code also needs the Discount codes
 * capability, the same gate as the dashboard's discount tool. Every
 * action is audited. See server/domain/support/actions.js.
 */
import { setCors } from '../_lib/auth.js'
import { requireCapability, recordAudit } from '../_lib/users.js'
import { can } from '../_lib/roles.js'
import prisma from '../_lib/prisma.js'
import { discount15, lookupCode, tagReprint, orderNote, fixPersonalization, slackMatt, shippingAddress } from '../../server/domain/support/actions.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'POST, OPTIONS' })) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const user = await requireCapability(req, res, 'support')
  if (!user) return
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const action = String(body.action || '')

    if (action === 'lookupCode') return res.status(200).json(await lookupCode(body.code))

    const thread = await prisma.supportThread.findUnique({ where: { id: String(body.id || '') } })
    if (!thread) return res.status(404).json({ error: 'No such thread' })
    const audit = (summary, detail = {}) => recordAudit({ action: `support.${action}`, summary, detail: { threadId: thread.id, ...detail }, actor: user })

    switch (action) {
      case 'discount15': {
        if (!(user.isSystem || user.role === 'admin' || await can(user.role, 'tools.discounts'))) {
          return res.status(403).json({ error: 'Discount codes are not part of your role. Ask Matt.', code: 'not_allowed' })
        }
        const out = await discount15({ thread, actor: user })
        await audit(`Created ${out.code} for ${thread.customerEmail}`, out)
        return res.status(200).json(out)
      }
      case 'tagReprint': {
        const out = await tagReprint({ thread, shopifyOrderId: body.shopifyOrderId, reason: body.reason, actor: user })
        await audit(`Tagged #${out.number} REPRINT`, { reason: body.reason || null })
        return res.status(200).json(out)
      }
      case 'orderNote': {
        const out = await orderNote({ thread, orderId: body.orderId, text: body.text, actor: user })
        await audit(`Note on #${out.number} from support`, { orderId: body.orderId })
        return res.status(200).json(out)
      }
      case 'fixPersonalization': {
        const out = await fixPersonalization({ thread, orderId: body.orderId, runnerName: body.runnerName, year: body.year, actor: user })
        await audit(`Changed #${out.number}: ${out.what}`, { orderId: body.orderId })
        return res.status(200).json(out)
      }
      case 'shippingAddress': {
        const out = await shippingAddress({ thread, shopifyOrderId: body.shopifyOrderId, address: body.address, actor: user })
        await audit(`Changed #${out.number}'s ship-to`, { shopifyOrderId: body.shopifyOrderId })
        return res.status(200).json(out)
      }
      case 'slackMatt': {
        const out = await slackMatt({ thread, text: body.text, actor: user })
        await audit(`Escalated "${thread.subject}" to Slack`, { text: body.text || null })
        return res.status(200).json(out)
      }
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` })
    }
  } catch (error) {
    console.error('[API /support/actions]', error)
    return res.status(500).json({ error: error.message })
  }
}
