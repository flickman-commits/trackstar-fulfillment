/**
 * /api/orders/auto-import - pulls new orders from Artelo every 10 minutes
 * (vercel.json), so nobody has to press Import. Scraping is left to its own
 * pipeline; this only brings orders in. One exception: a result the customer
 * verified or typed in Instant Lookup is recorded as the order's research
 * record right away, so it reads the same everywhere (customerResults.js).
 */
import { isCronRequest } from '../_lib/auth.js'
import { processOrders } from '../../server/processOrders.js'
import { runLockedImport } from '../../server/lib/importStamp.js'
import { syncShopifyBulkOrders } from '../../server/domain/bulk/shopifyBulk.js'
import { applyCustomerResults } from '../../server/domain/research/customerResults.js'
import { autoQueueRenders } from '../../server/domain/render/jobs.js'

export default async function handler(req, res) {
  if (!isCronRequest(req)) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const out = await runLockedImport(() => processOrders({ runResearch: false, verbose: false }))
    if (out.imported) console.log(`[orders.auto-import] imported ${out.imported}, updated ${out.updated || 0}`)
    const applied = await applyCustomerResults({ limit: 100 }).catch(err => { console.error('[orders.auto-import] customer results failed:', err.message); return null })
    if (applied?.found) console.log(`[orders.auto-import] customer results: ${applied.applied} recorded, ${applied.failed} failed`)
    // Orders that have everything get their print rendered without anyone clicking.
    const renders = await autoQueueRenders().catch(err => { console.error('[orders.auto-import] auto renders failed:', err.message); return null })
    if (renders?.queued) console.log(`[orders.auto-import] renders queued: ${renders.queued}`)
    // Bulk runs paid through Shopify: link or create their runs, mark paid.
    const bulk = await syncShopifyBulkOrders().catch(err => { console.error('[orders.auto-import] bulk sync failed:', err.message); return null })
    if (bulk && (bulk.created || bulk.linked || bulk.paid)) console.log(`[orders.auto-import] bulk: ${bulk.created} created, ${bulk.linked} linked, ${bulk.paid} paid`)
    return res.status(200).json({ imported: out.imported || 0, updated: out.updated || 0, skipped: out.skipped || 0, lastImportedAt: out.lastImportedAt || null })
  } catch (error) {
    console.error('[API /orders/auto-import]', error)
    return res.status(500).json({ error: 'Auto import failed' })
  }
}
