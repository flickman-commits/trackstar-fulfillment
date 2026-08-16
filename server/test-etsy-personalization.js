/**
 * Test script for Etsy personalization parsing
 *
 * Run: node server/test-etsy-personalization.js
 */

import { parseEtsyRaceName, parseEtsyPersonalization } from './services/etsyPersonalization.js'

let passed = 0
let failed = 0

function test(description, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    console.log(`  PASS: ${description}`)
    passed++
  } else {
    console.log(`  FAIL: ${description}`)
    console.log(`    Expected: ${JSON.stringify(expected)}`)
    console.log(`    Actual:   ${JSON.stringify(actual)}`)
    failed++
  }
}

// ===========================
// parseEtsyRaceName tests — real Etsy listing titles
// ===========================
console.log('\n--- parseEtsyRaceName ---\n')

// Pattern 1: "Personalized {Race} Map Poster | Runner Gift"
test(
  'Personalized + Map Poster',
  parseEtsyRaceName('Personalized Boston Marathon Map Poster | Runner Gift'),
  'Boston Marathon'
)

test(
  'Personalized + Map Poster (Ft. Lauderdale)',
  parseEtsyRaceName('Personalized Ft. Lauderdale Marathon Poster | Runner Gift'),
  'Ft. Lauderdale Marathon'
)

test(
  'Personalized + Map Poster (Las Vegas)',
  parseEtsyRaceName('Personalized Las Vegas Marathon Poster | Runner Gift'),
  'Las Vegas Marathon'
)

// Pattern 2: "Custom {Race} Poster | Personalized Marathon Race Map | ..."
test(
  'Custom prefix + SEO-heavy title (Twin Cities)',
  parseEtsyRaceName('Custom Twin Cities Marathon Poster | Personalized Marathon Race Map | Custom Twin Cities Marathon Course Map | Twin Cities Runner Gift'),
  'Twin Cities Marathon'
)

test(
  'Custom prefix + SEO-heavy title (Philadelphia)',
  parseEtsyRaceName('Custom Philadelphia Marathon Poster | Personalized Marathon Race Map | Custom Philadelphia Marathon Course Map | Philadelphia Runner Gift'),
  'Philadelphia Marathon'
)

test(
  'Custom prefix + SEO-heavy title (Berlin)',
  parseEtsyRaceName('Custom Berlin Marathon Poster | Personalized Marathon Race Map | Custom Berlin Marathon Course Map | Runner Gift'),
  'Berlin Marathon'
)

test(
  'Custom prefix + Map Print',
  parseEtsyRaceName('Custom Kiawah Marathon Map Print: Personalized Runner Gift'),
  'Kiawah Marathon'
)

test(
  'Custom prefix + Map Poster with colon',
  parseEtsyRaceName('Custom Baltimore Marathon Map Poster: Personalized Runner Gift'),
  'Baltimore Marathon'
)

test(
  'Custom prefix + Map Poster with colon (Palm Beaches)',
  parseEtsyRaceName('Custom Palm Beaches Marathon Map Poster: Personalized Runner Gift'),
  'Palm Beaches Marathon'
)

// Pattern 3: No prefix — "{Race} Poster | ..."
test(
  'No prefix - Grandma\'s (with HTML entity)',
  parseEtsyRaceName("Grandma&#39;s Marathon Poster | Personalized Race Map, Runner Gift"),
  "Grandma's Marathon"
)

test(
  'No prefix - CIM',
  parseEtsyRaceName('CIM Marathon Poster | Personalized Race Map, Runner Gift'),
  'CIM Marathon'
)

test(
  'No prefix - Army Ten Miler',
  parseEtsyRaceName('Army Ten Miler Poster | Personalized Marathon Race Map | Custom Army Ten Miler Course Map | Army Ten Miler Runner Gift'),
  'Army Ten Miler'
)

// Pattern 4: Colon separator
test(
  'Personalized + Race Map Poster with colon',
  parseEtsyRaceName('Personalized Marine Corps Marathon Race Map Poster: Runner Gift'),
  'Marine Corps Marathon'
)

test(
  'Personalized + Race Map Print with colon',
  parseEtsyRaceName('Personalized Air Force Marathon Race Map Print: Custom Runner Gift'),
  'Air Force Marathon'
)

test(
  'Personalized + Map Poster with colon (Chicago)',
  parseEtsyRaceName('Personalized Chicago Marathon Map Poster: Runner Gift'),
  'Chicago Marathon'
)

// Pattern 5: Special — custom order
test(
  'Custom Trackstar Print (Any Race)',
  parseEtsyRaceName('Any Race - Custom Trackstar Print'),
  'Custom Trackstar Print (Any Race)'
)

// Edge cases
test(
  'null input',
  parseEtsyRaceName(null),
  null
)

test(
  'empty string',
  parseEtsyRaceName(''),
  null
)

// ===========================
// parseEtsyPersonalization tests
// ===========================
console.log('\n--- parseEtsyPersonalization ---\n')

test(
  'Name comma year',
  parseEtsyPersonalization('John Smith, 2024'),
  { runnerName: 'John Smith', raceYear: 2024, rawText: 'John Smith, 2024', needsAttention: false }
)

test(
  'Name slash year',
  parseEtsyPersonalization('Jane Doe / 2025'),
  { runnerName: 'Jane Doe', raceYear: 2025, rawText: 'Jane Doe / 2025', needsAttention: false }
)

test(
  'Year first',
  parseEtsyPersonalization('2024 Tom Brady'),
  { runnerName: 'Tom Brady', raceYear: 2024, rawText: '2024 Tom Brady', needsAttention: false }
)

test(
  'Name space year',
  parseEtsyPersonalization('Sarah Wilson 2024'),
  { runnerName: 'Sarah Wilson', raceYear: 2024, rawText: 'Sarah Wilson 2024', needsAttention: false }
)

test(
  'Labeled fields',
  parseEtsyPersonalization('Runner: Mike Jones Year: 2024'),
  { runnerName: 'Mike Jones', raceYear: 2024, rawText: 'Runner: Mike Jones Year: 2024', needsAttention: false }
)

test(
  'Name only - needs attention',
  parseEtsyPersonalization('Alice Johnson'),
  { runnerName: 'Alice Johnson', raceYear: null, rawText: 'Alice Johnson', needsAttention: true }
)

test(
  'Empty string - needs attention',
  parseEtsyPersonalization(''),
  { runnerName: null, raceYear: null, rawText: '', needsAttention: true }
)

test(
  'Year only - needs attention',
  parseEtsyPersonalization('2025'),
  { runnerName: null, raceYear: 2025, rawText: '2025', needsAttention: true }
)

test(
  'Runner Name label with colon',
  parseEtsyPersonalization('Runner Name: Bob Smith, 2024'),
  { runnerName: 'Bob Smith', raceYear: 2024, rawText: 'Runner Name: Bob Smith, 2024', needsAttention: false }
)

test(
  'Name with pipe separator',
  parseEtsyPersonalization('Lisa Chen | 2025'),
  { runnerName: 'Lisa Chen', raceYear: 2025, rawText: 'Lisa Chen | 2025', needsAttention: false }
)

// ===========================
// Summary
// ===========================
console.log(`\n${'='.repeat(40)}`)
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`)
console.log(`${'='.repeat(40)}\n`)

process.exit(failed > 0 ? 1 : 0)
