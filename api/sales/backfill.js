/**
 * /api/sales/backfill - TEMPORARY. One-off bulk write of touch counts and
 * next actions to Attio deals, decided elsewhere from email history. Admin
 * only. Allowed fields: touch_count, next_action, next_action_date, and
 * stage only to "Reached Out". Remove after the 2026-09-21 backfill.
 */
import { setCors } from '../_lib/auth.js'
import { requireAdminOnly, recordAudit } from '../_lib/users.js'
import { patchDeal, forgetAttioCache } from '../../server/domain/sales/attio.js'

const ALLOWED = new Set(['touch_count', 'next_action', 'next_action_date', 'stage'])

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'POST, OPTIONS' })) return
  const actor = await requireAdminOnly(req, res)
  if (!actor) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const updates = Array.isArray(body.updates) ? body.updates : []
    const results = []
    for (const u of updates) {
      const values = {}
      for (const [k, v] of Object.entries(u.values || {})) {
        if (!ALLOWED.has(k)) continue
        if (k === 'stage' && v !== 'Reached Out') continue
        values[k] = v
      }
      if (!u.id || !Object.keys(values).length) { results.push({ id: u.id, ok: false, error: 'nothing allowed to write' }); continue }
      try { await patchDeal(String(u.id), values); results.push({ id: u.id, ok: true }) }
      catch (err) { results.push({ id: u.id, ok: false, error: err.message }) }
    }
    forgetAttioCache()
    await recordAudit({ actor, action: 'sales.backfill', summary: `Backfilled ${results.filter(r => r.ok).length} Attio deals from email history`, detail: { failed: results.filter(r => !r.ok) } })
    return res.status(200).json({ ok: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok) })
  } catch (error) {
    console.error('[API /sales/backfill]', error)
    return res.status(500).json({ error: error.message })
  }
}
