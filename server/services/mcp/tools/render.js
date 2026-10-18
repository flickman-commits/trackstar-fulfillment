/**
 * Automated designs for standard orders: what waits for review, a yes or no
 * on one, a fresh render, and the production files they are made from.
 * Reviewing and rendering need the orders.render capability, the same as the
 * order panel (api/render/jobs.js); production files are admin only, the
 * same as Settings > Designs (api/render/templates.js).
 */
import { z } from 'zod'
import prisma from '../../../../api/_lib/prisma.js'
import { ToolError } from '../server.js'
import { checkOrder, createJob, latestJob, signedFiles } from '../../../domain/render/jobs.js'
import { reviewRender } from '../../../domain/render/review.js'
import { templatesOverview, recheckTemplate } from '../../../domain/render/templates.js'
import { inBackground } from '../../../lib/background.js'
import { findOrdersByNumber, displayNumber, pickItem } from './orders.js'

/** The values that print, from the render's spec. */
function printed(spec) {
  const s = spec || {}
  return { name: s.name || null, bib: s.bib || null, time: s.noTime ? 'NO TIME' : (s.time || null), pace: s.noTime ? null : (s.pace || null), date: s.date || null, weather: s.condition || null, temp: s.temp || null }
}

/** The standard order item a design tool acts on, and its newest render. */
async function itemAndJob(orderNumber, item) {
  const rows = (await findOrdersByNumber(orderNumber)).filter(o => o.trackstarOrderType === 'standard')
  if (!rows.length) throw new ToolError(`No standard order matching "${orderNumber}".`)
  const o = pickItem(rows, item)
  return { o, n: displayNumber(o) + (o.lineItemIndex ? `-${o.lineItemIndex + 1}` : ''), job: await latestJob(o.id) }
}

/** The newest render must be finished and waiting for a decision, and the one the caller looked at. */
function reviewable(job, n, version) {
  if (!job) throw new ToolError(`${n} has no render.`)
  if (version && job.version !== version) throw new ToolError(`The newest render of ${n} is v${job.version}, not v${version}. Look at it first (designs_to_review).`)
  if (job.status !== 'done') throw new ToolError(`The newest render of ${n} (v${job.version}) is ${job.status}, not finished.`)
  if (job.review !== 'pending') throw new ToolError(`The newest render of ${n} (v${job.version}) was already ${job.review}.`)
}

const ITEM = z.number().int().min(1).optional().describe('Which item on a multi-item order; the first by default.')
const VERSION = z.number().int().min(1).optional().describe('The render version you reviewed (from designs_to_review). Refused if a newer one exists.')

