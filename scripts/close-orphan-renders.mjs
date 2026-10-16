/**
 * One-time: renders still waiting for review on orders that were completed
 * by hand before Approve completed orders (Oct 2026). Closes them so the
 * review queue holds only live work, and completes the orders whose render
 * was approved but never completed. Dry run by default; --apply to write.
 */
import prisma from '../api/_lib/prisma.js'
import { completeOrder } from '../server/domain/orders/complete.js'

const apply = process.argv.includes('--apply')
const orphans = await prisma.renderJob.findMany({ where: { review: 'pending', status: 'done', order: { status: 'completed' } }, select: { id: true, spec: true } })
const approvedOpen = await prisma.order.findMany({ where: { status: { not: 'completed' }, renderJobs: { some: { review: 'approved', status: 'done' } } }, select: { id: true, orderNumber: true } })
console.log(`${orphans.length} renders to close, ${approvedOpen.length} approved orders to complete${apply ? '' : ' (dry run)'}`)
if (!apply) process.exit(0)
const r = await prisma.renderJob.updateMany({ where: { id: { in: orphans.map(o => o.id) } }, data: { review: 'closed', reviewNote: 'Order completed by hand', reviewedAt: new Date() } })
console.log('closed', r.count)
for (const o of approvedOpen) {
  try { const out = await completeOrder({ orderId: o.id, via: 'approve' }); console.log('completed', o.orderNumber, out.already ? '(already)' : '') }
  catch (e) { console.log('could not complete', o.orderNumber, e.message) }
}
await prisma.$disconnect()
