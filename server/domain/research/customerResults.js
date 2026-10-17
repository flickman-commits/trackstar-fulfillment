/**
 * Instant Lookup results become research records.
 *
 * The research record is the one source of truth for a runner's result.
 * Scrapers write it, hand edits write it, and a result the customer verified
 * or typed in the storefront widget must too, or every reader has to merge
 * two places and they drift (one tag says Verified, another says Needs
 * research; a check reaches the race through one path and misses it).
 *
 * The import's research step does this (ResearchService.applyVerifiedResult),
 * but the ten-minute auto-import runs with research off, so its orders were
 * left with lookup data on the order and no record. This closes that gap:
 * every standard order with lookup data and no record gets its record, on
 * every auto-import and from the backfill script. Nothing is scraped here.
 */
import prisma from '../../db.js'
import { ResearchService } from '../../services/ResearchService.js'

export async function ordersMissingCustomerResult(limit = 500) {
  return prisma.order.findMany({
    where: {
      trackstarOrderType: 'standard',
      OR: [{ customerBib: { not: null } }, { customerFinishTime: { not: null } }],
      // No result yet, or only a failed lookup: what the customer typed beats
      // "not found" (two runners on one print, a name the results spell differently).
      runnerResearch: { none: { researchStatus: 'found' } },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true, orderNumber: true, raceName: true, raceYear: true, lookupVerified: true, lookupOutcome: true, customerBib: true, customerFinishTime: true, status: true },
  })
}

/**
 * Write the missing records. Returns what it did, order by order.
 * @param {{ dryRun?: boolean, limit?: number, log?: (s: string) => void }} opts
 */
export async function applyCustomerResults({ dryRun = false, limit = 500, log = () => {} } = {}) {
  const orders = await ordersMissingCustomerResult(limit)
  const service = new ResearchService()
  const out = { found: orders.length, applied: 0, failed: 0, rows: [] }
  for (const o of orders) {
    const verified = o.lookupVerified === true
    const row = { orderNumber: o.orderNumber, race: `${o.raceName} ${o.raceYear}`, source: verified ? 'customer_verified' : 'customer_supplied', bib: o.customerBib, time: o.customerFinishTime }
    if (dryRun) { out.rows.push({ ...row, result: 'would apply' }); log(`would apply ${row.source} for ${o.orderNumber} (${row.race}, bib ${row.bib || '-'}, ${row.time || 'no time'})`); continue }
    try {
      await service.applyVerifiedResult(o.orderNumber, { verified })
      out.applied++
      out.rows.push({ ...row, result: 'applied' })
      log(`applied ${row.source} for ${o.orderNumber}`)
    } catch (e) {
      out.failed++
      out.rows.push({ ...row, result: `failed: ${e.message}` })
      log(`FAILED ${o.orderNumber}: ${e.message}`)
    }
  }
  return out
}
