/**
 * GET /api/admin/lookups-recent[?race=Boston Marathon&limit=200]
 *
 * Admin-only. Returns the most recent Instant Lookup attempts from the
 * LookupLog table — visible across every serverless instance (and durable
 * across cold starts).
 *
 * Notes:
 *   - Names are anonymized at write time (e.g. "M.H.(11)").
 *   - Filter ?race=… is case-sensitive against the canonical race name.
 *   - For permanent stdout records you can also grep `[LOOKUP]` in Vercel logs.
 */
import { setCors, requireAdmin } from '../_lib/auth.js'
import { getRecentLookups } from '../../server/lib/lookupObservability.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, OPTIONS' })) return
  if (!requireAdmin(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const limit = Math.max(1, Math.min(500, parseInt(req.query.limit, 10) || 200))
  const raceFilter = (req.query.race || '').toString().trim() || null

  // Read from Postgres so we see lookups across every serverless instance.
  const entries = await getRecentLookups(limit, raceFilter)

  // Quick summary so the user doesn't have to count by hand.
  const summary = entries.reduce((acc, e) => {
    acc.total += 1
    acc.byOutcome[e.outcome] = (acc.byOutcome[e.outcome] || 0) + 1
    if (e.race) acc.byRace[e.race] = (acc.byRace[e.race] || 0) + 1
    return acc
  }, { total: 0, byOutcome: {}, byRace: {} })

  return res.status(200).json({
    summary,
    entries,
    note: 'From the LookupLog table — visible across every serverless instance. For stdout records, grep [LOOKUP] in Vercel logs.',
  })
}
