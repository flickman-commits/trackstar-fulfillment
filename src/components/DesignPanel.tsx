import { useCallback, useEffect, useState } from 'react'
import { Loader2, Sparkles, Download, Check, X, RefreshCw } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { btnPrimary, btnSecondary, btnGhost, inputBase } from '@/lib/ui'

/**
 * Admin only: the automated print for a standard order. "Create Design"
 * queues a render; a Mac with Illustrator (worker/) fills the race template
 * and uploads the PDF; the preview shows here for a person to approve or
 * reject. Nothing goes to Artelo without that approval.
 */

type Job = {
  id: string; version: number; status: 'queued' | 'rendering' | 'done' | 'failed'; requestedBy: 'admin' | 'system' | 'customer'
  spec: { file: string; name: string; bib: string; time: string | null; pace: string | null; date: string; condition: string; temp: string; size: string; noTime: boolean; photoPath: string | null; dateSource?: string | null; dateSourceUrl?: string | null }
  notes: string | null; error: string | null; createdAt: string; finishedAt: string | null
  review: 'pending' | 'approved' | 'rejected'; reviewNote: string | null; reviewer: string | null; reviewedAt: string | null
  deliveredAt: string | null; deliveredPath: string | null; deliveryError: string | null; staleReason: string | null
  pdfUrl: string | null; previewUrl: string | null
}
type State = { eligible: boolean; reasons: string[]; job: Job | null; workersOnline: string[] }

