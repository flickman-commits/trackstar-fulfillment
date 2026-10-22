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
import { seesMoney } from '../_lib/money.js'
import { requireAdminRole, recordAudit } from '../_lib/users.js'
import { publicPrintCatalog } from '../../server/domain/catalog/printCatalog.js'
import { sendPublicError } from '../../server/lib/publicError.js'
import { FRAME_OPTIONS, SIZE_OPTIONS } from '../../server/domain/bulk/bulkOrders.js'
import { EVENT_OPTIONS, PRINT_KINDS, createDeal, updateDeal, loadDeal, quoteDeal, buildInvoice, sendInvoice, lineTemplateUpload, lineTemplateSaved, pastDetails } from '../../server/domain/bulk/deals.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS' })) return
  const actor = await requireAdmin(req, res)
  if (!actor) return
  // Prices, the discount and the invoice are admins' (api/_lib/money.js): another
  // role can set up a deal and its lines but never sees or sets the money.
  const money = seesMoney(actor)
  const shown = deal => money || !deal ? deal : withoutDealMoney(deal)
  const input = body => money ? body : withoutDealMoney(body)
  try {
    if (req.method === 'GET') {
      // Start a new order from an earlier one's details (the discount only for admins).
      if (req.query?.past) return res.status(200).json({ past: (await pastDetails()).map(d => money ? d : withoutDealMoney(d)) })
      // The store's prints for the race picker: names and pictures, no prices.
      if (req.query?.catalog) return res.status(200).json({ products: await publicPrintCatalog() })
      if (req.query?.options) return res.status(200).json({ events: EVENT_OPTIONS, sizes: SIZE_OPTIONS, frames: FRAME_OPTIONS, printKinds: PRINT_KINDS })
      if (req.query?.quote) {
        if (!money) return res.status(403).json({ error: 'Prices are for admins.' })
        return res.status(200).json(await quoteDeal(req.query.id))
      }
      return res.status(200).json({ deal: shown(await loadDeal(req.query?.id)) })
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    switch (body.action) {
      case 'create': {
        const deal = shown(await createDeal(input(body), actor))
        await recordAudit({ action: 'bulk.deal_create', summary: `Created bulk deal ${deal.number} for ${deal.partnerName} (${deal.runs.length} line${deal.runs.length === 1 ? '' : 's'}, ${deal.runs.reduce((n, r) => n + r.quantity, 0)} prints)`, detail: { dealId: deal.id }, actor })
        return res.status(200).json({ deal })
      }
      case 'update': {
        const deal = shown(await updateDeal(body.id, input(body)))
        await recordAudit({ action: 'bulk.deal_update', summary: `Edited bulk deal ${deal.number}`, detail: { dealId: deal.id }, actor })
        return res.status(200).json({ deal })
      }
      // A co-branded line's production file, for the render worker (render/templates.js).
      case 'template-upload': {
        return res.status(200).json(await lineTemplateUpload(body.runId, body.fileName))
      }
      case 'template-saved': {
        const t = await lineTemplateSaved(body.runId, body.path)
        await recordAudit({ action: 'bulk.template_upload', summary: `Uploaded the co-branded production file for ${t.edition}`, detail: { key: t.key }, actor })
        return res.status(200).json({ ok: true, key: t.key })
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

const DEAL_MONEY = ['discountKind', 'discountPercent', 'discountCents', 'discountDollars', 'discountNote', 'currency', 'invoiceUrl', 'shopifyDraftId', 'shopifyDraftName', 'adminUrl']
function withoutDealMoney(deal) {
  const out = { ...deal }
  for (const k of DEAL_MONEY) delete out[k]
  return out
}
