/**
 * Automated print renders, for the order panel. Anyone signed in can read
 * (the team sees an approved print); creating and reviewing need the
 * orders.render capability (admins, and fulfillment by default).
 *
 *   GET  ?orderId=                 can this order be rendered, the latest job, signed file links
 *   POST { action: 'create', orderId }                     queue a render
 *   POST { action: 'review', jobId, decision, note }       approve or reject a finished render
 *
 * The rendering itself happens on a Mac with Illustrator (worker/), which
 * talks to api/render/worker.js.
 */
import { setCors, requireAdmin } from '../_lib/auth.js'
import { requireCapability, recordAudit, loadActiveUser } from '../_lib/users.js'
import { checkOrder, createJob, latestJob, signedFiles, reviewJob, onlineWorkers } from '../../server/domain/render/jobs.js'
import { deliverApproved } from '../../server/domain/render/deliver.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS' })) return

  try {
    if (req.method === 'GET') {
      const actor = requireAdmin(req, res)
      if (!actor) return
      if (!(await loadActiveUser(actor))) return res.status(401).json({ error: 'Your account is no longer active. Sign in again.' })
      const orderId = String(req.query?.orderId || '')
      if (!orderId) return res.status(400).json({ error: 'orderId is required' })
      let [{ ok, reasons }, job, workers] = await Promise.all([checkOrder(orderId), latestJob(orderId), onlineWorkers()])
      // An approved render that did not reach Drive (a hiccup at approval time) is retried on sight.
      if (job && job.review === 'approved' && !job.deliveredAt) job = { ...job, ...(await deliverApproved(job)) }
      const files = job ? await signedFiles(job) : { pdfUrl: null, previewUrl: null }
      return res.status(200).json({ eligible: ok, reasons, job: job ? present(job, files) : null, workersOnline: workers.map(w => w.name) })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const user = await requireCapability(req, res, 'orders.render')
    if (!user) return
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})

    if (body.action === 'create') {
      const job = await createJob({ orderId: String(body.orderId || ''), requestedBy: 'admin', requestedById: user.id })
      await recordAudit({ action: 'render.create', summary: `Queued a render of ${job.spec?.file || job.orderId} (v${job.version})`, detail: { jobId: job.id, orderId: job.orderId }, actor: user })
      return res.status(200).json({ job: present(job, { pdfUrl: null, previewUrl: null }) })
    }

    if (body.action === 'review') {
      let job = await reviewJob({ jobId: String(body.jobId || ''), decision: String(body.decision || ''), note: body.note, reviewerId: user.id })
      if (job.review === 'approved') job = await deliverApproved(job)
      await recordAudit({ action: `render.${job.review}`, summary: `${job.review === 'approved' ? 'Approved' : 'Rejected'} the render of ${job.spec?.file || job.orderId} (v${job.version})${job.reviewNote ? `: ${job.reviewNote}` : ''}`, detail: { jobId: job.id, orderId: job.orderId }, actor: user })
      const files = await signedFiles(job)
      return res.status(200).json({ job: present(job, files) })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (error) {
    console.error('[API /render/jobs]', error)
    return res.status(400).json({ error: error.message })
  }
}

function present(job, files) {
  return {
    id: job.id, orderId: job.orderId, version: job.version, status: job.status, requestedBy: job.requestedBy,
    spec: job.spec, notes: job.notes, error: job.error, createdAt: job.createdAt, finishedAt: job.finishedAt,
    review: job.review, reviewNote: job.reviewNote, reviewedAt: job.reviewedAt, deliveredAt: job.deliveredAt, deliveredPath: job.deliveredPath, deliveryError: job.deliveryError,
    reviewer: job.reviewer ? `${job.reviewer.firstName} ${job.reviewer.lastName}`.trim() : null,
    ...files,
  }
}
