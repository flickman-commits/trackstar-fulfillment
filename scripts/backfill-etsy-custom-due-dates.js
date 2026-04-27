/**
 * backfill-etsy-custom-due-dates.js
 *
 * One-time script to set `dueDate` on existing Etsy custom orders that
 * were ingested before the fix landed. Mirrors the live ingestion logic:
 * dueDate = etsyOrderData.create_timestamp (seconds) + 14 days.
 *
 * Skips:
 *   - Non-Etsy orders
 *   - Non-custom orders (standard orders don't carry a dueDate)
 *   - Orders that already have a dueDate set (manual or otherwise)
 *   - Orders without an etsyOrderData blob (can't compute the timestamp)
 *
 * Usage:
 *   node scripts/backfill-etsy-custom-due-dates.js              # dry run
 *   node scripts/backfill-etsy-custom-due-dates.js --apply      # write
 */
import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config() // fallback to .env

const prisma = new PrismaClient()

const APPLY = process.argv.includes('--apply')

async function main() {
  console.log(`[Backfill] Mode: ${APPLY ? 'APPLY (writes enabled)' : 'DRY RUN (no writes)'}\n`)

  const orders = await prisma.order.findMany({
    where: {
      source: 'etsy',
      trackstarOrderType: 'custom',
      dueDate: null,
    },
    select: {
      id: true,
      orderNumber: true,
      raceName: true,
      runnerName: true,
      etsyOrderData: true,
    }
  })

  console.log(`[Backfill] Found ${orders.length} Etsy custom orders without dueDate\n`)

  let skippedNoTimestamp = 0
  let updated = 0
  const samples = []

  for (const order of orders) {
    const ts = order.etsyOrderData?.create_timestamp
    if (!ts) {
      skippedNoTimestamp++
      continue
    }

    const dueDate = new Date(ts * 1000 + 14 * 24 * 60 * 60 * 1000)

    updated++
    if (samples.length < 20) {
      samples.push({
        orderNumber: order.orderNumber,
        race: order.raceName,
        runner: order.runnerName,
        createdAt: new Date(ts * 1000).toISOString().split('T')[0],
        dueDate: dueDate.toISOString().split('T')[0],
      })
    }

    if (APPLY) {
      await prisma.order.update({
        where: { id: order.id },
        data: { dueDate }
      })
    }
  }

  console.log('[Backfill] === SUMMARY ===')
  console.log(`  Total Etsy custom orders missing dueDate: ${orders.length}`)
  console.log(`  Skipped (no etsy timestamp):              ${skippedNoTimestamp}`)
  console.log(`  ${APPLY ? 'Updated' : 'Would update'}:                              ${updated}`)

  if (samples.length > 0) {
    console.log(`\n[Backfill] Sample changes (first ${samples.length}):`)
    for (const s of samples) {
      console.log(`  #${s.orderNumber}  ${s.race} — ${s.runner}`)
      console.log(`     created ${s.createdAt}  →  due ${s.dueDate}`)
    }
  }

  if (!APPLY && updated > 0) {
    console.log('\n[Backfill] Dry run complete. Re-run with --apply to write changes.')
  }

  await prisma.$disconnect()
}

main().catch(err => {
  console.error('[Backfill] Fatal error:', err)
  process.exit(1)
})
