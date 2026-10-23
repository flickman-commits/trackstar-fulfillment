/**
 * GET /api/admin/stats?range=today|yesterday|7d|30d|90d
 *
 * Storefront stats for the dashboard's Stats panel, computed from Shopify
 * orders. Adding a metric means adding one entry to METRICS in
 * server/services/shopifyStats.js; this endpoint returns whatever is there.
 */
import { setCors } from '../_lib/auth.js'
import { computeStats, RANGES, rangeWindow } from '../../server/services/shopifyStats.js'
import { computeFulfillmentTime, sentToProductionToday } from '../../server/domain/orders/fulfillmentTime.js'
import { computeOnTime } from '../../server/domain/orders/onTime.js'
import { requireCapability } from '../_lib/users.js'
import { sendPublicError } from '../../server/lib/publicError.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, OPTIONS' })) return
  if (!(await requireCapability(req, res, 'settings.stats'))) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const range = String(req.query?.range || '30d')
    if (!RANGES[range]) {
      return res.status(400).json({ error: `Unknown range "${range}"`, ranges: Object.keys(RANGES) })
    }
    // ?only=fulfillment: just our handling time (the header stat), without the slow Shopify read.
    if (req.query?.only === 'fulfillment') {
      const [fulfillment, sentToday, onTime] = await Promise.all([computeFulfillmentTime(rangeWindow(range)), sentToProductionToday(), computeOnTime({ days: 7 })])
      return res.status(200).json({ fulfillment, sentToday, onTime })
    }
    // Our own handling time sits beside the Shopify numbers; a failure there does not blank the page.
    const [stats, fulfillment] = await Promise.all([computeStats(range), computeFulfillmentTime(rangeWindow(range)).catch(e => { console.error('[stats] fulfillment time', e); return null })])
    return res.status(200).json({
      fulfillment,
      ...stats,
      ranges: Object.entries(RANGES).map(([key, r]) => ({ key, label: r.label })),
    })
  } catch (error) {
    console.error('[API /admin/stats] Error:', error)
    return sendPublicError(res, error)
  }
}
