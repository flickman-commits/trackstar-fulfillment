/**
 * GET /api/admin/custom-counter?month=YYYY-MM
 *
 * Admin only. Custom designs each designer finished in a month, for payouts.
 * "Finished" means moved to Sent to Production; the month is Eastern time.
 * Each row is one print (a two-print order counts twice). Older orders
 * completed before designCompletedAt existed fall back to researchedAt and
 * whoever the order is assigned to.
 */
import { setCors } from '../_lib/auth.js'
import { requireAdminOnly } from '../_lib/users.js'
import { customCounter } from '../../server/domain/orders/customCounter.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, OPTIONS' })) return
  if (!(await requireAdminOnly(req, res))) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const month = String(req.query?.month || '')
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: 'month must be YYYY-MM' })
  try {
    return res.status(200).json(await customCounter(month))
  } catch (error) {
    console.error('[API /admin/custom-counter] Error:', error)
    return res.status(500).json({ error: 'Could not load the counter' })
  }
}
