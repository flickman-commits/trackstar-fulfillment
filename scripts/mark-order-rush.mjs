#!/usr/bin/env node
/**
 * mark-order-rush.mjs — flag an existing order as a rush order by hand.
 *
 * The storefront sets isRushOrder at import from the print's "Rush Order"
 * property or the rush add-on line item. This is for the orders that predate
 * that, or where the customer paid for rush some other way (over email, a
 * manual invoice, a draft order) and the flag never got set.
 *
 * It does two things, which is exactly what the import would have done:
 *   isRushOrder = true
 *   dueDate     = the Shopify order's created_at + RUSH_DUE_DAYS
 *
 * Dry run by default, like the rest of scripts/. Pass --apply to write.
 *
 *   node scripts/mark-order-rush.mjs --order 3944
 *   node scripts/mark-order-rush.mjs --order 3944 --apply
 *   node scripts/mark-order-rush.mjs --order 3944 --apply --undo
 *
 * --order takes the Shopify order NAME (the number a human reads, 3944), not
 * the long order id, because that is what anyone looking at an order actually
 * has in front of them.
 */
import { PrismaClient } from '@prisma/client'

// Must match RUSH_DUE_DAYS / CUSTOM_DUE_DAYS in server/processOrders.js.
const RUSH_DUE_DAYS = 4
const CUSTOM_DUE_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }

const orderName = val('--order')
const apply = flag('--apply')
const undo = flag('--undo')

if (!orderName) {
  console.error('Usage: node scripts/mark-order-rush.mjs --order <shopify order name> [--apply] [--undo]')
  process.exit(1)
}

const prisma = new PrismaClient()

const rows = await prisma.$queryRaw`
  SELECT "id", "orderNumber", "trackstarOrderType", "isRushOrder", "dueDate",
         "runnerName", "raceName", "customerName",
         "shopifyOrderData"->>'created_at' AS placed_at
  FROM "Order"
  WHERE "shopifyOrderData"->>'order_number' = ${orderName}
     OR "shopifyOrderData"->>'name' IN (${orderName}, ${'#' + orderName})
`

if (!rows.length) {
  console.error(`No order found with Shopify order name ${orderName}.`)
  process.exit(1)
}

// A Shopify order can be several prints, and rush is bought for the ORDER, so
// every line on it moves together. Anything else would leave a designer with
// one urgent row and one that is not, out of one purchase.
console.log(`Order ${orderName}: ${rows.length} line item(s)\n`)

const updates = []
for (const r of rows) {
  if (!r.placed_at) {
    console.log(`  ${r.orderNumber}  SKIP: no Shopify created_at, cannot recompute a due date`)
    continue
  }
  if (r.trackstarOrderType !== 'custom') {
    console.log(`  ${r.orderNumber}  SKIP: trackstarOrderType is "${r.trackstarOrderType}", not custom`)
    continue
  }
  const days = undo ? CUSTOM_DUE_DAYS : RUSH_DUE_DAYS
  const dueDate = new Date(new Date(r.placed_at).getTime() + days * DAY_MS)
  const isRushOrder = !undo

  console.log(`  ${r.orderNumber}  ${r.runnerName} / ${r.raceName}`)
  console.log(`      placed   ${new Date(r.placed_at).toISOString()}`)
  console.log(`      isRush   ${r.isRushOrder}  ->  ${isRushOrder}`)
  console.log(`      dueDate  ${r.dueDate ? r.dueDate.toISOString() : 'null'}  ->  ${dueDate.toISOString()}`)
  updates.push({ id: r.id, data: { isRushOrder, dueDate } })
}

if (!updates.length) {
  console.log('\nNothing to do.')
} else if (!apply) {
  console.log(`\nDRY RUN. ${updates.length} row(s) would change. Re-run with --apply to write.`)
} else {
  for (const u of updates) await prisma.order.update({ where: { id: u.id }, data: u.data })
  console.log(`\nApplied to ${updates.length} row(s).`)
}

await prisma.$disconnect()
