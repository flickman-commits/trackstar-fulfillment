/**
 * Static lint for scraper fixtures.
 *
 * Runs as part of `npm run build` to catch the case where a developer
 * adds a new scraper platform but forgets to add a chip-time fixture.
 *
 * Fast (no network calls) — just file reads + import checks.
 *
 * Fails the build if:
 *   - A platform under server/scrapers/platforms/ has no fixture
 *   - A scraper config file fails to import
 *
 * The actual chip-time correctness is verified by:
 *   - scripts/verify-scraper-chip-times.js (manual, network-dependent)
 *   - the weekly health-check cron
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PLATFORMS_DIR = path.resolve(__dirname, '../server/scrapers/platforms')
const FIXTURES_PATH = path.resolve(__dirname, '../server/scrapers/__tests__/chip-time-fixtures.js')

const errors = []
const warnings = []

// 1. Read all platform files
const platformFiles = fs.readdirSync(PLATFORMS_DIR)
  .filter(f => f.endsWith('Scraper.js') && f !== 'BaseScraper.js')
  .map(f => f.replace('Scraper.js', '').toLowerCase())

console.log(`\nLinting ${platformFiles.length} scraper platforms...\n`)

// 2. Read fixtures and extract platform identifiers
let fixtures
try {
  const mod = await import(FIXTURES_PATH)
  fixtures = mod.CHIP_TIME_FIXTURES
} catch (e) {
  errors.push(`Failed to load fixtures: ${e.message}`)
  fixtures = []
}

const fixturePlatforms = new Set(fixtures.map(f => f.platform.toLowerCase()))

// Map known platform name aliases (file name → fixture identifier)
const PLATFORM_NAME_ALIASES = {
  'mikatiming': 'mika',
  'myraceai': 'myrace',
  'racerosters': 'raceroster',
  'tokyomarathon': 'tokyo',
  'multisportaustralia': 'multisport-australia',
}

// Platforms that predate the fixture requirement. These are grandfathered:
// they only WARN. Every NEW platform must ship with a fixture or the build
// fails (see the add-race-scraper skill). Backfilling these removes them here.
// Do NOT add to this list — the whole point is that new scrapers get a fixture.
const FIXTURE_GRANDFATHERED = new Set([
  'brooksee', 'laureltiming', 'mtecresults', 'mychiptime', 'myrace',
  'nyrr', 'runsignup', 'scorethis', 'xacte',
])

// 3. Verify every platform has at least one fixture.
// Missing fixture is a hard error for new platforms, a warning for
// grandfathered ones.
for (const platformFile of platformFiles) {
  const expectedKey = PLATFORM_NAME_ALIASES[platformFile] || platformFile
  if (!fixturePlatforms.has(expectedKey)) {
    const msg =
      `Platform "${platformFile}Scraper.js" has no chip-time fixture. ` +
      `Add one to server/scrapers/__tests__/chip-time-fixtures.js with platform: "${expectedKey}" ` +
      `(include an uneven-splits runner - see the add-race-scraper skill).`
    if (FIXTURE_GRANDFATHERED.has(platformFile) || FIXTURE_GRANDFATHERED.has(expectedKey)) {
      warnings.push(msg + ' [grandfathered - backfill when possible]')
    } else {
      errors.push(msg)
    }
  } else {
    console.log(`  ✓ ${platformFile.padEnd(15)} has fixture(s)`)
  }
}

// 4. Verify every fixture has the required fields.
// Both expectedChipTime AND expectedChipPace are required — two sources of
// gun/chip drift, so we lock both down. Boston bug (April 2026) is why.
for (const fx of fixtures) {
  const required = ['platform', 'race', 'year', 'runner', 'expectedChipTime', 'expectedChipPace']
  const missing = required.filter(k => !fx[k])
  if (missing.length > 0) {
    errors.push(`Fixture for ${fx.race || '?'}: missing fields ${missing.join(', ')}`)
  }
  if (fx.expectedChipTime && !/^\d{1,2}:\d{2}:\d{2}/.test(fx.expectedChipTime)) {
    errors.push(`Fixture for ${fx.race}: expectedChipTime "${fx.expectedChipTime}" doesn't look like HH:MM:SS`)
  }
  if (fx.expectedChipPace && !/^\d{1,2}:\d{2}$/.test(fx.expectedChipPace)) {
    errors.push(`Fixture for ${fx.race}: expectedChipPace "${fx.expectedChipPace}" doesn't look like MM:SS`)
  }
}

// The window the coverage grid cares about, matching scrapers/index.js.
const COVERED_YEARS = (() => {
  const now = new Date().getFullYear()
  return [now, now - 1, now - 2, now - 3]
})()

// 5. Verify every config file imports cleanly
const CONFIGS_DIR = path.resolve(__dirname, '../server/scrapers/configs')
const configFiles = fs.readdirSync(CONFIGS_DIR).filter(f => f.endsWith('.js'))
console.log(`\nValidating ${configFiles.length} race configs...\n`)

for (const file of configFiles) {
  try {
    const mod = await import(path.join(CONFIGS_DIR, file))
    const cfg = mod.default
    if (!cfg) { errors.push(`${file}: no default export`); continue }
    if (!cfg.platform) errors.push(`${file}: missing 'platform'`)
    if (!cfg.raceName) errors.push(`${file}: missing 'raceName'`)
    if (!cfg.aliases || !Array.isArray(cfg.aliases) || cfg.aliases.length === 0) {
      errors.push(`${file}: missing or empty 'aliases'`)
    }
    // Race dates must be VERIFIED, not computed.
    //
    // calculateDate encodes a rule like "third Sunday of August", and races
    // move. Sydney switched from mid-September to late August in 2025 and the
    // rule silently returned a date three weeks wrong for every earlier
    // edition. The date is printed on the poster, so a wrong one ships.
    //
    // resolveRaceDate prefers a scraped date, then a raceDates entry, and only
    // computes as a last resort. This warns for every year that would still
    // land on that last resort, so the remaining gap is visible and countable
    // rather than invisible.
    const missing = COVERED_YEARS.filter(y => !cfg.raceDates?.[y])
    if (missing.length) {
      warnings.push(
        `${file}: no verified raceDates for ${missing.join(', ')} - ` +
        `these fall back to a computed date. Look the real dates up and pin them.`
      )
    }

    console.log(`  ✓ ${file.padEnd(25)} (${cfg.platform})${missing.length ? `  [${missing.length} computed year(s)]` : '  [dates verified]'}`)
  } catch (e) {
    errors.push(`${file}: failed to import - ${e.message}`)
  }
}

// 6. Report
console.log()
if (warnings.length > 0) {
  console.log('=== WARNINGS ===')
  warnings.forEach(w => console.log(`  ⚠️  ${w}`))
  console.log()
}
if (errors.length > 0) {
  console.log('=== ERRORS ===')
  errors.forEach(e => console.log(`  ❌ ${e}`))
  console.log(`\nLint FAILED with ${errors.length} error(s).`)
  process.exit(1)
}

console.log(`Lint PASSED. ${warnings.length} warning(s).`)
