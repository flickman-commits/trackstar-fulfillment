/**
 * Run through every chip-time fixture and verify each scraper returns
 * the expected chip time (not gun time, not clock time, not net time mismatch).
 *
 * Usage:
 *   node scripts/verify-scraper-chip-times.js
 *
 * Exit code 0 = all pass, 1 = failures.
 *
 * Run this:
 *   - Whenever you add a new scraper (add fixtures first)
 *   - Whenever you modify time-extraction logic in any scraper
 *   - As part of the weekly health check
 */
import { CHIP_TIME_FIXTURES } from '../server/scrapers/__tests__/chip-time-fixtures.js'
import { getScraperForRace } from '../server/scrapers/index.js'

function normalizeTime(t) {
  if (!t) return ''
  return String(t).replace(/^0+/, '').replace(/^:/, '').trim()
}

async function main() {
  console.log(`\nRunning ${CHIP_TIME_FIXTURES.length} chip-time fixtures...\n`)

  const results = []

  for (const fx of CHIP_TIME_FIXTURES) {
    const label = `${fx.race} (${fx.year}) - ${fx.runner}`
    process.stdout.write(`  ${label.padEnd(60)} ... `)
    try {
      const scraper = getScraperForRace(fx.race, fx.year)
      const result = await scraper.searchRunner(fx.runner)
      const got = normalizeTime(result.officialTime)
      const want = normalizeTime(fx.expectedChipTime)

      if (!result.found) {
        console.log('❌ NOT_FOUND')
        results.push({ ...fx, pass: false, reason: 'Runner not found' })
      } else if (got !== want) {
        console.log(`❌ TIME_MISMATCH (got ${got}, expected ${want})`)
        results.push({ ...fx, pass: false, reason: `Time mismatch: got ${got}, expected ${want}` })
      } else if (fx.expectedBib && result.bibNumber !== fx.expectedBib) {
        console.log(`❌ BIB_MISMATCH (got ${result.bibNumber}, expected ${fx.expectedBib})`)
        results.push({ ...fx, pass: false, reason: `Bib mismatch: got ${result.bibNumber}, expected ${fx.expectedBib}` })
      } else {
        console.log(`✅ ${got}`)
        results.push({ ...fx, pass: true })
      }
    } catch (err) {
      console.log(`❌ ERROR: ${err.message}`)
      results.push({ ...fx, pass: false, reason: err.message })
    }
  }

  const passed = results.filter(r => r.pass).length
  const failed = results.length - passed
  console.log('\n=== SUMMARY ===')
  console.log(`  Passed: ${passed}/${results.length}`)
  console.log(`  Failed: ${failed}`)

  if (failed > 0) {
    console.log('\n=== FAILURES ===')
    results.filter(r => !r.pass).forEach(r => {
      console.log(`  ${r.race} (${r.year}) - ${r.runner}: ${r.reason}`)
    })
    process.exit(1)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
