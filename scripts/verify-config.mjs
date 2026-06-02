/**
 * verify-config.mjs — run a single race scraper against the LIVE results site
 * to confirm a new/edited config actually resolves a known finisher.
 *
 * Usage:
 *   node scripts/verify-config.mjs "<race name>" <year> "<runner full name>"
 * Example:
 *   node scripts/verify-config.mjs "Miami Marathon" 2025 "Jane Smith"
 *
 * Prints the resolved race info + the runner lookup result (found/bib/time/
 * pace/event/status). A "found: true" with a sane time = the config works.
 */
import { getScraperForRace, hasScraperForRace } from '../server/scrapers/index.js'

const [, , race, yearArg, ...nameParts] = process.argv
const year = Number(yearArg)
const name = nameParts.join(' ')

if (!race || !year || !name) {
  console.error('Usage: node scripts/verify-config.mjs "<race>" <year> "<runner name>"')
  process.exit(1)
}

console.log(`hasScraperForRace("${race}") =`, hasScraperForRace(race))

const scraper = getScraperForRace(race, year)
const info = await scraper.getRaceInfo()
console.log('\n=== RACE INFO ===')
console.log(JSON.stringify(info, null, 2))

console.log(`\n=== LOOKUP: "${name}" (${year}) ===`)
const res = await scraper.searchRunner(name)
console.log(JSON.stringify({
  found: res.found,
  researchStatus: res.researchStatus,
  bib: res.bibNumber,
  time: res.officialTime,
  pace: res.officialPace,
  eventType: res.eventType,
  candidates: Array.isArray(res.possibleMatches) ? res.possibleMatches.slice(0, 5) : undefined,
  notes: res.researchNotes,
}, null, 2))
