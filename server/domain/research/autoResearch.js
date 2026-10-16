  const thisYear = new Date().getUTCFullYear(), resultsBy = Date.now() - RESULTS_AFTER_DAYS * DAY
  const out = { researched: 0, found: 0, failed: 0, skipped: 0, orders: [] }
  const ready = []
  for (const o of candidates) {
    const race = o.raceNameOverride ?? o.raceName, year = o.yearOverride ?? o.raceYear
    if (!race || !year || !hasScraperForRace(race) || year > thisYear) { out.skipped++; continue }
    // Not run yet, too recent for results, or no date on file: the catch-up handles it.
    const row = await prisma.race.findFirst({ where: { raceName: race, year }, select: { raceDate: true } })
    if (year === thisYear && (!row?.raceDate || row.raceDate.getTime() > resultsBy)) { out.skipped++; continue }
    ready.push(o)
  }
  return researchEach(ready, limit, out)
}

/**
 * The orders that came in before their race: once the race is two days past
 * (results posted), research every open order for it that has none yet.
 * Runs on each import; only races from the last three weeks are looked at.
 */
export async function autoResearchAfterRace({ limit = 10 } = {}) {
  await ensureOverridesLoaded()
  const now = Date.now()
  const races = await prisma.race.findMany({
    where: { raceDate: { gte: new Date(now - CATCH_UP_DAYS * DAY), lte: new Date(now - RESULTS_AFTER_DAYS * DAY) } },
    select: { raceName: true, year: true },
  })
  const out = { researched: 0, found: 0, failed: 0, skipped: 0, orders: [] }
  if (!races.length) return out
  const keys = new Set(races.map(r => `${r.raceName}|${r.year}`))
  const orders = await prisma.order.findMany({
    where: {
      trackstarOrderType: 'standard',
      status: { notIn: ['completed', 'flagged'] },
      runnerResearch: { none: {} },
      OR: races.flatMap(r => [{ raceName: r.raceName, raceYear: r.year }, { raceNameOverride: r.raceName, yearOverride: r.year }]),
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: { orderNumber: true, raceName: true, raceNameOverride: true, raceYear: true, yearOverride: true },
  })
  const ready = orders.filter(o => {
    const race = o.raceNameOverride ?? o.raceName, year = o.yearOverride ?? o.raceYear
    return keys.has(`${race}|${year}`) && hasScraperForRace(race)
  })
  return researchEach(ready, limit, out)
}/**
 * Research the orders that arrived in this run of the 10-minute auto-import,
 * and only those: every order is researched once, as it comes in. Orders
 * already in the tool are never picked up here; a person re-runs research
 * from the order after fixing a name or year, or once a scraper exists.
 * An Instant Lookup result is recorded by customerResults.js before this
 * runs, so those orders already have research and are skipped.
 *
 * Races that have not happened yet, or ran in the last two days (results are
 * usually not posted yet), are left alone on arrival. autoResearchAfterRace
 * picks those orders up once results should be up, so a pre-race order is
 * not stamped "not found" and then never looked at again.
 */

const DAY = 24 * 60 * 60 * 1000
// Results are looked for this long after race day, and no longer: older
// unresearched orders are a person's call (Re-run research on the order).
const RESULTS_AFTER_DAYS = 2, CATCH_UP_DAYS = 21

async function researchEach(orders, limit, out) {
  for (const o of orders) {
    if (out.researched + out.failed >= limit) break
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
