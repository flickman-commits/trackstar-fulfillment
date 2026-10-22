/**
 * /api/bulk/deals - bulk deals: one organization's order across races and
 * events, and its Shopify invoice (server/domain/bulk/deals.js).
 *
 *   GET ?options=1          events, sizes, frames, print kinds
 *   GET ?id=                the deal and its lines
 *   GET ?id=&quote=1        the invoice as it would read: Shopify prices, discount, total
 *   POST { action, ... }
 *     create        { partnerName, contact..., billingAddress, printKind, discount..., shipping, shipToAddress?, lines: [{ raceName, raceYear, eventType, quantity, productSize, frameType }] }
 *     update        { id, ...terms }
 *     invoice       { id }               admin: build or rebuild the Shopify draft order
 *     send-invoice  { id, message? }     admin: Shopify emails it to the contact
 */
import { setCors, requireAdmin } from '../_lib/auth.js'
import { requireAdminRole, recordAudit } from '../_lib/users.js'
import { sendPublicError } from '../../server/lib/publicError.js'
import { FRAME_OPTIONS, SIZE_OPTIONS } from '../../server/domain/bulk/bulkOrders.js'
import { EVENT_OPTIONS, PRINT_KINDS, createDeal, updateDeal, loadDeal, quoteDeal, buildInvoice, sendInvoice } from '../../server/domain/bulk/deals.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS' })) return
  const actor = await requireAdmin(req, res)
  if (!actor) return
  try {
    if (req.method === 'GET') {
      if (req.query?.options) return res.status(200).json({ events: EVENT_OPTIONS, sizes: SIZE_OPTIONS, frames: FRAME_OPTIONS, printKinds: PRINT_KINDS })
      if (req.query?.quote) return res.status(200).json(await quoteDeal(req.query.id))
      return res.status(200).json({ deal: await loadDeal(req.query?.id) })
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    switch (body.action) {
      case 'create': {
        const deal = await createDeal(body, actor)
        await recordAudit({ action: 'bulk.deal_create', summary: `Created bulk deal ${deal.number} for ${deal.partnerName} (${deal.runs.length} line${deal.runs.length === 1 ? '' : 's'}, ${deal.runs.reduce((n, r) => n + r.quantity, 0)} prints)`, detail: { dealId: deal.id }, actor })
        return res.status(200).json({ deal })
      }
      case 'update': {
        const deal = await updateDeal(body.id, body)
        await recordAudit({ action: 'bulk.deal_update', summary: `Edited bulk deal ${deal.number}`, detail: { dealId: deal.id }, actor })
        return res.status(200).json({ deal })
      }
      case 'invoice': {
        const admin = await requireAdminRole(req, res, actor)
        if (!admin) return
        const out = await buildInvoice(body.id)
        await recordAudit({ action: 'bulk.deal_invoice', summary: `Built Shopify invoice ${out.draftName} for bulk deal ${out.quote.deal.number} ($${(out.quote.totalCents / 100).toFixed(2)})`, detail: { dealId: out.quote.deal.id, draft: out.draftName }, actor: admin })
        return res.status(200).json({ draftName: out.draftName, invoiceUrl: out.invoiceUrl, totalShopify: out.totalShopify, quote: out.quote, deal: await loadDeal(body.id) })
      }
      case 'send-invoice': {
        const admin = await requireAdminRole(req, res, actor)
        if (!admin) return
        const out = await sendInvoice(body.id, { message: body.message })
        await recordAudit({ action: 'bulk.deal_invoice_send', summary: `Sent the bulk deal invoice to ${out.sentTo}`, detail: { dealId: body.id }, actor: admin })
        return res.status(200).json({ ...out, deal: await loadDeal(body.id) })
      }
      default:
        return res.status(400).json({ error: 'Unknown action' })
    }
  } catch (error) {
    return sendPublicError(res, error)
  }
}
