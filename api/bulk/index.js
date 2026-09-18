/**
 * /api/bulk - bulk partner orders.
 *
 *   GET                         list, newest due first, with progress counts
 *   GET ?id=                    one order with its runners and readiness
 *   GET ?options=1              frame and size choices for the form
 *   POST { action, ... }
 *     create      { partnerName, raceName, raceYear, quantity, frameType, productSize, partnerOrderId?, stripeInvoiceUrl? }
 *     update      { id, ...fields }          any editable field
 *     paid        { id, paid: bool }
 *     intake      { id, text }               paste or CSV; returns what was added and any problems
 *     remove-runner { id, orderNumber }
 *     update-runner { id, orderNumber, runnerName?, address? }
 *     research    { id, limit? }             research the next batch of unresearched runners
 *     submitted   { id }                     the sheet went to Artelo
 *     new-intake-link { id }                 rotate the partner's intake token
 *     delete      { id }                     admins only; removes the runners too
 */
import prisma from '../_lib/prisma.js'
import { setCors, requireAdmin } from '../_lib/auth.js'
import { requireAdminRole } from '../_lib/users.js'
import {
  nextNumber, dueDateFor, verifiedRaceDate, parseRunnerList, addRunners, readiness, researchPending,
  addressComplete, FRAME_OPTIONS, SIZE_OPTIONS, sheetProblems,
} from '../../server/domain/bulk/bulkOrders.js'
import { getCanonicalRaceName } from '../../server/scrapers/index.js'

const RUNNER_SELECT = {
  id: true, orderNumber: true, lineItemIndex: true, runnerName: true, runnerNameOverride: true, customerEmail: true,
  shippingAddress: true, productionFileUrl: true, researchedAt: true, status: true, dueDate: true,
  runnerResearch: { select: { bibNumber: true, officialTime: true, officialPace: true, researchStatus: true, eventType: true }, take: 1, orderBy: { createdAt: 'desc' } },
}

function shapeRunner(r) {
  const rr = r.runnerResearch?.[0] || null
  return {
    id: r.id,
    orderNumber: r.orderNumber,
    lineItemIndex: r.lineItemIndex,
    runnerName: r.runnerNameOverride || r.runnerName,
    email: r.customerEmail,
    address: r.shippingAddress || null,
    addressComplete: addressComplete(r.shippingAddress),
    fileUrl: r.productionFileUrl,
    researched: Boolean(r.researchedAt),
    researchStatus: rr?.researchStatus || null,
    bib: rr?.bibNumber || null,
    time: rr?.officialTime || null,
    pace: rr?.officialPace || null,
    eventType: rr?.eventType || null,
    completed: r.status === 'completed',
  }
}

async function loadOne(id) {
  const bulk = await prisma.bulkOrder.findUnique({ where: { id } })
  if (!bulk) return null
  const runners = await prisma.order.findMany({ where: { bulkOrderId: id }, orderBy: { lineItemIndex: 'asc' }, select: RUNNER_SELECT })
  const ready = await readiness(bulk, runners)
  return {
    ...bulk,
    runners: runners.map(shapeRunner),
    readiness: ready,
    progress: progressOf(runners),
    sheetProblems: sheetProblems(runners),
  }
}

function progressOf(runners) {
  return {
    total: runners.length,
    withAddress: runners.filter(r => addressComplete(r.shippingAddress)).length,
    researched: runners.filter(r => r.researchedAt).length,
    found: runners.filter(r => r.runnerResearch?.[0]?.researchStatus === 'found').length,
    files: runners.filter(r => r.productionFileUrl).length,
    completed: runners.filter(r => r.status === 'completed').length,
  }
}

