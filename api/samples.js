/**
 * /api/samples - Tools > Samples (admin).
 *   GET                               the store's race prints with sizes and frames
 *   GET ?view=spend                   sample spend by month
 *   POST { action: 'quote', items }   at-cost prices from Artelo
 *   POST { action: 'cost', items }    what the prints cost us
 *   POST { action: 'send', ... }      create the sample order in Shopify
 */
import { setCors, requireAdmin } from './_lib/auth.js'
import { requireAdminRole, recordAudit } from './_lib/users.js'
import { sampleCatalog, quoteAtCost, sendSample } from '../server/domain/samples/samples.js'
import { estimateSampleCost, sampleSpend } from '../server/domain/samples/costs.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS' })) return
  const actor = requireAdmin(req, res)
  if (!actor) return
  const user = await requireAdminRole(req, res, actor)
  if (!user) return
  try {
    if (req.method === 'GET') {
      if (req.query?.view === 'spend') return res.status(200).json(await sampleSpend())
      return res.status(200).json({ products: await sampleCatalog() })
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    if (b.action === 'quote') return res.status(200).json(await quoteAtCost(b.items || [], b.address || null))
    // What these prints cost us (production, shipping, branding), free or not.
    if (b.action === 'cost') return res.status(200).json(await estimateSampleCost(b.items || [], b.address || null))
    if (b.action === 'send') {
      const out = await sendSample(b, user)
      await recordAudit({ action: 'samples.send', summary: `Sent sample ${out.name} to ${b.email} (${b.mode === 'cost' ? `at cost, $${out.total.toFixed(2)}` : 'free'})`, detail: { order: out.name, items: (b.items || []).length }, actor: user })
      return res.status(200).json(out)
    }
    return res.status(400).json({ error: 'Unknown action' })
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message })
    console.error('[API /samples]', error)
    return res.status(500).json({ error: `Could not send the sample: ${String(error.message || error).slice(0, 300)}` })
  }
}
