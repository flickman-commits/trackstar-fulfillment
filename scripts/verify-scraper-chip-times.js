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

function normalizePace(p) {
  if (!p) return ''
  return String(p).trim().replace(/\/(mi|mile|km)$/i, '').trim()
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
      const gotPace = normalizePace(result.officialPace)
      const wantPace = normalizePace(fx.expectedChipPace)

      if (result.researchStatus === 'upstream_error') {
        // The site refused us. Reporting that as a failed fixture teaches
        // people to ignore a red suite, and the skill's own advice is to read
        // the log rather than trust the count - so make the count trustworthy
        // instead. A block is not a regression and does not fail the run, but
        // it is never silent either.
        console.log(`🚧 BLOCKED (${result.researchNotes || 'upstream refused'})`)
        results.push({ ...fx, pass: false, blocked: true, reason: result.researchNotes || 'upstream refused' })
      } else if (!result.found) {
        console.log('❌ NOT_FOUND')
        results.push({ ...fx, pass: false, reason: 'Runner not found' })
      } else if (got !== want) {
        console.log(`❌ TIME_MISMATCH (got ${got}, expected ${want})`)
        results.push({ ...fx, pass: false, reason: `Time mismatch: got ${got}, expected ${want}` })
      } else if (fx.expectedChipPace && gotPace !== wantPace) {
        console.log(`❌ PACE_MISMATCH (got ${gotPace || '<empty>'}, expected ${wantPace}) - likely gun-pace regression`)
        results.push({ ...fx, pass: false, reason: `Pace mismatch: got ${gotPace}, expected ${wantPace}` })
      } else if (fx.expectedBib && result.bibNumber !== fx.expectedBib) {
        console.log(`❌ BIB_MISMATCH (got ${result.bibNumber}, expected ${fx.expectedBib})`)
        results.push({ ...fx, pass: false, reason: `Bib mismatch: got ${result.bibNumber}, expected ${fx.expectedBib}` })
      } else {
        console.log(`✅ ${got} @ ${gotPace || '?'}/mi`)
        results.push({ ...fx, pass: true })
      }
    } catch (err) {
      console.log(`❌ ERROR: ${err.message}`)
      results.push({ ...fx, pass: false, reason: err.message })
    }
  }

  const passed = results.filter(r => r.pass).length
  const blocked = results.filter(r => r.blocked)
  const failures = results.filter(r => !r.pass && !r.blocked)
  const failed = failures.length
  console.log('\n=== SUMMARY ===')
  console.log(`  Passed:  ${passed}/${results.length}`)
  console.log(`  Failed:  ${failed}`)
  if (blocked.length) {
    console.log(`  Blocked: ${blocked.length} (upstream refused - not a regression)`)
    for (const b of blocked) {
      console.log(`    🚧 ${b.race} (${b.year}) - ${b.runner}: ${b.reason}`)
    }
  }

  if (failed > 0) {
    console.log('\n=== FAILURES ===')
    failures.forEach(r => {
      console.log(`  ${r.race} (${r.year}) - ${r.runner}: ${r.reason}`)
    })
    process.exit(1)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
