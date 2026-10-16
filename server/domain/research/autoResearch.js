/**
 * Research the orders that arrived in this run of the 10-minute auto-import,
 * and only those: every order is researched once, as it comes in. Orders
 * already in the tool are never picked up here; a person re-runs research
 * from the order after fixing a name or year, or once a scraper exists.
 * An Instant Lookup result is recorded by customerResults.js before this
 * runs, so those orders already have research and are skipped.
 *
 * Races that have not happened yet are left alone until they have, so a
 * pre-race order is not stamped "not found" and then never looked at again.
 */
import prisma from '../../db.js'
import { researchService } from '../../services/ResearchService.js'
import { hasScraperForRace } from '../../scrapers/index.js'
import { ensureOverridesLoaded } from '../../scrapers/scraperOverrides.js'

export async function autoResearchNew({ since, limit = 20 } = {}) {
  if (!since) throw new Error('autoResearchNew needs the time this import started')
  await ensureOverridesLoaded()
  const candidates = await prisma.order.findMany({
    where: {
      trackstarOrderType: 'standard',
      status: { notIn: ['completed', 'flagged'] },
      runnerResearch: { none: {} },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    take: limit * 6,
    select: { orderNumber: true, raceName: true, raceNameOverride: true, raceYear: true, yearOverride: true },
  })
  const now = Date.now(), thisYear = new Date().getUTCFullYear()
  const out = { researched: 0, found: 0, failed: 0, skipped: 0, orders: [] }
  for (const o of candidates) {
    if (out.researched + out.failed >= limit) break
    const race = o.raceNameOverride ?? o.raceName, year = o.yearOverride ?? o.raceYear
    if (!race || !year || !hasScraperForRace(race) || year > thisYear) { out.skipped++; continue }
    // Not run yet, or run so recently its date is not on file: wait.
    const row = await prisma.race.findFirst({ where: { raceName: race, year }, select: { raceDate: true } })
    if (year === thisYear && (!row?.raceDate || row.raceDate.getTime() > now)) { out.skipped++; continue }
    try {
      const { runnerResearch } = await researchService.researchOrder(o.orderNumber)
      out.researched++
      if (runnerResearch?.researchStatus === 'found') out.found++
      out.orders.push(`${o.orderNumber}: ${runnerResearch?.researchStatus}`)
    } catch (e) {
      out.failed++
      out.orders.push(`${o.orderNumber}: error ${e.message.slice(0, 80)}`)
    }
  }
  return out
}
