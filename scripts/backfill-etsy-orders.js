/**
 * Backfill Etsy orders that were imported while Etsy auth was broken.
 *
 * These orders have:
 *   - source: 'etsy'
 *   - etsyOrderData: null   (Etsy fetch failed during import)
 *   - runnerName: usually 'Unknown Runner' (fallback) or the customer's name
 *   - raceName: 'Unknown Race'
 *   - raceYear: current year (default fallback)
 *
 * Now that auth is fixed, re-fetch each receipt and re-run the
 * personalization extraction so the order has correct runner/race/year.
 *
 * Usage:
 *   node scripts/backfill-etsy-orders.js          (dry run — shows what would change)
 *   node scripts/backfill-etsy-orders.js --apply  (actually writes the changes)
 */
import { PrismaClient } from '@prisma/client'
import { etsyFetch } from '../server/services/etsyAuth.js'
import { parseEtsyRaceName, parseEtsyPersonalization } from '../server/services/etsyPersonalization.js'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

async function main() {
  const shopId = process.env.ETSY_SHOP_ID
  if (!shopId) {
    console.error('ETSY_SHOP_ID env var is required')
    process.exit(1)
  }

  // Find ALL Etsy orders missing data (including completed — completed orders
  // still benefit from having proper raceName/runnerName for record-keeping).
  const affected = await prisma.order.findMany({
    where: {
      source: 'etsy',
      etsyOrderData: { equals: null }
    },
    orderBy: { createdAt: 'asc' }
  })

  console.log(`\nFound ${affected.length} Etsy orders missing etsyOrderData`)
  console.log(APPLY ? '🟢 APPLY mode — will write changes' : '🔵 DRY-RUN — nothing will be written. Pass --apply to commit.')
  console.log()

  // Group by parent receipt — one fetch per receipt covers all its line items
  const byReceipt = {}
  for (const o of affected) {
    (byReceipt[o.parentOrderNumber] ||= []).push(o)
  }

  let touched = 0, skipped = 0, failed = 0
  const changes = []

  for (const [receiptId, orders] of Object.entries(byReceipt)) {
    process.stdout.write(`Receipt ${receiptId} (${orders.length} line item${orders.length > 1 ? 's' : ''}) ... `)
    let receipt
    try {
      receipt = await etsyFetch(`/shops/${shopId}/receipts/${receiptId}`)
    } catch (err) {
      console.log(`❌ fetch failed: ${err.message}`)
      failed += orders.length
      continue
    }
    if (!receipt) {
      console.log('❌ no receipt body returned')
      failed += orders.length
      continue
    }
    console.log('✓')

    for (const order of orders) {
      const transaction = receipt.transactions?.[order.lineItemIndex]
      const update = {
        etsyOrderData: receipt,
        customerEmail: receipt.buyer_email || order.customerEmail
      }

      if (transaction) {
        // Race name from listing title — only override if currently "Unknown Race"
        const parsedRaceName = parseEtsyRaceName(transaction.title)
        if (parsedRaceName && order.raceName === 'Unknown Race') {
          update.raceName = parsedRaceName
        }

        // Personalization (runner + race year)
        const variations = transaction.variations || []
        const personalization = variations.find(v =>
          (v.formatted_name || '').toLowerCase() === 'personalization'
        )
        if (personalization?.formatted_value) {
          const parsed = parseEtsyPersonalization(personalization.formatted_value)

          // Update runnerName if currently a fallback. Fallback can be:
          //   - "Unknown Runner" (default)
          //   - customerEmail (older fallback)
          //   - the customer's shipping name (very old fallback)
          // We replace any of those with the personalized runner if parsed.
          const isFallbackRunner =
            !order.runnerName ||
            order.runnerName === 'Unknown Runner' ||
            order.runnerName === order.customerEmail ||
            order.runnerName === receipt.name
          if (parsed.runnerName && isFallbackRunner) {
            update.runnerName = parsed.runnerName
          }

          // Race year — override if it's the default fallback (current year)
          if (parsed.raceYear) {
            const currentYearFallback = new Date().getFullYear()
            if (order.raceYear === currentYearFallback || !order.raceYear) {
              update.raceYear = parsed.raceYear
            }
          }
        }
      }

      const fieldsChanging = Object.keys(update).filter(k =>
        k !== 'etsyOrderData' && update[k] !== order[k]
      )

      changes.push({
        orderNumber: order.orderNumber,
        before: {
          runnerName: order.runnerName,
          raceName: order.raceName,
          raceYear: order.raceYear,
          customerEmail: order.customerEmail
        },
        after: update,
        changedFields: fieldsChanging
      })

      console.log(`  ${order.orderNumber}:`)
      for (const f of fieldsChanging) {
        console.log(`    ${f}: ${JSON.stringify(order[f])} → ${JSON.stringify(update[f])}`)
      }
      if (fieldsChanging.length === 0) {
        console.log(`    (no field changes, but etsyOrderData being attached)`)
      }

      if (APPLY) {
        try {
          await prisma.order.update({ where: { id: order.id }, data: update })
          touched++
        } catch (err) {
          console.log(`    ❌ update failed: ${err.message}`)
          failed++
        }
      } else {
        skipped++
      }
    }

    // Rate-limit between receipt fetches (1 / sec)
    await new Promise(r => setTimeout(r, 1000))
  }

  console.log()
  console.log('=== SUMMARY ===')
  if (APPLY) {
    console.log(`  Updated: ${touched}`)
    console.log(`  Failed:  ${failed}`)
  } else {
    console.log(`  Would update: ${skipped}`)
    console.log(`  Would fail:   ${failed}`)
    console.log(`\n  Re-run with --apply to commit changes.`)
  }

  await prisma.$disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