async function post(body: Record<string, unknown>) {
  const res = await apiFetch('/api/render/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

export default function DesignPanel({ orderId, onPreview, canManage = true }: {
  orderId: string
  /** Admins create and review renders. Others only see one that was approved. */
  canManage?: boolean
  /** The finished render's preview URL (or null), so the order panel can show it beside the details. */
  onPreview?: (url: string | null) => void
}) {
  const [state, setState] = useState<State | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [lightbox, setLightbox] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/render/jobs?orderId=${encodeURIComponent(orderId)}`)
      if (res.ok) setState(await res.json())
    } catch { /* leave what we have */ }
  }, [orderId])

  useEffect(() => { setState(null); load() }, [load])
  const doneUrl = state?.job?.status === 'done' ? state.job.previewUrl : null
  useEffect(() => { onPreview?.(doneUrl) }, [doneUrl, onPreview])

  // While a render is in flight, ask again every few seconds.
  const inFlight = state?.job && (state.job.status === 'queued' || state.job.status === 'rendering')
  useEffect(() => {
    if (!inFlight) return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [inFlight, load])

  const create = async () => {
    setBusy(true); setErr(null)
    try { await post({ action: 'create', orderId }); await load() } catch (e) { setErr(e instanceof Error ? e.message : 'Could not start') } finally { setBusy(false) }
  }
  const review = async (decision: 'approved' | 'rejected') => {
    if (!state?.job) return
    setBusy(true); setErr(null)
    try { await post({ action: 'review', jobId: state.job.id, decision, note: decision === 'rejected' ? note : undefined }); setRejecting(false); setNote(''); await load() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save') } finally { setBusy(false) }
  }

  if (!state) return null
  const job = state.job
  const offline = state.workersOnline.length === 0
  if (!canManage && job?.review !== 'approved') return null

  // Greyed out until the order has everything a render needs. Hover for what is missing.
  const dimmed = !job && !state.eligible
  return (
    <div className={`bg-subtle-gray border border-border-gray rounded-md p-3 space-y-3 ${dimmed ? 'opacity-50' : ''}`} title={dimmed ? state.reasons.join('. ') : undefined}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-off-black/40 uppercase tracking-wider">Design</span>
          {job && <span className="text-[10px] text-off-black/40">v{job.version}{job.requestedBy === 'system' ? ' · auto' : ''}</span>}
          {job?.review === 'approved' && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-100 text-green-800 text-[11px] font-semibold"><Check className="w-3 h-3" /> Approved{job.reviewer ? ` by ${job.reviewer}` : ''}</span>}
          {job?.review === 'rejected' && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 text-red-800 text-[11px] font-semibold"><X className="w-3 h-3" /> Rejected</span>}
          {/* Whether a Mac with Illustrator is checked in right now. */}
          <span className="inline-flex items-center gap-1.5 text-[11px] text-off-black/55" title={offline ? 'No render worker has checked in for a minute and a half' : `Online: ${state.workersOnline.join(', ')}`}>
            <span className={`w-2 h-2 rounded-full ${offline ? 'bg-red-500' : 'bg-green-500'}`} aria-hidden />
            {offline ? 'Renderer offline' : state.workersOnline.join(', ')}
          </span>
        </div>
        {canManage && (!job || job.status === 'failed' || job.status === 'done') && (
          <button onClick={create} disabled={busy || !state.eligible} className={job ? btnGhost : btnPrimary} title={state.eligible ? 'Fill the race template with this order and render the print' : state.reasons.join('. ')}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : job ? <RefreshCw className="w-3.5 h-3.5" /> : <Sparkles className="w-4 h-4" />}
            {job ? 'Re-render' : 'Create Design'}
          </button>
        )}
      </div>

      {canManage && !job && !state.eligible && (
        <p className="text-xs text-off-black/55">{offline ? 'Renderer offline.' : `Waiting on: ${state.reasons.join('. ')}.`}</p>
      )}

      {job && (job.status === 'queued' || job.status === 'rendering') && (
        <div className="flex items-center gap-2 text-sm text-off-black/70">
          <Loader2 className="w-4 h-4 animate-spin" />
          {job.status === 'queued' ? (offline ? 'Waiting for a render worker to come online' : 'Waiting in the queue') : 'Illustrator is rendering the print'}
        </div>
      )}

      {job?.status === 'failed' && <p className="text-sm text-red-600">Render failed: {job.error}</p>}

      {job?.status === 'done' && (
        <>
          <div className="flex gap-3">
            {job.previewUrl && (
              <button onClick={() => setLightbox(true)} className="shrink-0 rounded border border-border-gray bg-white overflow-hidden" title="Open larger">
                <img src={job.previewUrl} alt={`Render of ${job.spec.file}`} className="h-56 w-auto block" />
              </button>
            )}
            <div className="flex-1 min-w-0 text-xs text-off-black/70 space-y-1">
              <div className="font-mono text-off-black">{job.spec.file}.pdf</div>
              <div>{job.spec.name} · {job.spec.bib} · {job.spec.noTime ? 'no time' : `${job.spec.time} · ${job.spec.pace} / mi`}</div>
              <div>
                {job.spec.date} · {job.spec.condition} {job.spec.temp} · {job.spec.size}{job.spec.photoPath ? ' · photo' : ''}
                {job.spec.dateSourceUrl && <a href={job.spec.dateSourceUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-[#4600D6] hover:underline" title={`Date verified (${job.spec.dateSource})`}>date source ↗</a>}
              </div>
              {job.staleReason && <div className="text-red-700 font-semibold">Re-render needed: {job.staleReason}</div>}
              {job.notes && <div className="text-amber-700">{job.notes}</div>}
              {job.reviewNote && <div className="text-red-700">Rejected: {job.reviewNote}</div>}
              {job.review === 'approved' && (job.deliveredAt
                ? <a href={job.deliveredPath || '#'} target="_blank" rel="noopener noreferrer" className="block text-green-700 hover:underline underline-offset-2">Saved to the Drive Orders folder ↗</a>
                : <div className="text-red-700">Not saved to Drive: {job.deliveryError || 'retrying'}</div>)}
              {job.pdfUrl && <a href={job.pdfUrl} className="inline-flex items-center gap-1 text-[#4600D6] hover:underline underline-offset-2 pt-1"><Download className="w-3.5 h-3.5" /> Download PDF</a>}
            </div>
          </div>

          {canManage && job.review === 'pending' && !rejecting && (
            <div className="flex gap-2">
              <button onClick={() => review('approved')} disabled={busy} className={btnPrimary}><Check className="w-4 h-4" /> Approve</button>
              <button onClick={() => setRejecting(true)} disabled={busy} className={btnSecondary}><X className="w-4 h-4" /> Reject</button>
            </div>
          )}
          {canManage && job.review === 'pending' && rejecting && (
            <div className="space-y-2">
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="What is wrong with it?" className={inputBase} autoFocus />
              <div className="flex gap-2">
                <button onClick={() => review('rejected')} disabled={busy || !note.trim()} className={btnPrimary}>Reject with note</button>
                <button onClick={() => { setRejecting(false); setNote('') }} className={btnGhost}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}

      {err && <p className="text-sm text-red-600">{err}</p>}

      {lightbox && job?.previewUrl && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-6" onClick={() => setLightbox(false)}>
          <img src={job.previewUrl} alt="" className="max-h-full max-w-full rounded shadow-2xl" />
        </div>
      )}
    </div>
  )
}
