/**
 * GET /api/admin/lookups-recent[?race=Boston Marathon&limit=200]
 *
 * Admin-only. Returns the most recent Instant Lookup attempts captured in this
 * serverless instance's in-memory ring buffer (last 200 by default).
 *
 * Notes:
 *   - Ring buffer is per-instance (serverless cold starts wipe it). Use this
 *     for ad-hoc "what's happening right now" — for permanent records, grep
 *     Vercel logs for `[LOOKUP]`.
 *   - Names are anonymized in the buffer (e.g. "M.H.(11)").
 *   - Filter ?race=… case-sensitive against the canonical race name.
 */
import { setCors, requireAdmin } from '../_lib/auth.js'
import { getRecentLookups } from '../../server/lib/lookupObservability.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, OPTIONS' })) return
  if (!requireAdmin(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 200))
  const raceFilter = (req.query.race || '').toString().trim() || null

  let entries = getRecentLookups(limit)
  if (raceFilter) entries = entries.filter(e => e.race === raceFilter)

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
    note: 'In-memory ring buffer, per serverless instance. Permanent records are in Vercel logs — grep for [LOOKUP].',
  })
}
