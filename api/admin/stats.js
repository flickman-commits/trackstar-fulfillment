/**
 * GET /api/admin/stats?range=today|yesterday|7d|30d|90d
 *
 * Storefront stats for the dashboard's Stats panel, computed from Shopify
 * orders. Adding a metric means adding one entry to METRICS in
 * server/services/shopifyStats.js; this endpoint returns whatever is there.
 */
import { setCors, requireAdmin } from '../_lib/auth.js'
import { computeStats, RANGES } from '../../server/services/shopifyStats.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, OPTIONS' })) return
  if (!requireAdmin(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const range = String(req.query?.range || '30d')
    if (!RANGES[range]) {
      return res.status(400).json({ error: `Unknown range "${range}"`, ranges: Object.keys(RANGES) })
    }
    const stats = await computeStats(range)
    return res.status(200).json({
      ...stats,
      ranges: Object.entries(RANGES).map(([key, r]) => ({ key, label: r.label })),
    })
  } catch (error) {
    console.error('[API /admin/stats] Error:', error)
    return res.status(500).json({ error: error.message })
  }
}
