/**
 * Render jobs: the queue between the fulfillment tool and the render workers.
 *
 * The tool creates a job; a worker claims it, renders, uploads and completes
 * it; a person reviews the result. Workers check in every 30 seconds with the
 * races they have templates for, which is how the tool knows which orders can
 * offer "Create Design" at all.
 */
import { createClient } from '@supabase/supabase-js'
import prisma from '../../db.js'
import { buildSpec, SPEC_SELECT } from './spec.js'
import { getCanonicalRaceName } from '../../scrapers/index.js'

export const BUCKET = 'production-files'
const ONLINE_MS = 90_000
const STALE_CLAIM_MS = 10 * 60_000

function storage() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

/** Workers seen in the last minute and a half. */
export async function onlineWorkers() {
  return prisma.renderWorker.findMany({ where: { lastSeenAt: { gte: new Date(Date.now() - ONLINE_MS) } }, orderBy: { name: 'asc' } })
}

/** Races any online worker can render. */
export async function availableTemplates() {
  const workers = await onlineWorkers()
  const set = new Set()
  for (const w of workers) for (const t of (Array.isArray(w.templates) ? w.templates : [])) set.add(String(t))
  return [...set]
}

export async function heartbeat({ workerId, name, templates }) {
  const id = String(workerId || '').slice(0, 80)
  if (!id) throw new Error('workerId is required')
  const list = (Array.isArray(templates) ? templates : []).map(String).slice(0, 500)
  return prisma.renderWorker.upsert({
    where: { id },
    update: { name: String(name || id).slice(0, 80), templates: list, lastSeenAt: new Date() },
    create: { id, name: String(name || id).slice(0, 80), templates: list, lastSeenAt: new Date() },
  })
}

/** Whether an order can be rendered now, and the spec if so. */
export async function checkOrder(orderId) {
  const order = await prisma.order.findUnique({ where: { id: String(orderId) }, select: SPEC_SELECT })
  if (!order) throw new Error('Order not found')
  const templates = await availableTemplates()
  const result = buildSpec(order, templates, await raceRowFor(order))
  if (!result.ok && !templates.length) result.reasons.unshift('No render worker is online')
  return { order, ...result }
}

/** The Race row by name and year, trying the canonical name too. */
async function raceRowFor(order) {
  const name = order.raceNameOverride ?? order.raceName, year = order.yearOverride ?? order.raceYear
  if (!name || !year) return null
  const canonical = getCanonicalRaceName(name) || name
  return await prisma.race.findUnique({ where: { raceName_year: { raceName: name, year } } })
    || (canonical !== name ? prisma.race.findUnique({ where: { raceName_year: { raceName: canonical, year } } }) : null)
}

export async function createJob({ orderId, requestedBy = 'admin', requestedById = null }) {
  const { ok, reasons, spec } = await checkOrder(orderId)
  if (!ok) throw new Error(reasons.join('. '))
  const open = await prisma.renderJob.findFirst({ where: { orderId: String(orderId), status: { in: ['queued', 'rendering'] } } })
  if (open) return open
  const last = await prisma.renderJob.findFirst({ where: { orderId: String(orderId) }, orderBy: { version: 'desc' }, select: { version: true } })
  return prisma.renderJob.create({
    data: { orderId: String(orderId), version: (last?.version || 0) + 1, spec, requestedBy, requestedById },
  })
}

export async function latestJob(orderId) {
  return prisma.renderJob.findFirst({ where: { orderId: String(orderId) }, orderBy: { version: 'desc' }, include: { reviewer: { select: { firstName: true, lastName: true } } } })
}

