import { useState } from 'react'
import { Loader2, Sparkles, Download, Check, X, RefreshCw } from 'lucide-react'
import type { Design } from '@/lib/useDesign'
import { btnPrimary, btnGhost, inputBase } from '@/lib/ui'

/**
 * The automated print for a standard order, in three pieces the order view
 * places itself: the design card (the print, or what it is waiting on and a
 * Create Design button) where the order's preview sits, the review buttons
 * under it, and a thin row of design details beside the filename. One hook
 * (useDesign) holds the state all three read. "Create Design" queues a
 * render; a Mac with Illustrator (worker/) fills the race template and
 * uploads the PDF; nothing goes to Artelo without a person's approval.
 */

function WorkerDot({ d }: { d: Design }) {
  const online = d.state?.workersOnline || []
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-off-black/55" title={d.offline ? 'No render worker has checked in for a minute and a half' : `Online: ${online.join(', ')}`}>
      <span className={`w-2 h-2 rounded-full ${d.offline ? 'bg-red-500' : 'bg-green-500'}`} aria-hidden />
      {d.offline ? 'Renderer offline' : online.join(', ')}
    </span>
  )
}

/** Sits where the order's preview goes: the finished print, or its status and a Create Design button. */
export function DesignCard({ d }: { d: Design }) {
  const [lightbox, setLightbox] = useState(false)
  if (!d.visible || !d.state) return null
  const { job, state } = d

  if (job?.status === 'done' && job.previewUrl) {
    return (
      <>
        <button onClick={() => setLightbox(true)} className="relative self-start rounded-md border border-border-gray bg-white overflow-hidden" title="Open larger">
          <img src={job.previewUrl} alt={`Render of ${job.spec.file}`} className="h-[300px] w-auto block" />
          {job.review !== 'pending' && (
            <span className={`absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold ${job.review === 'approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {job.review === 'approved' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
              {job.review === 'approved' ? 'Approved' : 'Rejected'}
            </span>
          )}
        </button>
        {lightbox && (
          <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-6" onClick={() => setLightbox(false)}>
            <img src={job.previewUrl} alt="" className="max-h-full max-w-full rounded shadow-2xl" />
          </div>
        )}
      </>
    )
  }

  const inFlight = job && (job.status === 'queued' || job.status === 'rendering')
  return (
    <div className="w-[220px] h-[300px] self-start rounded-md border border-dashed border-border-gray bg-subtle-gray flex flex-col items-center justify-center gap-3 p-4 text-center">
      <span className="text-[10px] font-semibold text-off-black/40 uppercase tracking-wider">Design</span>
      {inFlight ? (
        <div className="flex flex-col items-center gap-2 text-sm text-off-black/70">
          <Loader2 className="w-5 h-5 animate-spin" />
          {job!.status === 'queued' ? (d.offline ? 'Waiting for a render worker' : 'Waiting in the queue') : 'Illustrator is rendering'}
        </div>
      ) : (
        <>
          {job?.status === 'failed' && <p className="text-xs text-red-600">Render failed: {job.error}</p>}
          {!job && !state.eligible && <p className="text-xs text-off-black/55">Waiting on: {state.reasons.join('. ')}.</p>}
          {d.canManage && (
            <button onClick={d.create} disabled={d.busy || !state.eligible} className={btnPrimary} title={state.eligible ? 'Fill the race template with this order and render the print' : state.reasons.join('. ')}>
              {d.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : job ? <RefreshCw className="w-3.5 h-3.5" /> : <Sparkles className="w-4 h-4" />}
              {job ? 'Try again' : 'Create Design'}
            </button>
          )}
        </>
      )}
      <WorkerDot d={d} />
      {d.err && <p className="text-xs text-red-600">{d.err}</p>}
    </div>
  )
}

/** Approve and Reject, large: reviewing the print is the main thing this view is for. */
export function DesignReview({ d }: { d: Design }) {
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const job = d.job
  if (!d.visible || !d.canManage || job?.status !== 'done' || job.review !== 'pending') return null
  if (rejecting) {
    return (
      <div className="flex gap-2">
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="What is wrong with it?" className={`${inputBase} flex-1`} autoFocus
          onKeyDown={e => { if (e.key === 'Enter' && note.trim()) d.review('rejected', note).then(ok => { if (ok) { setRejecting(false); setNote('') } }) }} />
        <button onClick={() => d.review('rejected', note).then(ok => { if (ok) { setRejecting(false); setNote('') } })} disabled={d.busy || !note.trim()} className="px-5 py-3 rounded-md bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-40">Reject with note</button>
        <button onClick={() => { setRejecting(false); setNote('') }} className={btnGhost}>Cancel</button>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      <button onClick={() => d.review('approved')} disabled={d.busy} className="inline-flex items-center justify-center gap-2 py-4 rounded-md bg-green-600 text-white text-base font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors">
        {d.busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />} Approve
      </button>
      <button onClick={() => setRejecting(true)} disabled={d.busy} className="inline-flex items-center justify-center gap-2 py-4 rounded-md bg-white border-2 border-red-200 text-red-700 text-base font-semibold hover:bg-red-50 disabled:opacity-50 transition-colors">
        <X className="w-5 h-5" /> Reject
      </button>
    </div>
  )
}

function fmt(t: string | null) {
  return t ? new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
}

/** One thin row under the filename: what the print was made from and where it went. */
export function DesignDetails({ d }: { d: Design }) {
  const job = d.job
  if (!d.visible || !job) return null
  const parts: React.ReactNode[] = [
    <span key="v">v{job.version}{job.requestedBy === 'system' ? ' (auto)' : ''}</span>,
    <span key="size">{job.spec.size}</span>,
  ]
  if (job.spec.template) parts.push(<span key="t">{job.spec.template}</span>)
  parts.push(<span key="photo">{job.spec.photoPath ? 'Photo' : 'No photo'}</span>)
  if (job.spec.noTime) parts.push(<span key="nt">No time</span>)
  parts.push(<span key="c" title={job.finishedAt ? `Finished ${fmt(job.finishedAt)}` : undefined}>Created {fmt(job.createdAt)}</span>)
  if (job.spec.dateSourceUrl) parts.push(<a key="ds" href={job.spec.dateSourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" title={`Date verified (${job.spec.dateSource})`}>Date source ↗</a>)
  if (job.review === 'approved') parts.push(<span key="a">Approved{job.reviewer ? ` by ${job.reviewer}` : ''} {fmt(job.reviewedAt)}</span>)
  if (job.review === 'approved') parts.push(job.deliveredAt
    ? <a key="dr" href={job.deliveredPath || '#'} target="_blank" rel="noopener noreferrer" className="text-green-700 hover:underline">In Drive ↗</a>
    : <span key="dr" className="text-red-700">Not in Drive: {job.deliveryError || 'retrying'}</span>)
  if (job.pdfUrl) parts.push(<a key="pdf" href={job.pdfUrl} className="inline-flex items-center gap-1 text-blue-600 hover:underline"><Download className="w-3 h-3" /> PDF</a>)
  return (
    <div className="bg-subtle-gray border border-border-gray rounded-md px-3 py-2.5 space-y-1">
      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-off-black/60">
        <span className="text-body-sm text-off-black/60 mr-1">Design Details</span>
        {parts.map((p, i) => <span key={i} className="inline-flex items-center gap-3">{i > 0 && <span className="text-off-black/20">·</span>}{p}</span>)}
        <span className="ml-auto"><WorkerDot d={d} /></span>
        {d.canManage && (job.status === 'done' || job.status === 'failed') && (
          <button onClick={d.create} disabled={d.busy || !d.state?.eligible} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 disabled:opacity-40" title={d.state?.eligible ? 'Render this order again' : d.state?.reasons.join('. ')}>
            <RefreshCw className="w-3 h-3" /> Re-render
          </button>
        )}
      </div>
      {job.notes && <div className="text-xs text-amber-700">{job.notes}</div>}
      {job.reviewNote && <div className="text-xs text-red-700">Rejected: {job.reviewNote}</div>}
      {d.err && <div className="text-xs text-red-600">{d.err}</div>}
    </div>
  )
}
