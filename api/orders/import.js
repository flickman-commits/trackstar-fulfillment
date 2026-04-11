/**
 * POST /api/orders/import
 *
 * API endpoint for manual "Import Now" button.
 * Calls the shared processOrders function.
 *
 * Query params:
 *   - research=true: Also run research for supported races
 */

import { setCors, requireAdmin } from '../_lib/auth.js'
import { processOrders } from '../../server/processOrders.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'POST, OPTIONS' })) return
  if (!requireAdmin(req, res)) return

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Check if research should be run
    const runResearch = req.query.research === 'true' || req.body?.research === true

    console.log(`[API /orders/import] Starting import (research: ${runResearch})`)

    const results = await processOrders({
      runResearch,
      verbose: true
    })

    return res.status(200).json(results)

  } catch (error) {
    console.error('[API /orders/import] Error:', error)
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}