/** The oldest queued job, now owned by this worker. A claim left hanging is handed out again. */
export async function claimNext(workerId) {
  const stale = new Date(Date.now() - STALE_CLAIM_MS)
  await prisma.renderJob.updateMany({ where: { status: 'rendering', claimedAt: { lt: stale } }, data: { status: 'queued', workerId: null, claimedAt: null } })
  const worker = await prisma.renderWorker.findUnique({ where: { id: String(workerId) } })
  const templates = Array.isArray(worker?.templates) ? worker.templates.map(String) : []
  const candidates = await prisma.renderJob.findMany({ where: { status: 'queued' }, orderBy: { createdAt: 'asc' }, take: 20 })
  for (const job of candidates) {
    if (!templates.includes(String(job.spec?.race))) continue
    const claimed = await prisma.renderJob.updateMany({ where: { id: job.id, status: 'queued' }, data: { status: 'rendering', workerId: String(workerId), claimedAt: new Date() } })
    if (claimed.count === 1) return prisma.renderJob.findUnique({ where: { id: job.id } })
  }
  return null
}

/** Where this job's files go. Versioned, so nothing is ever overwritten. */
export function pathsFor(job) {
  const base = `renders/${job.orderId}/v${job.version}`
  return { pdf: `${base}.pdf`, preview: `${base}.png` }
}

/** Signed upload slots for the worker, and a signed read of the photo if the order has one. */
export async function uploadSlots(job) {
  const sb = storage()
  const paths = pathsFor(job)
  const pdf = await sb.storage.from(BUCKET).createSignedUploadUrl(paths.pdf, { upsert: true })
  const preview = await sb.storage.from(BUCKET).createSignedUploadUrl(paths.preview, { upsert: true })
  if (pdf.error || preview.error) throw new Error(`Could not open upload slots: ${(pdf.error || preview.error).message}`)
  let photoUrl = null
  if (job.spec?.photoPath) {
    const { data, error } = await sb.storage.from('personalization-photos').createSignedUrl(job.spec.photoPath, 600)
    if (error) throw new Error(`Could not read the customer photo: ${error.message}`)
    photoUrl = data.signedUrl
  }
  return { pdfUploadUrl: pdf.data.signedUrl, previewUploadUrl: preview.data.signedUrl, pdfPath: paths.pdf, previewPath: paths.preview, photoUrl }
}

export async function completeJob({ jobId, workerId, notes }) {
  const job = await prisma.renderJob.findUnique({ where: { id: String(jobId) } })
  if (!job || job.workerId !== String(workerId) || job.status !== 'rendering') throw new Error('That job is not yours to complete')
  const paths = pathsFor(job)
  return prisma.renderJob.update({ where: { id: job.id }, data: { status: 'done', finishedAt: new Date(), pdfPath: paths.pdf, previewPath: paths.preview, notes: notes ? String(notes).slice(0, 2000) : null } })
}

export async function failJob({ jobId, workerId, error }) {
  const job = await prisma.renderJob.findUnique({ where: { id: String(jobId) } })
  if (!job || job.workerId !== String(workerId)) throw new Error('That job is not yours')
  return prisma.renderJob.update({ where: { id: job.id }, data: { status: 'failed', finishedAt: new Date(), error: String(error || 'Render failed').slice(0, 2000) } })
}

/** Short-lived links to the files, for the review panel and downloads. */
export async function signedFiles(job, ttl = 600) {
  if (job.status !== 'done') return { pdfUrl: null, previewUrl: null }
  const sb = storage()
  const [pdf, preview] = await Promise.all([
    sb.storage.from(BUCKET).createSignedUrl(job.pdfPath, ttl, { download: `${job.spec?.file || job.orderId}.pdf` }),
    sb.storage.from(BUCKET).createSignedUrl(job.previewPath, ttl),
  ])
  return { pdfUrl: pdf.data?.signedUrl || null, previewUrl: preview.data?.signedUrl || null }
}

export async function reviewJob({ jobId, decision, note, reviewerId }) {
  if (!['approved', 'rejected'].includes(decision)) throw new Error('Decision must be approved or rejected')
  const job = await prisma.renderJob.findUnique({ where: { id: String(jobId) } })
  if (!job) throw new Error('Job not found')
  if (job.status !== 'done') throw new Error('Only a finished render can be reviewed')
  if (decision === 'rejected' && !String(note || '').trim()) throw new Error('Say what is wrong, so the designer knows')
  return prisma.renderJob.update({ where: { id: job.id }, data: { review: decision, reviewNote: note ? String(note).slice(0, 2000) : null, reviewedById: reviewerId || null, reviewedAt: new Date() } })
}

