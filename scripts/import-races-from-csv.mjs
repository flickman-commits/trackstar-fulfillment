/**
 * import-races-from-csv.mjs
 *
 * One-off importer: read products_export.csv (Shopify products export),
 * extract a clean race name from every Title row, dedupe, then make sure
 * every race exists in the Race table so the creator-program onboarding
 * dropdown can offer them all.
 *
 * Usage:
 *   node scripts/import-races-from-csv.mjs           # dry-run (preview only)
 *   node scripts/import-races-from-csv.mjs --apply   # write to DB
 */
import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CSV_PATH = path.join(__dirname, '..', 'products_export.csv')
const APPLY = process.argv.includes('--apply')

// -----------------------------------------------------------------------------
// CSV parsing — RFC 4180 (handles quoted fields w/ embedded commas + newlines)
// -----------------------------------------------------------------------------
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else { inQuotes = false }
      } else {
        field += c
      }
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') { /* skip */ }
      else field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

// -----------------------------------------------------------------------------
// Race name extraction — strip the boilerplate the Shopify titles wrap around
// the actual race name. Examples:
//   "Boston Marathon Personalized Race Print"        → "Boston Marathon"
//   "Personalized NYC Marathon Race Poster"          → "NYC Marathon"
//   "Air Force Marathon Personalized Race Print"     → "Air Force Marathon"
//   "Boston World Major Personalized Race Print"     → "Boston World Major"
// -----------------------------------------------------------------------------
function extractRaceName(title) {
  if (!title) return null
  let s = title.trim()

  // Strip leading "Personalized "
  s = s.replace(/^personalized\s+/i, '')

  // Strip trailing "Personalized Race Print/Poster" variants
  s = s.replace(/\s+personalized\s+(race\s+)?(print|poster).*$/i, '')

  // Strip plain trailing "Race Print/Poster"
  s = s.replace(/\s+(race\s+)?(print|poster)s?\s*$/i, '')

  // Collapse internal whitespace
  s = s.replace(/\s+/g, ' ').trim()

  return s || null
}

// -----------------------------------------------------------------------------
// Non-races we should skip entirely — Shopify products that aren't races.
// -----------------------------------------------------------------------------
const NON_RACE_NAMES = new Set([
  'Custom Trackstar Print (Any Race)',
  'Trackstar Gift Card',
])

// -----------------------------------------------------------------------------
// Canonicalization — collapse Shopify-product variants of the same race onto
// the canonical race name used in the Race table.
//
//   "Boston" / "Boston World Major"  → "Boston Marathon"
//   "Eugene Marathon (+ Half Marathon)" → "Eugene Marathon"
//   "Pittsburgh Marathon (+Half Marathon)" → "Pittsburgh Marathon"
//
// World Majors are sold as separate products on the storefront but the
// creator dropdown should show one entry per real race, not one per SKU.
// -----------------------------------------------------------------------------
function canonicalize(name) {
  let s = name.trim()

  // "X World Major" → "X Marathon" (Boston, Chicago, NYC, Berlin, London,
  // Tokyo, Sydney). Catch the bare city too (e.g. just "Boston" with no
  // Marathon suffix) by mapping to City + Marathon.
  s = s.replace(/\s+world\s+major$/i, ' Marathon')
  if (/^(boston|chicago|berlin|london|tokyo|sydney|new york city)$/i.test(s)) {
    s = `${s} Marathon`
  }

  // Strip "(+ Half Marathon)" / "(+Half Marathon)" annotations — the dropdown
  // is about the race, not the distance the creator ran.
  s = s.replace(/\s*\(\+\s*half\s+marathon\)\s*$/i, '')

  return s.trim()
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
  console.log(APPLY ? '🔥 APPLY mode — will write to DB' : '🧪 DRY RUN — preview only (pass --apply to write)')
  console.log()

  // 1. Read + parse CSV
  const text = fs.readFileSync(CSV_PATH, 'utf8')
  const rows = parseCsv(text)
  const header = rows[0]
  const titleIdx = header.indexOf('Title')
  if (titleIdx < 0) throw new Error('No "Title" column found')
  console.log(`CSV: ${rows.length - 1} data rows, "Title" at column ${titleIdx}`)

  // 2. Extract + dedupe race names
  const rawTitles = new Set()
  for (let r = 1; r < rows.length; r++) {
    const t = rows[r][titleIdx]
    if (t && t.trim()) rawTitles.add(t.trim())
  }
  console.log(`Unique non-empty titles: ${rawTitles.size}`)

  // Two-pass extraction:
  //   1. Strip the "Personalized Race Print" boilerplate (extractRaceName)
  //   2. Drop non-races (gift card, custom-any-race)
  //   3. Canonicalize variants (World Major → Marathon, strip + Half, etc.)
  //   4. De-dupe again — multiple SKUs can collapse onto one canonical race
  const raceNames = new Set()
  const skippedNonRaces = []
  for (const t of rawTitles) {
    const cleaned = extractRaceName(t)
    if (!cleaned) continue
    if (NON_RACE_NAMES.has(cleaned)) { skippedNonRaces.push(cleaned); continue }
    const canonical = canonicalize(cleaned)
    if (canonical) raceNames.add(canonical)
  }
  console.log(`Unique cleaned race names: ${raceNames.size} (skipped ${skippedNonRaces.length} non-races: ${skippedNonRaces.join(', ')})`)
  console.log()

  // 3. Show sample of cleaning so Matt can sanity-check
  console.log('=== Sample of extraction (first 15) ===')
  let shown = 0
  for (const t of rawTitles) {
    if (shown >= 15) break
    console.log(`  "${t}"`)
    console.log(`    → "${extractRaceName(t)}"`)
    shown++
  }
  console.log()

  // 4. Diff against the Race table
  const prisma = new PrismaClient()
  const existingRaces = await prisma.race.findMany({ select: { raceName: true } })
  const existingNames = new Set(existingRaces.map(r => r.raceName))
  console.log(`Race table currently has ${existingNames.size} distinct race names.`)

  const missing = [...raceNames].filter(n => !existingNames.has(n))
  console.log(`Missing from Race table: ${missing.length}`)
  console.log()
  if (missing.length > 0) {
    console.log('=== Missing races ===')
    for (const m of missing.sort()) console.log(`  + ${m}`)
    console.log()
  }

  if (!APPLY) {
    console.log('DRY RUN. Re-run with --apply to insert these into the Race table.')
    await prisma.$disconnect()
    return
  }

  // 5. Insert missing races
  // Race rows need: raceName (string), year (int), raceDate (DateTime),
  // eventTypes (Json). For these "placeholder" rows (we don't actually
  // have results data for them), we use:
  //   - year: current year (the dropdown shows fixed range regardless)
  //   - raceDate: Jan 1 of current year (placeholder)
  //   - eventTypes: ['Marathon'] (most common — Matt can edit if wrong)
  //
  // The (raceName, year) pair is unique, so re-running won't dupe.
  const currentYear = new Date().getFullYear()
  console.log(`🔥 Inserting ${missing.length} race rows (year=${currentYear})...`)
  let inserted = 0
  for (const name of missing) {
    try {
      await prisma.race.create({
        data: {
          raceName: name,
          year: currentYear,
          raceDate: new Date(currentYear, 0, 1, 12, 0, 0),
          eventTypes: ['Marathon'],
        },
      })
      inserted++
    } catch (e) {
      console.warn(`  ! skipped "${name}": ${e.message}`)
    }
  }
  console.log(`✅ Inserted ${inserted} of ${missing.length} missing races.`)

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