export const renderTools = [
  {
    name: 'designs_to_review',
    title: 'Designs to review',
    description: 'Standard orders whose newest render is finished and waiting for a yes or no: the preview image (a link good for 10 minutes) and the values that print.',
    scope: 'read',
    cap: 'orders.render',
    readOnly: true,
    input: { limit: z.number().int().min(1).max(25).default(10) },
    async handler({ limit = 10 }) {
      const pending = await prisma.renderJob.findMany({
        where: { status: 'done', review: 'pending', order: { trackstarOrderType: 'standard', status: { not: 'completed' } } },
        orderBy: { finishedAt: 'asc' },
        include: { order: { select: { id: true, parentOrderNumber: true, lineItemIndex: true, raceName: true, raceNameOverride: true, raceYear: true, yearOverride: true, runnerName: true, runnerNameOverride: true } } },
      })
      // Only the newest render of each order counts.
      const newest = await prisma.renderJob.groupBy({ by: ['orderId'], where: { orderId: { in: [...new Set(pending.map(j => j.orderId))] } }, _max: { version: true } })
      const top = new Map(newest.map(g => [g.orderId, g._max.version]))
      const jobs = pending.filter(j => top.get(j.orderId) === j.version)
      const page = jobs.slice(0, limit)
      const names = page.length ? await prisma.$queryRaw`SELECT id, "shopifyOrderData"::jsonb->>'name' AS name FROM "Order" WHERE id = ANY(${page.map(j => j.orderId)})` : []
      const nameOf = new Map(names.map(r => [r.id, r.name]))
      const designs = []
      for (const j of page) {
        const o = j.order
        const files = await signedFiles(j)
        designs.push({
          orderNumber: String(nameOf.get(o.id) || o.parentOrderNumber).replace(/^#/, ''),
          item: o.lineItemIndex + 1,
          version: j.version,
          runner: o.runnerNameOverride || o.runnerName,
          race: o.raceNameOverride || o.raceName,
          year: o.yearOverride || o.raceYear,
          renderedAt: j.finishedAt,
          previewUrl: files.previewUrl,
          prints: printed(j.spec),
          dateSource: j.spec?.dateSource || null,
          notes: j.notes || undefined,
        })
      }
      return { waiting: jobs.length, shown: designs.length, designs }
    },
  },
  {
    name: 'approve_design',
    title: 'Approve design',
    description: 'Approve the newest render of a standard order. It is copied to Drive and the Artelo library in the background; the order then waits for the file to be attached in Artelo. Does not complete the order.',
    scope: 'write',
    cap: 'orders.render',
    readOnly: false,
    input: { orderNumber: z.string().max(40), item: ITEM, version: VERSION },
    async handler({ orderNumber, item, version }, { principal }) {
      const { n, job } = await itemAndJob(orderNumber, item)
      reviewable(job, n, version)
      const { job: done, delivery } = await reviewRender({ jobId: job.id, decision: 'approved', user: principal.user })
      // Same as the order panel: Drive and Artelo finish after the answer (waitUntil on Vercel).
      if (delivery) inBackground(delivery)
      return { summary: `Approved the design of ${n} (v${done.version})`, orderNumber: n, version: done.version, review: 'approved', delivery: 'started in the background (Drive, then the Artelo library)', next: 'Attach the file to the item in Artelo, then mark the order done.' }
    },
  },
  {
    name: 'reject_design',
    title: 'Reject design',
    description: 'Reject the newest render of a standard order, with a note saying what is wrong.',
    scope: 'write',
    cap: 'orders.render',
    readOnly: false,
    input: { orderNumber: z.string().max(40), note: z.string().trim().min(3).max(2000).describe('What is wrong, for whoever fixes it.'), item: ITEM, version: VERSION },
    async handler({ orderNumber, note, item, version }, { principal }) {
      const { n, job } = await itemAndJob(orderNumber, item)
      reviewable(job, n, version)
      const { job: done } = await reviewRender({ jobId: job.id, decision: 'rejected', note, user: principal.user })
      return { summary: `Rejected the design of ${n} (v${done.version}): ${note}`, orderNumber: n, version: done.version, review: 'rejected', note }
    },
  },
  {
    name: 'rerender_order',
    title: 'Re-render order',
    description: 'Queue a new render of a standard order from its current data. Says why not if it cannot render.',
    scope: 'write',
    cap: 'orders.render',
    readOnly: false,
    input: { orderNumber: z.string().max(40), item: ITEM },
    async handler({ orderNumber, item }, { principal }) {
      const { o, n } = await itemAndJob(orderNumber, item)
      const { ok, reasons } = await checkOrder(o.id)
      if (!ok) throw new ToolError(`${n} cannot render: ${reasons.join('. ')}.`)
      const job = await createJob({ orderId: o.id, requestedBy: 'admin', requestedById: principal.user.id })
      return { summary: `Queued a render of ${job.spec?.file || n} (v${job.version})`, orderNumber: n, version: job.version, status: job.status }
    },
  },
  {
    name: 'production_files',
    title: 'Production files',
    description: 'Every production file (template) the renderer uses: its key, file, check status and problems, and open orders for it.',
    scope: 'admin',
    readOnly: true,
    input: {},
    async handler() {
      const { templates, unmapped, workers } = await templatesOverview()
      return {
        templates: templates.map(t => ({
          key: t.key, race: t.raceName, file: t.file, status: t.status, enabled: t.enabled,
          lastCheckAt: t.lastCheckAt,
          problems: Array.isArray(t.report?.problems) && t.report.problems.length ? t.report.problems.slice(0, 10) : undefined,
          warnings: Array.isArray(t.report?.warnings) && t.report.warnings.length ? t.report.warnings.slice(0, 10) : undefined,
          openOrders: t.openOrders,
        })),
        racesWithNoFile: unmapped.filter(u => u.openOrders > 0).map(u => ({ race: u.raceName, openOrders: u.openOrders })),
        workersOnline: workers.filter(w => w.online).map(w => w.name),
      }
    },
  },
  {
    name: 'recheck_production_file',
    title: 'Re-check production file',
    description: 'Forget a production file\'s last check, so the next render worker to check in checks it again.',
    scope: 'admin',
    readOnly: false,
    input: { key: z.string().min(1).max(120).describe('The template key, from production_files.') },
    async handler({ key }) {
      const t = await prisma.printTemplate.findUnique({ where: { key }, select: { key: true } })
      if (!t) throw new ToolError(`No production file with key "${key}".`)
      await recheckTemplate(key)
      return { summary: `Asked for a re-check of the ${key} production file`, key, status: 'checking' }
    },
  },
]