const EDITABLE = ['partnerName', 'raceName', 'raceYear', 'quantity', 'frameType', 'productSize', 'stripeInvoiceUrl', 'productionFileUrl', 'previewImageUrl', 'raceDate', 'dueDate', 'status', 'intakeNote', 'notes', 'partnerOrderId']

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS' })) return
  const actor = requireAdmin(req, res)
  if (!actor) return

  try {
    if (req.method === 'GET') {
      if (req.query?.options) return res.status(200).json({ frames: FRAME_OPTIONS, sizes: SIZE_OPTIONS })
      if (req.query?.id) {
        const one = await loadOne(String(req.query.id))
        if (!one) return res.status(404).json({ error: 'Bulk order not found' })
        return res.status(200).json({ bulkOrder: one })
      }
      const list = await prisma.bulkOrder.findMany({ orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }] })
      const out = []
      for (const b of list) {
        const runners = await prisma.order.findMany({ where: { bulkOrderId: b.id }, select: { shippingAddress: true, researchedAt: true, productionFileUrl: true, status: true, runnerResearch: { select: { researchStatus: true }, take: 1, orderBy: { createdAt: 'desc' } } } })
        out.push({ ...b, progress: progressOf(runners) })
      }
      return res.status(200).json({ bulkOrders: out })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const action = String(body.action || '')

    if (action === 'create') {
      const partnerName = String(body.partnerName || '').trim()
      const raceName = String(body.raceName || '').trim()
      const raceYear = Number(body.raceYear)
      if (!partnerName || !raceName || !Number.isFinite(raceYear)) return res.status(400).json({ error: 'partnerName, raceName and raceYear are required' })
      const frameType = FRAME_OPTIONS.includes(body.frameType) ? body.frameType : 'Natural Premium Oak'
      const productSize = SIZE_OPTIONS.includes(body.productSize) ? body.productSize : (frameType === 'Unframed' ? '8x10' : '12x18')
      const last = await prisma.bulkOrder.findFirst({ orderBy: { createdAt: 'desc' }, select: { number: true } })
      const canonical = getCanonicalRaceName(raceName) || raceName
      const raceDate = verifiedRaceDate(canonical, raceYear)
      const bulk = await prisma.bulkOrder.create({
        data: {
          number: nextNumber(last?.number),
          partnerName, raceName: canonical, raceYear,
          quantity: Math.max(0, parseInt(body.quantity, 10) || 0),
          frameType, productSize,
          stripeInvoiceUrl: body.stripeInvoiceUrl ? String(body.stripeInvoiceUrl) : null,
          partnerOrderId: body.partnerOrderId ? String(body.partnerOrderId) : null,
          raceDate, dueDate: dueDateFor(raceDate),
        },
      })
      return res.status(200).json({ bulkOrder: await loadOne(bulk.id) })
    }

    if (!body.id) return res.status(400).json({ error: 'id is required' })
    const bulk = await prisma.bulkOrder.findUnique({ where: { id: String(body.id) } })
    if (!bulk) return res.status(404).json({ error: 'Bulk order not found' })

    if (action === 'update') {
      const data = {}
      for (const k of EDITABLE) {
        if (!(k in body)) continue
        let v = body[k]
        if (k === 'raceYear' || k === 'quantity') v = v === null || v === '' ? null : Number(v)
        if (k === 'raceDate' || k === 'dueDate') v = v ? new Date(v) : null
        if (k === 'frameType' && !FRAME_OPTIONS.includes(v)) continue
        if (k === 'productSize' && !SIZE_OPTIONS.includes(v)) continue
        if (typeof v === 'string') v = v.trim() || null
        if (k === 'partnerName' && !v) continue
        if (k === 'raceName' && v) v = getCanonicalRaceName(v) || v
        data[k] = v
      }
      // A race date set by hand resets the due date unless one was also given.
      if ('raceDate' in data && !('dueDate' in data)) data.dueDate = dueDateFor(data.raceDate)
      const updated = await prisma.bulkOrder.update({ where: { id: bulk.id }, data })
      // Runners follow the order's race, year, product and due date.
      const follow = {}
      if (data.raceName) follow.raceName = data.raceName
      if (data.raceYear) follow.raceYear = data.raceYear
      if (data.frameType) follow.frameType = data.frameType
      if (data.productSize) follow.productSize = data.productSize
      if ('dueDate' in data) follow.dueDate = data.dueDate
      if (Object.keys(follow).length) await prisma.order.updateMany({ where: { bulkOrderId: bulk.id }, data: follow })
      return res.status(200).json({ bulkOrder: await loadOne(updated.id) })
    }

    if (action === 'paid') {
      await prisma.bulkOrder.update({ where: { id: bulk.id }, data: { paidAt: body.paid ? new Date() : null } })
      return res.status(200).json({ bulkOrder: await loadOne(bulk.id) })
    }

    if (action === 'intake') {
      const { rows, problems } = parseRunnerList(body.text)
      const created = await addRunners(bulk, rows)
      if (created.length && bulk.status === 'collecting' && rows.every(r => addressComplete(r.address))) {
        // Leave status alone; "collecting" ends when the person says so.
      }
      return res.status(200).json({ added: created.length, skipped: rows.length - created.length, problems, bulkOrder: await loadOne(bulk.id) })
    }

    if (action === 'update-runner') {
      const runner = await prisma.order.findFirst({ where: { bulkOrderId: bulk.id, orderNumber: String(body.orderNumber || '') } })
      if (!runner) return res.status(404).json({ error: 'Runner not found' })
      const data = {}
      if (body.runnerName && String(body.runnerName).trim()) data.runnerName = String(body.runnerName).trim()
      if (body.address && typeof body.address === 'object') {
        const a = body.address
        data.shippingAddress = { line1: String(a.line1 || '').trim(), line2: String(a.line2 || '').trim(), city: String(a.city || '').trim(), state: String(a.state || '').trim(), zip: String(a.zip || '').trim(), country: String(a.country || 'United States').trim() }
      }
      if ('fileUrl' in body) data.productionFileUrl = body.fileUrl ? String(body.fileUrl) : null
      await prisma.order.update({ where: { id: runner.id }, data })
      return res.status(200).json({ bulkOrder: await loadOne(bulk.id) })
    }

    if (action === 'remove-runner') {
      const runner = await prisma.order.findFirst({ where: { bulkOrderId: bulk.id, orderNumber: String(body.orderNumber || '') } })
      if (!runner) return res.status(404).json({ error: 'Runner not found' })
      await prisma.runnerResearch.deleteMany({ where: { orderId: runner.id } })
      await prisma.order.delete({ where: { id: runner.id } })
      return res.status(200).json({ bulkOrder: await loadOne(bulk.id) })
    }

    if (action === 'research') {
      if (!bulk.paidAt) return res.status(400).json({ error: 'Mark the invoice paid before researching. Nothing ships until it is.' })
      const out = await researchPending(bulk, { limit: Math.min(25, Math.max(1, parseInt(body.limit, 10) || 10)) })
      if (bulk.status === 'collecting') await prisma.bulkOrder.update({ where: { id: bulk.id }, data: { status: 'researching' } })
      return res.status(200).json({ ...out, bulkOrder: await loadOne(bulk.id) })
    }

    if (action === 'submitted') {
      await prisma.bulkOrder.update({ where: { id: bulk.id }, data: { status: 'submitted', submittedAt: new Date() } })
      return res.status(200).json({ bulkOrder: await loadOne(bulk.id) })
    }

    if (action === 'new-intake-link') {
      const { randomUUID } = await import('crypto')
      await prisma.bulkOrder.update({ where: { id: bulk.id }, data: { intakeToken: randomUUID() } })
      return res.status(200).json({ bulkOrder: await loadOne(bulk.id) })
    }

    if (action === 'delete') {
      const admin = await requireAdminRole(req, res, actor)
      if (!admin) return
      const runners = await prisma.order.findMany({ where: { bulkOrderId: bulk.id }, select: { id: true } })
      await prisma.runnerResearch.deleteMany({ where: { orderId: { in: runners.map(r => r.id) } } })
      await prisma.order.deleteMany({ where: { bulkOrderId: bulk.id } })
      await prisma.bulkOrder.delete({ where: { id: bulk.id } })
      return res.status(200).json({ success: true })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (error) {
    console.error('[API /bulk]', error)
    return res.status(500).json({ error: error.message })
  }
}
