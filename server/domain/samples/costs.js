/**
 * What samples cost us. Every sample is recorded when it is sent (Tools >
 * Samples, the MCP's send_sample, a creator's sample) with its cost at that
 * moment: Artelo production for each print, Artelo shipping, and branding
 * once per order. Money is integer cents.
 */
import prisma from '../../db.js'
import { fetchArteloCost, BRANDING_COST_PER_ORDER } from '../../services/arteloCosts.js'

const cents = n => Math.round(Number(n || 0) * 100)

/**
 * Our cost for a set of prints: [{ size, frame, quantity }] -> cents, with the
 * per-print production costs. Shipping is summed per print (two prints in one
 * box ship for a little less, so this can run slightly high).
 */
export async function estimateSampleCost(items) {
  let production = 0, shipping = 0
  const perItem = []
  for (const it of items) {
    const framed = it.frame && !/unframed/i.test(it.frame)
    const c = await fetchArteloCost({ size: `x${String(it.size).replace(/^x/, '')}`, frameStyle: framed ? 'PremiumOak' : 'Unframed' })
    const q = Math.max(1, Number(it.quantity) || 1)
    production += c.productionCost * q
    shipping += c.shippingCost * q
    perItem.push({ productionCents: cents(c.productionCost), shippingCents: cents(c.shippingCost) })
  }
  const totalCents = cents(production) + cents(shipping) + cents(BRANDING_COST_PER_ORDER)
  return { productionCents: cents(production), shippingCents: cents(shipping) + cents(BRANDING_COST_PER_ORDER), totalCents, perItem }
}

export async function recordSampleCost({ source, orderName, recipient, email, items, costCents, chargedCents = 0, createdById = null }) {
  return prisma.sampleCost.create({
    data: {
      source, orderName: orderName || null, recipient: String(recipient || 'Unknown'), email: email || null,
      items: (items || []).map(i => ({ title: i.title || null, size: i.size || null, frame: i.frame || null, quantity: i.quantity || 1 })),
      costCents: Math.max(0, Math.round(costCents || 0)), chargedCents: Math.max(0, Math.round(chargedCents || 0)), createdById,
    },
  })
}

/** Record a sample's cost without ever failing the send it belongs to. */
export async function recordSampleCostSafely(input, items) {
  try {
    const est = input.costCents != null ? { totalCents: input.costCents } : await estimateSampleCost(items)
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
