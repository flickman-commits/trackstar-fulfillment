/**
 * Bulk runs: prepaid co-branded prints for one race partner. Read only.
 */
import { z } from 'zod'
import prisma from '../../../../api/_lib/prisma.js'
import { ToolError } from '../server.js'
import { bulkIntakeUrl } from '../../../lib/links.js'
import { addressComplete } from '../../../domain/bulk/bulkOrders.js'
import { daysLate } from './orders.js'

const STATUS_LABEL = { collecting: 'Collecting runner info', fulfillment: 'In fulfillment', submitted: 'Sent to Artelo' }

function progress(runners) {
  return {
    runners: runners.length,
    withAddress: runners.filter(r => addressComplete(r.shippingAddress)).length,
    researched: runners.filter(r => r.researchedAt).length,
    withFile: runners.filter(r => r.productionFileUrl).length,
    completed: runners.filter(r => r.status === 'completed').length,
  }
}

function shape(b, runners) {
  return {
    number: b.number,
    partner: b.partnerName,
    race: `${b.raceName} ${b.raceYear}`,
    status: STATUS_LABEL[b.status] || b.status,
    quantityInvoiced: b.quantity,
    paid: Boolean(b.paidAt),
    product: `${b.productSize} ${b.frameType}`,
    raceDate: b.raceDate || null,
    dueDate: b.dueDate || null,
    daysLate: b.dueDate && b.status !== 'submitted' ? daysLate(b.dueDate) : undefined,
    assignee: b.assignee?.firstName || null,
    hasProductionFile: Boolean(b.productionFileUrl),
    progress: progress(runners),
    intakeLink: bulkIntakeUrl(b.intakeToken),
    notes: b.notes || undefined,
  }
}

const RUNNER_SELECT = { shippingAddress: true, researchedAt: true, productionFileUrl: true, status: true }

export const bulkTools = [
  {
    name: 'bulk_orders_status',
    title: 'Bulk orders status',
    description: 'Every bulk run not yet sent to Artelo: partner, race, due date, paid or not, who runs it, and how far along the runners are (addresses, research, files). Pass a number for one run, sent ones included.',
    scope: 'read',
    readOnly: true,
    input: { number: z.string().max(20).optional().describe('A run number like BULK-0007 for one run in full.') },
    async handler({ number } = {}) {
      if (number) {
        const b = await prisma.bulkOrder.findFirst({ where: { number: { equals: number.trim(), mode: 'insensitive' } }, include: { assignee: { select: { firstName: true } } } })
        if (!b) throw new ToolError(`No bulk run called "${number}".`)
        const runners = await prisma.order.findMany({ where: { bulkOrderId: b.id }, select: { ...RUNNER_SELECT, runnerName: true, runnerNameOverride: true, lineItemIndex: true }, orderBy: { lineItemIndex: 'asc' } })
        return {
          ...shape(b, runners),
          runnersMissingAddress: runners.filter(r => !addressComplete(r.shippingAddress)).map(r => r.runnerNameOverride || r.runnerName),
          runnersNotResearched: runners.filter(r => !r.researchedAt).map(r => r.runnerNameOverride || r.runnerName),
        }
      }
      const list = await prisma.bulkOrder.findMany({ where: { status: { not: 'submitted' } }, orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }], include: { assignee: { select: { firstName: true } } } })
      const all = list.length ? await prisma.order.findMany({ where: { bulkOrderId: { in: list.map(b => b.id) } }, select: { ...RUNNER_SELECT, bulkOrderId: true } }) : []
      return { open: list.length, runs: list.map(b => shape(b, all.filter(r => r.bulkOrderId === b.id))) }
    },
  },
]
