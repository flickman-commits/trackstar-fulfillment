/**
 * /api/orders/auto-import - pulls new orders from Artelo every 10 minutes
 * (vercel.json), so nobody has to press Import. Research is left to its own
 * pipeline; this only brings orders in.
 */
import { isCronRequest } from '../_lib/auth.js'
import { processOrders } from '../../server/processOrders.js'
import { runLockedImport } from '../../server/lib/importStamp.js'

export default async function handler(req, res) {
  if (!isCronRequest(req)) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const out = await runLockedImport(() => processOrders({ runResearch: false, verbose: false }))
    if (out.imported) console.log(`[orders.auto-import] imported ${out.imported}, updated ${out.updated || 0}`)
    return res.status(200).json({ imported: out.imported || 0, updated: out.updated || 0, skipped: out.skipped || 0, lastImportedAt: out.lastImportedAt || null })
  } catch (error) {
    console.error('[API /orders/auto-import]', error)
    return res.status(500).json({ error: 'Auto import failed' })
  }
}
