/**
 * fix-line-item-mismatch.js
 *
 * One-shot cleanup for multi-line-item orders where the runner name (and other
 * personalization fields) got glued onto the wrong line item because Artelo's
 * `orderItems[]` array was returned in a different order than the upstream
 * Shopify `line_items[]` / Etsy `transactions[]` arrays.
 *
 * Caught on order #3348 (parent 7196688417051):
 *   - Customer ordered:
 *       12x18 / Black Premium Oak  →  Victor Knotter-Finney
 *       8x10  / Black Oak          →  Hannah Knotter
 *   - Artelo returned the items in reversed order, so positional indexing
 *     glued Victor's name onto the 8x10 row and Hannah's onto the 12x18.
 *
 * Code fix lives in server/processOrders.js (buildShopifyMatchMap /
 * buildEtsyMatchMap). This script repairs any historical rows that were
 * imported before that fix.
 *
 * Safety rules:
 *   - Skip any row that has runnerNameOverride / raceNameOverride / yearOverride
 *     set (user manually corrected — their edit wins)
 *   - Only update personalization-derived fields (runnerName, raceName,
 *     raceYear, hadNoTime, bibNumberCustomer, timeCustomer, creativeDirection,
 *     isGift). Do NOT touch productSize / frameType — those come from Artelo
 *     and are already correct (the Artelo row IS the row that gets shipped).
 *   - Dry run by default; pass `--apply` to write.
 *
 * Usage:
 *   node scripts/fix-line-item-mismatch.js           # dry run
 *   node scripts/fix-line-item-mismatch.js --apply   # write changes
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

// -----------------------------------------------------------------------------
// Matcher — must match server/processOrders.js exactly
// -----------------------------------------------------------------------------
function normalizePrintSize(raw) {
  if (!raw) return ''
  return String(raw).replace(/^x/i, '').toLowerCase().trim()
}

function shopifySkuContainsSize(sku, size) {
  if (!sku || !size) return false
  return new RegExp(`(^|[-_])${size}([-_]|$)`, 'i').test(sku)
}

function buildMatchMapByScore(arteloItems, upstreamItems, scoreSizeMatchFns) {
  const n = arteloItems?.length || 0
  const result = new Array(n).fill(-1)
  if (!upstreamItems?.length || !n) return result
  const candidates = []
  for (let i = 0; i < n; i++) {
    const aSize = normalizePrintSize(arteloItems[i]?.product?.size)
    for (let j = 0; j < upstreamItems.length; j++) {
      let score = 0
      if (aSize) for (const fn of scoreSizeMatchFns) score += fn(upstreamItems[j], aSize)
      score -= Math.abs(i - j)
      candidates.push({ i, j, score })
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.i - b.i || a.j - b.j)
  const usedI = new Set(), usedJ = new Set()
  for (const c of candidates) {
    if (usedI.has(c.i) || usedJ.has(c.j)) continue
    result[c.i] = c.j; usedI.add(c.i); usedJ.add(c.j)
  }
  return result
}

function buildShopifyMatchMap(arteloItems, shopifyLineItems) {
  return buildMatchMapByScore(arteloItems, shopifyLineItems, [
    (li, size) => shopifySkuContainsSize(li?.sku, size) ? 100 : 0,
    (li, size) => (li?.variant_title || '').toLowerCase().includes(size) ? 50 : 0,
  ])
}

function buildEtsyMatchMap(arteloItems, etsyTransactions) {
  return buildMatchMapByScore(arteloItems, etsyTransactions, [
    (t, size) => shopifySkuContainsSize(t?.sku, size) ? 100 : 0,
    (t, size) => {
      const haystacks = [
        t?.title || '',
        ...(t?.variations || []).map(v => `${v?.formatted_name || ''} ${v?.formatted_value || ''}`)
      ].join(' ').toLowerCase()
      return haystacks.includes(size) ? 50 : 0
    },
  ])
}

// -----------------------------------------------------------------------------
// Personalization extractors — simplified versions of the ones in processOrders.js
// We only need to pull out runner name, race name, raceYear, etc. from the
// correctly-paired line item.
// -----------------------------------------------------------------------------

// Strip "(YYYY)" or trailing year from raw runner name; also detect "no time".
function cleanRunnerName(rawName) {
  if (!rawName) return { runnerName: null, hadNoTime: false }
  let s = String(rawName).trim()
  const hadNoTime = /\bno\s*time\b/i.test(s)
  s = s.replace(/\s*\(no\s*time\)\s*/gi, '').replace(/\bno\s*time\b/gi, '').trim()
  return { runnerName: s || null, hadNoTime }
}

