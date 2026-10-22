/**
 * Every bulk order has its own billing record (BulkDeal), so Edit order and
 * the invoice work the same on all of them. Bulk orders made before that
 * (BULK-0001 to 0004 and the Shopify-tagged ones) get one, with what the run
 * already knows: the organization, co-branded (they were all the designer's
 * file), each runner shipped to, and paid when the run is.
 *
 *   node --env-file=.env.local --env-file=.env scripts/backfill-bulk-billing.js           (dry run)
 *   node --env-file=.env.local --env-file=.env scripts/backfill-bulk-billing.js --apply
 */
import prisma from '../server/db.js'
// The same as attachBilling in server/domain/bulk/deals.js, numbered in one pass.

const apply = process.argv.includes('--apply')
const runs = await prisma.bulkOrder.findMany({ where: { dealId: null }, orderBy: { number: 'asc' } })
const last = await prisma.bulkDeal.findFirst({ orderBy: { createdAt: 'desc' }, select: { number: true } })
let n = Number(String(last?.number || 'DEAL-0000').split('-')[1]) || 0
for (const r of runs) {
  n += 1
  const number = `DEAL-${String(n).padStart(4, '0')}`
  console.log(`${r.number} ${r.partnerName} (${r.raceName} ${r.raceYear}) -> ${number}${r.paidAt ? ', paid' : ''}`)
  if (!apply) continue
  const deal = await prisma.bulkDeal.create({
    data: {
      number, partnerName: r.partnerName, printKind: 'cobranded', shipping: 'runner',
      paidAt: r.paidAt, shopifyOrderId: r.shopifyOrderId || null, shopifyOrderName: r.shopifyOrderName || null,
      notes: null,
    },
  })
  await prisma.bulkOrder.update({ where: { id: r.id }, data: { dealId: deal.id } })
}
console.log(apply ? `Done: ${runs.length}` : `Dry run: ${runs.length} would get a billing record. Pass --apply.`)
await prisma.$disconnect()
