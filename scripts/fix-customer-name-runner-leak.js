/**
 * fix-customer-name-runner-leak.js
 *
 * One-shot cleanup for orders where the runner name silently fell back to
 * the shipping customer name because personalization was bypassed. The
 * import bug was fixed in commit 57ea941 — this script finds orders that
 * landed before the fix and resets them so they surface as "Unknown Runner"
 * in the fulfillment queue.
 *
 * Match heuristic:
 *   runnerName == arteloOrderData.customerAddress.name (case-insensitive)
 *   AND status != 'completed'                    (don't touch shipped orders)
 *   AND no runnerNameOverride                    (manual edits win)
 *   AND personalization had no "Runner Name" property (Shopify) /
 *       no Personalization variation (Etsy)
 *
 * When applied, sets:
 *   runnerName = "Unknown Runner"
 *   status     = "missing_year" (so it appears in the attention queue)
 *
 * Usage:
 *   node scripts/fix-customer-name-runner-leak.js           # dry run
 *   node scripts/fix-customer-name-runner-leak.js --apply   # write changes
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

function norm(s) {
  return (s || '').trim().toLowerCase()
}

// Returns true if the Shopify line item explicitly carried a Runner Name property.
function shopifyHadRunnerName(order) {
  const lineItems = order.shopifyOrderData?.line_items || []
  const lineItem = lineItems[order.lineItemIndex]
  if (!lineItem?.properties) return false
  return lineItem.properties.some(p => {
    const name = (p.name || '').trim().toLowerCase()
    return name === 'runner name' ||
           name === 'runner_name' ||
           name === 'runner name (first & last)'
  })
}

// Returns true if the Etsy transaction carried a Personalization variation.
function etsyHadPersonalization(order) {
  const txs = order.etsyOrderData?.transactions || []
  const tx = txs[order.lineItemIndex]
  if (!tx?.variations) return false
  return tx.variations.some(v => (v.formatted_name || '').trim().toLowerCase() === 'personalization')
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes)'}\n`)

  // Pull only candidate orders to keep this fast. We need everything we
  // touch in the heuristic so include the JSON blobs.
  const candidates = await prisma.order.findMany({
    where: {
      status: { not: 'completed' },
      runnerNameOverride: null,
    },
    select: {
      id: true,
      orderNumber: true,
      source: true,
      status: true,
      runnerName: true,
      raceName: true,
      lineItemIndex: true,
      arteloOrderData: true,
      shopifyOrderData: true,
      etsyOrderData: true,
    },
  })

  console.log(`Scanned ${candidates.length} non-completed orders.\n`)

  const hits = []
  for (const o of candidates) {
    const shipName = o.arteloOrderData?.customerAddress?.name
    if (!shipName) continue
    if (norm(o.runnerName) !== norm(shipName)) continue
    // The personalization field WAS provided — skip (legitimate match where
    // buyer is also the runner).
    if (o.source === 'shopify' && shopifyHadRunnerName(o)) continue
    if (o.source === 'etsy' && etsyHadPersonalization(o)) continue
    hits.push(o)
  }

  console.log(`Found ${hits.length} orders where runnerName looks like a customer-name fallback:\n`)
  for (const o of hits) {
    console.log(`  ${o.orderNumber.padEnd(20)} ${(o.source || '').padEnd(8)} ${o.status.padEnd(14)} runner="${o.runnerName}"  race="${o.raceName}"`)
  }

  if (!APPLY) {
    console.log('\nDry run — no changes written. Re-run with --apply to update.')
    return
  }

  console.log('\nApplying updates...')
  let updated = 0
  for (const o of hits) {
    await prisma.order.update({
      where: { id: o.id },
      data: {
        runnerName: 'Unknown Runner',
        status: 'missing_year',
      },
    })
    updated++
  }
  console.log(`Updated ${updated} orders.`)
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