function parseRaceNameAndYear(rawValue) {
  if (!rawValue) return { runnerName: null, raceYear: null }
  const trimmed = String(rawValue).trim()
  // Detect trailing 4-digit year
  const m = trimmed.match(/\s+(\d{4})\s*$/)
  if (m) {
    return { runnerName: trimmed.slice(0, m.index).trim(), raceYear: parseInt(m[1], 10) }
  }
  return { runnerName: trimmed, raceYear: null }
}

function extractShopifyPersonalization(lineItem) {
  const result = {
    raceName: null, runnerName: null, raceYear: null, hadNoTime: false,
    bibNumberCustomer: null, timeCustomer: null, creativeDirection: null,
    isGift: false, productTitle: null,
  }
  if (!lineItem) return result
  result.productTitle = lineItem.title || null
  // Default race name from the product title (gets canonicalized later)
  result.raceName = (lineItem.title || '').replace(/\s+personalized\s+(poster|print|race\s+print).*$/i, '').trim() || null

  if (Array.isArray(lineItem.properties)) {
    for (const prop of lineItem.properties) {
      const name = (prop?.name || '').trim()
      const value = (prop?.value || '').trim()
      if (!value) continue
      if (/^runner\s*name$/i.test(name)) {
        const parsed = parseRaceNameAndYear(value)
        const cleaned = cleanRunnerName(parsed.runnerName)
        result.runnerName = cleaned.runnerName
        result.hadNoTime = cleaned.hadNoTime
        if (parsed.raceYear) result.raceYear = parsed.raceYear
      } else if (/^race\s*year$/i.test(name)) {
        const y = parseInt(value, 10)
        if (Number.isFinite(y)) result.raceYear = y
      } else if (/^no\s*time$/i.test(name)) {
        if (/no\s*time/i.test(value)) result.hadNoTime = true
      } else if (/^bib\s*#/i.test(name) || /^bib\s*number$/i.test(name)) {
        result.bibNumberCustomer = value
      } else if (/^time$/i.test(name)) {
        result.timeCustomer = value
      } else if (/creative\s*direction/i.test(name) || /direction/i.test(name)) {
        result.creativeDirection = value
      } else if (/gift/i.test(name)) {
        if (/yes|true|gift/i.test(value)) result.isGift = true
      }
    }
  }
  return result
}

