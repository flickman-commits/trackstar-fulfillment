/**
 * Audit + fix WRONG PACES in runnerResearch records.
 *
 * Background: when the Boston scraper bug (April 2026) was fixed, we ran
 * fix-boston-times.js which only updated officialTime. The officialPace
 * still reflects the gun-time-derived pace. This script re-runs research
 * for every order with research, compares the freshly-computed pace to
 * what's stored, and updates any that differ.
 *
 * Limited by default to Boston orders (the only known affected race),
 * but will work on any race with a configured scraper.
 *
 * Usage:
 *   node scripts/audit-and-fix-paces.js                  # dry-run, all races
 *   node scripts/audit-and-fix-paces.js --apply          # apply fixes
 *   node scripts/audit-and-fix-paces.js --race=Boston    # filter by race
 *
 * Only updates orders where designStatus is 'not_started' to avoid
 * touching orders that have already been printed/sent to production.
 */
import { PrismaClient } from '@prisma/client'
import { getScraperForRace, hasScraperForRace } from '../server/scrapers/index.js'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')
const raceFilterArg = process.argv.find(a => a.startsWith('--race='))
const raceFilter = raceFilterArg ? raceFilterArg.slice(7) : null

function normalize(s) {
  if (!s) return ''
  return String(s).trim().replace(/^0+/, '').replace(/^:/, '').replace(/\/(mi|mile|km)$/i, '').trim()
}

async function main() {
  const where = raceFilter
    ? { OR: [
        { raceName: { contains: raceFilter, mode: 'insensitive' } },
        { raceNameOverride: { contains: raceFilter, mode: 'insensitive' } }
      ] }
    : {}

  const orders = await prisma.order.findMany({
    where,
    include: { runnerResearch: { orderBy: { id: 'desc' }, take: 1 } },
    orderBy: { createdAt: 'desc' }
  })

  console.log(`\n${APPLY ? 'APPLYING' : 'DRY-RUN'}: scanning ${orders.length} order(s)${raceFilter ? ` for race "${raceFilter}"` : ''}\n`)

  let mismatched = 0
  let updated = 0
  let skipped = 0
  let notFound = 0

  for (const order of orders) {
    const research = order.runnerResearch[0]
    if (!research || !research.officialTime) { skipped++; continue }
    if (order.designStatus !== 'not_started' && order.designStatus !== 'in_progress') {
      // Don't touch orders that have already been sent to a customer or production
      skipped++
      continue
    }

    const raceName = order.raceNameOverride || order.raceName
    const year = order.yearOverride || order.raceYear
    const runner = (order.runnerNameOverride || order.runnerName || '').replace(/\s*Bib#?\s*\d+/i, '').trim()

    if (!hasScraperForRace(raceName)) { skipped++; continue }

    let fresh
    try {
      const scraper = getScraperForRace(raceName, year)
      fresh = await scraper.searchRunner(runner)
    } catch (err) {
      console.log(`  ${order.orderNumber}: SCRAPER_ERROR ${err.message}`)
      skipped++
      continue
    }

    if (!fresh.found) { notFound++; continue }

    const storedTime = normalize(research.officialTime)
    const storedPace = normalize(research.officialPace)
    const freshTime = normalize(fresh.officialTime)
    const freshPace = normalize(fresh.officialPace)

    const timeChanged = storedTime !== freshTime
    const paceChanged = storedPace !== freshPace

    if (!timeChanged && !paceChanged) continue

    mismatched++
    const display = `#${order.orderNumber} (${runner}, ${raceName} ${year})`
    const changes = []
    if (timeChanged) changes.push(`time ${research.officialTime} → ${fresh.officialTime}`)
    if (paceChanged) changes.push(`pace ${research.officialPace} → ${fresh.officialPace}`)
    console.log(`  ${display}: ${changes.join(', ')}`)

    if (APPLY) {
      await prisma.runnerResearch.update({
        where: { id: research.id },
        data: {
          officialTime: fresh.officialTime,
          officialPace: fresh.officialPace
        }
      })
      updated++
    }

    // Be polite to upstream
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`\n=== SUMMARY ===`)
  console.log(`  Mismatched: ${mismatched}`)
  if (APPLY) console.log(`  Updated: ${updated}`)
  console.log(`  Not found by scraper: ${notFound}`)
  console.log(`  Skipped (no research / past stage / no scraper): ${skipped}`)
  if (!APPLY) console.log(`\nRe-run with --apply to update DB.`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
