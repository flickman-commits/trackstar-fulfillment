/**
 * The render worker's side of the queue (worker/render-worker.mjs).
 *
 * Authenticates with an API key (Authorization: Bearer ...) that has the
 * write or repair scope. Every call is a POST with an action:
 *
 *   heartbeat  { workerId, name, templates }  I am here; these races I can render
 *   claim      { workerId }                   give me the next job, with upload slots
 *   complete   { workerId, jobId, notes }     files are uploaded
 *   fail       { workerId, jobId, error }     could not render
 *
 * Files go straight from the Mac to storage through signed upload URLs, so
 * the PDF never passes through this function.
 */
import { setCors } from '../_lib/auth.js'
import { resolveApiKey } from '../_lib/apiKeys.js'
import { checkRateLimitDurable } from '../../server/lib/publicRateLimit.js'
import { heartbeat, claimNext, uploadSlots, completeJob, failJob } from '../../server/domain/render/jobs.js'

function bearer(h) {
  const m = /^Bearer\s+(.+)$/i.exec(String(h || ''))
  return m ? m[1].trim() : null
}

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'POST, OPTIONS' })) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const presented = bearer(req.headers['authorization'])
  const principal = presented ? await resolveApiKey(presented) : null
  if (!principal || !(principal.scopes.has('write') || principal.scopes.has('repair'))) {
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
    const limit = await checkRateLimitDurable(ip, { bucket: 'render-worker-auth', max: 20, windowMs: 10 * 60_000 })
    if (!limit.allowed) return res.status(429).json({ error: 'Too many bad keys from this address' })
    return res.status(401).json({ error: 'A valid API key with the write or repair scope is required' })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const workerId = String(body.workerId || '')
    if (!workerId) return res.status(400).json({ error: 'workerId is required' })

    switch (body.action) {
      case 'heartbeat': {
        const w = await heartbeat({ workerId, name: body.name, templates: body.templates })
        return res.status(200).json({ ok: true, worker: w.name, templates: w.templates.length })
      }
      case 'claim': {
        const job = await claimNext(workerId)
        if (!job) return res.status(200).json({ job: null })
        const slots = await uploadSlots(job)
        return res.status(200).json({ job: { id: job.id, version: job.version, spec: job.spec, ...slots } })
      }
      case 'complete': {
        const job = await completeJob({ jobId: body.jobId, workerId, notes: body.notes })
        return res.status(200).json({ ok: true, jobId: job.id })
      }
      case 'fail': {
        const job = await failJob({ jobId: body.jobId, workerId, error: body.error })
        return res.status(200).json({ ok: true, jobId: job.id })
      }
      default:
        return res.status(400).json({ error: 'Unknown action' })
    }
  } catch (error) {
    console.error('[API /render/worker]', error)
    return res.status(400).json({ error: error.message })
  }
}