function extractEtsyPersonalization(transaction) {
  const result = { raceName: null, runnerName: null, raceYear: null }
  if (!transaction) return result
  result.raceName = (transaction.title || '').replace(/\s+personalized\s+(poster|print|race\s+print).*$/i, '').trim() || null
  const variations = transaction.variations || []
  for (const v of variations) {
    if (/personalization/i.test(v?.formatted_name || '')) {
      const value = (v.formatted_value || '').trim()
      // Etsy personalization is typically: "Runner Name 2025"
      const parsed = parseRaceNameAndYear(value)
      const cleaned = cleanRunnerName(parsed.runnerName)
      result.runnerName = cleaned.runnerName
      if (parsed.raceYear) result.raceYear = parsed.raceYear
    }
  }
  return result
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
  console.log(APPLY ? '🔥 APPLY mode — will write changes' : '🧪 DRY RUN — no DB writes (pass --apply to commit)')
  console.log()

  // Pull all rows, grouped by parent order
  const all = await prisma.order.findMany({
    select: {
      id: true, orderNumber: true, parentOrderNumber: true, lineItemIndex: true,
      source: true, status: true,
      runnerName: true, raceName: true, raceYear: true, hadNoTime: true,
      runnerNameOverride: true, raceNameOverride: true, yearOverride: true,
      bibNumberCustomer: true, timeCustomer: true, creativeDirection: true, isGift: true,
      trackstarOrderType: true,
      arteloOrderData: true, shopifyOrderData: true, etsyOrderData: true,
    },
  })

  const byParent = new Map()
  for (const r of all) {
    if (!byParent.has(r.parentOrderNumber)) byParent.set(r.parentOrderNumber, [])
    byParent.get(r.parentOrderNumber).push(r)
  }

  let scanned = 0
  let mismatched = 0
  let fixed = 0
  let skipped = 0
  const fixes = []

  for (const [parent, rows] of byParent) {
    if (rows.length < 2) continue // single-item orders are immune
    scanned++

    rows.sort((a, b) => a.lineItemIndex - b.lineItemIndex)
    const first = rows[0]
    const artelo = first.arteloOrderData?.orderItems || []

    let matchMap = null
    let isShopify = first.source === 'shopify'
    let isEtsy = first.source === 'etsy'
    let upstreamItems = null

    if (isShopify && first.shopifyOrderData?.line_items) {
      upstreamItems = first.shopifyOrderData.line_items
      matchMap = buildShopifyMatchMap(artelo, upstreamItems)
    } else if (isEtsy && first.etsyOrderData?.transactions) {
      upstreamItems = first.etsyOrderData.transactions
      matchMap = buildEtsyMatchMap(artelo, upstreamItems)
    } else {
      continue // no upstream data to repair from
    }

    // Detect mismatch: any position where matchMap[i] !== i
    const isMismatched = matchMap.some((j, i) => j !== -1 && j !== i)
    if (!isMismatched) continue
    mismatched++

    const orderName = first.shopifyOrderData?.name || first.etsyOrderData?.receipt_id || parent
    console.log(`\n=== ${orderName} (parent ${parent}) — Artelo↔upstream mismatch detected ===`)
    console.log(`    matchMap: ${JSON.stringify(matchMap)}`)

    for (const row of rows) {
      const i = row.lineItemIndex
      const j = matchMap[i]
      if (j < 0 || j >= upstreamItems.length) continue
      const upstream = upstreamItems[j]

      // Skip rows with any user override
      if (row.runnerNameOverride || row.raceNameOverride || row.yearOverride) {
        console.log(`  idx ${i}: SKIP — has user override (runner=${row.runnerNameOverride}, race=${row.raceNameOverride}, year=${row.yearOverride})`)
        skipped++
        continue
      }

      const extracted = isShopify
        ? extractShopifyPersonalization(upstream)
        : extractEtsyPersonalization(upstream)

      // Compute the diff (only update fields where the new value is non-null
      // AND differs from the current value)
      const diff = {}
      if (extracted.runnerName && extracted.runnerName !== row.runnerName) diff.runnerName = extracted.runnerName
      if (extracted.raceYear && extracted.raceYear !== row.raceYear) diff.raceYear = extracted.raceYear
      if (typeof extracted.hadNoTime === 'boolean' && extracted.hadNoTime !== row.hadNoTime) diff.hadNoTime = extracted.hadNoTime
      // Personalization-only fields for custom orders
      if (row.trackstarOrderType === 'custom') {
        if (extracted.bibNumberCustomer && extracted.bibNumberCustomer !== row.bibNumberCustomer) diff.bibNumberCustomer = extracted.bibNumberCustomer
        if (extracted.timeCustomer && extracted.timeCustomer !== row.timeCustomer) diff.timeCustomer = extracted.timeCustomer
        if (extracted.creativeDirection && extracted.creativeDirection !== row.creativeDirection) diff.creativeDirection = extracted.creativeDirection
        if (typeof extracted.isGift === 'boolean' && extracted.isGift !== row.isGift) diff.isGift = extracted.isGift
      }

      console.log(`  idx ${i}: ${row.orderNumber}`)
      console.log(`    current: runner=${JSON.stringify(row.runnerName)} raceYear=${row.raceYear} hadNoTime=${row.hadNoTime}`)
      console.log(`    correct: runner=${JSON.stringify(extracted.runnerName)} raceYear=${extracted.raceYear} hadNoTime=${extracted.hadNoTime}`)

      if (Object.keys(diff).length === 0) {
        console.log(`    → no changes needed`)
        continue
      }
      console.log(`    → diff: ${JSON.stringify(diff)}`)
      fixes.push({ id: row.id, orderNumber: row.orderNumber, diff })
      fixed++
    }
  }

  console.log(`\n========================================`)
  console.log(`Scanned ${scanned} multi-item orders`)
  console.log(`Found ${mismatched} with Artelo↔upstream index mismatch`)
  console.log(`${fixed} rows would be updated, ${skipped} skipped (user override)`)

  if (APPLY && fixes.length) {
    console.log(`\n🔥 Applying ${fixes.length} updates...`)
    for (const fix of fixes) {
      await prisma.order.update({ where: { id: fix.id }, data: fix.diff })
      console.log(`  ✓ ${fix.orderNumber}`)
    }
    console.log('Done.')
  } else if (!APPLY && fixes.length) {
    console.log(`\nDRY RUN. Re-run with --apply to write changes.`)
  }

  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
