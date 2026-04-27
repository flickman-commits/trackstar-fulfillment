/**
 * backfill-race-names.js
 *
 * One-time script to re-parse `raceName` for existing Shopify orders using
 * the updated parser (handles new "Personalized {Race} Poster" listing-title
 * format, plus normalizes bare names like "Boston" → "Boston Marathon").
 *
 * Reads each order's stored `shopifyOrderData.line_items`, re-runs the same
 * parsing logic that the live ingestion uses, and updates the DB if the
 * canonical name differs from what's stored.
 *
 * Skips:
 *   - Non-Shopify orders (Etsy/manual/creator_sample)
 *   - Custom orders (raceName is customer-provided, not title-derived)
 *   - Orders where raceNameOverride is already set (manual override wins)
 *
 * Usage:
 *   node scripts/backfill-race-names.js              # dry run, no writes
 *   node scripts/backfill-race-names.js --apply      # actually write changes
 */
import { PrismaClient } from '@prisma/client'
import { normalizeRaceName } from '../server/scrapers/raceNameNormalization.js'

const prisma = new PrismaClient()

const APPLY = process.argv.includes('--apply')

// Must mirror parseRaceName in api/orders/refresh-shopify-data.js + server/processOrders.js
function parseRaceName(productTitle) {
  if (!productTitle) return null

  let raceName = productTitle.trim()
  raceName = raceName.replace(/^Personalized\s+/i, '').trim()

  const suffixes = ['Personalized Race Print', 'Race Print', 'Personalized Poster', 'Poster', 'Print']
  for (const suffix of suffixes) {
    if (raceName.toLowerCase().endsWith(suffix.toLowerCase())) {
      raceName = raceName.slice(0, -suffix.length).trim()
      break
    }
  }

  return normalizeRaceName(raceName) || null
}

// Match the ingestion logic: a "Race Name" line-item property overrides the title parse.
function getRaceNameFromLineItem(lineItem) {
  if (!lineItem) return null

  const props = lineItem.properties
  if (Array.isArray(props)) {
    for (const prop of props) {
      const name = (prop.name || '').trim()
      const value = (prop.value || '').trim()
      if ((name === 'Race Name' || name === 'race name' || name === 'race_name') && value) {
        return value
      }
    }
  }

  return parseRaceName(lineItem.title)
}

async function main() {
  console.log(`[Backfill] Mode: ${APPLY ? 'APPLY (writes enabled)' : 'DRY RUN (no writes)'}\n`)

  const orders = await prisma.order.findMany({
    where: { source: 'shopify' },
    select: {
      id: true,
      orderNumber: true,
      raceName: true,
      raceNameOverride: true,
      lineItemIndex: true,
      trackstarOrderType: true,
      shopifyOrderData: true,
    }
  })

  console.log(`[Backfill] Found ${orders.length} Shopify orders\n`)

  let skippedCustom = 0
  let skippedOverride = 0
  let skippedNoData = 0
  let unchanged = 0
  let changed = 0
  const samples = []

  for (const order of orders) {
    if (order.trackstarOrderType === 'custom') {
      skippedCustom++
      continue
    }
    if (order.raceNameOverride) {
      skippedOverride++
      continue
    }

    const shopifyData = order.shopifyOrderData
    const lineItem = shopifyData?.line_items?.[order.lineItemIndex || 0]
    if (!lineItem) {
      skippedNoData++
      continue
    }

    const newName = getRaceNameFromLineItem(lineItem)
    if (!newName || newName === order.raceName) {
      unchanged++
      continue
    }

    changed++
    if (samples.length < 20) {
      samples.push({
        orderNumber: order.orderNumber,
        title: lineItem.title,
        before: order.raceName,
        after: newName,
      })
    }

    if (APPLY) {
      await prisma.order.update({
        where: { id: order.id },
        data: { raceName: newName }
      })
    }
  }

  console.log('[Backfill] === SUMMARY ===')
  console.log(`  Total Shopify orders: ${orders.length}`)
  console.log(`  Skipped (custom):           ${skippedCustom}`)
  console.log(`  Skipped (manual override):  ${skippedOverride}`)
  console.log(`  Skipped (no shopify data):  ${skippedNoData}`)
  console.log(`  Unchanged:                  ${unchanged}`)
  console.log(`  ${APPLY ? 'Updated' : 'Would update'}:                ${changed}`)

  if (samples.length > 0) {
    console.log(`\n[Backfill] Sample changes (first ${samples.length}):`)
    for (const s of samples) {
      console.log(`  #${s.orderNumber}  "${s.title}"`)
      console.log(`     ${s.before}  →  ${s.after}`)
    }
  }

  if (!APPLY && changed > 0) {
    console.log('\n[Backfill] Dry run complete. Re-run with --apply to write changes.')
  }

  await prisma.$disconnect()
}

main().catch(err => {
  console.error('[Backfill] Fatal error:', err)
  process.exit(1)
})
