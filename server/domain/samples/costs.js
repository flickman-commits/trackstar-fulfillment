/**
 * What samples cost us. Every sample is recorded when it is sent (Tools >
 * Samples, the MCP's send_sample, a creator's sample) with its cost at that
 * moment, from Artelo's price check for the whole order: production,
 * shipping and branding. Money is integer cents.
 */
import prisma from '../../db.js'
import { arteloPriceCheck } from '../../services/arteloPriceCheck.js'

/**
 * Our cost for a set of prints, priced by Artelo's own price check for the
 * whole order (server/services/arteloPriceCheck.js): production, shipping
 * for the shipment, and branding. [{ size, frame, quantity }] -> cents.
 * `address` prices shipping to where it goes; without one, a US default.
 */
export async function estimateSampleCost(items, address = null) {
  const p = await arteloPriceCheck({ items, address })
  return { productionCents: p.productionCents, shippingCents: p.shippingCents + p.brandingCents, totalCents: p.totalCents, perItem: p.perItem }
}

export async function recordSampleCost({ source, creatorId = null, orderName, recipient, email, items, costCents, chargedCents = 0, createdById = null }) {
  return prisma.sampleCost.create({
    data: {
      source, creatorId, orderName: orderName || null, recipient: String(recipient || 'Unknown'), email: email || null,
      items: (items || []).map(i => ({ title: i.title || null, size: i.size || null, frame: i.frame || null, quantity: i.quantity || 1 })),
      costCents: Math.max(0, Math.round(costCents || 0)), chargedCents: Math.max(0, Math.round(chargedCents || 0)), createdById,
    },
  })
}

/** Record a sample's cost without ever failing the send it belongs to. */
export async function recordSampleCostSafely(input, items, address = null) {
  try {
    const est = input.costCents != null ? { totalCents: input.costCents } : await estimateSampleCost(items, address)
    return await recordSampleCost({ ...input, items, costCents: est.totalCents })
  } catch (err) {
    console.error('[samples] could not record the sample cost:', err.message)
    return null
  }
}

/** Sample spend by month, newest first, and the samples in the latest months. */
export async function sampleSpend({ months = 12 } = {}) {
  const since = new Date(); since.setUTCMonth(since.getUTCMonth() - months + 1); since.setUTCDate(1); since.setUTCHours(0, 0, 0, 0)
  const rows = await prisma.sampleCost.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } })
  const byMonth = new Map()
  for (const r of rows) {
    const key = r.createdAt.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).slice(0, 7)
    const m = byMonth.get(key) || { month: key, count: 0, costCents: 0, chargedCents: 0, bySource: {} }
    m.count++; m.costCents += r.costCents; m.chargedCents += r.chargedCents
    m.bySource[r.source] = (m.bySource[r.source] || 0) + 1
    byMonth.set(key, m)
  }
  return {
    months: [...byMonth.values()].map(m => ({ ...m, netCents: m.costCents - m.chargedCents })),
    recent: rows.slice(0, 50).map(r => ({ id: r.id, at: r.createdAt, source: r.source, orderName: r.orderName, recipient: r.recipient, items: r.items, costCents: r.costCents, chargedCents: r.chargedCents })),
  }
}
