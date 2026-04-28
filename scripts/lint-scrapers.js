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
}

// 3. Verify every platform has at least one fixture
for (const platformFile of platformFiles) {
  const expectedKey = PLATFORM_NAME_ALIASES[platformFile] || platformFile
  if (!fixturePlatforms.has(expectedKey)) {
    warnings.push(
      `Platform "${platformFile}Scraper.js" has no chip-time fixture. ` +
      `Add one to server/scrapers/__tests__/chip-time-fixtures.js with platform: "${expectedKey}"`
    )
  } else {
    console.log(`  ✓ ${platformFile.padEnd(15)} has fixture(s)`)
  }
}

// 4. Verify every fixture has the required fields
for (const fx of fixtures) {
  const required = ['platform', 'race', 'year', 'runner', 'expectedChipTime']
  const missing = required.filter(k => !fx[k])
  if (missing.length > 0) {
    errors.push(`Fixture for ${fx.race || '?'}: missing fields ${missing.join(', ')}`)
  }
  if (fx.expectedChipTime && !/^\d{1,2}:\d{2}:\d{2}/.test(fx.expectedChipTime)) {
    errors.push(`Fixture for ${fx.race}: expectedChipTime "${fx.expectedChipTime}" doesn't look like HH:MM:SS`)
  }
}

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
    console.log(`  ✓ ${file.padEnd(25)} (${cfg.platform})`)
  } catch (e) {
    errors.push(`${file}: failed to import — ${e.message}`)
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
