/**
 * verify-race-dates.mjs
 *
 * Every race date in the database must come from a source. This checks each
 * Race row against the verified raceDates pins in the scraper configs:
 *   - a row whose date differs from its pin is corrected (source "config")
 *   - a row that matches its pin but has no source is stamped "config"
 *   - a row with a date and no source and no pin is reported: it came from
 *     the old computed rules and needs a person to verify it
 *
 * Usage:
 *   node scripts/verify-race-dates.mjs           # dry run, no writes
 *   node scripts/verify-race-dates.mjs --apply   # write the corrections
 */
import 'dotenv/config'
import prisma from '../server/db.js'
import { getVerifiedRaceDates, getCanonicalRaceName } from '../server/scrapers/index.js'

const APPLY = process.argv.includes('--apply')
const pins = getVerifiedRaceDates()
const day = d => d.toISOString().slice(0, 10)

const races = await prisma.race.findMany({ orderBy: [{ raceName: 'asc' }, { year: 'asc' }] })
const fixes = []
const unverified = []
for (const r of races) {
  const pin = (pins[r.raceName] || pins[getCanonicalRaceName(r.raceName) || ''] || {})[r.year]
  if (pin) {
    if (!r.raceDate || day(r.raceDate) !== pin || !r.raceDateSource) {
      fixes.push({ r, pin })
    }
  } else if (r.raceDate && !r.raceDateSource) {
    unverified.push(r)
  }
}
for (const { r, pin } of fixes) {
  console.log(`${APPLY ? 'FIX ' : 'would fix'} ${r.id} ${r.raceName} ${r.year}: ${r.raceDate ? day(r.raceDate) : 'none'} (${r.raceDateSource || 'no source'}) -> ${pin} (config)`)
  if (APPLY) await prisma.race.update({ where: { id: r.id }, data: { raceDate: new Date(`${pin}T12:00:00Z`), raceDateSource: 'config' } })
}
console.log(`\n${unverified.length} dates with no source and no config pin (need a person to verify):`)
for (const r of unverified) console.log(`  ${r.id} ${r.raceName} ${r.year} ${day(r.raceDate)}`)
await prisma.$disconnect()
