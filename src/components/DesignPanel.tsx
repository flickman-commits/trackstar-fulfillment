import { useEffect, useState } from 'react'
import { Loader2, Sparkles, Download, Check, X, RefreshCw, ArrowUpRight } from 'lucide-react'
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
  if (d.reserved && !d.state) return <div className="w-full md:w-[347px] aspect-[2/3] md:aspect-auto md:h-[520px] self-start rounded-md border border-border-gray bg-subtle-gray animate-pulse" />
  if (!d.visible || !d.state) return null
  const { job, state } = d

  if (job?.status === 'done' && job.previewUrl) {
    return (
      <div className="self-start w-full md:w-auto flex flex-col items-center gap-2">
        <button onClick={() => setLightbox(true)} className="relative self-start w-full md:w-[347px] aspect-[2/3] md:aspect-auto md:h-[520px] rounded-md border border-border-gray bg-subtle-gray overflow-hidden" title="Open larger">
          <img src={job.previewUrl} alt={`Render of ${job.spec.file}`} className="w-full h-full object-contain block" />
          {job.review !== 'pending' && (
            <span className={`absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold ${job.review === 'approved' ? 'bg-green-100 text-green-800' : job.review === 'closed' ? 'bg-off-black/10 text-off-black/70' : 'bg-red-100 text-red-800'}`}>
              {job.review === 'approved' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
              {job.review === 'approved' ? 'Approved' : job.review === 'closed' ? 'Closed' : 'Rejected'}
            </span>
          )}
        </button>
        <div className="flex items-center gap-1">
          {job.pdfUrl && (
            <a href={job.pdfUrl} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-off-black/60 hover:text-off-black hover:bg-off-black/5 transition-colors">
              <Download className="w-3.5 h-3.5" /> Download
            </a>
          )}
          {d.canManage && (
            <button onClick={d.create} disabled={d.busy || !state.eligible} title={state.eligible ? 'Render this order again' : state.reasons.join('. ')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-off-black/60 hover:text-off-black hover:bg-off-black/5 disabled:opacity-40 transition-colors">
              {d.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Re-render
            </button>
          )}
        </div>
        {lightbox && (
          <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-6" onClick={() => setLightbox(false)}>
            <img src={job.previewUrl} alt="" className="max-h-full max-w-full rounded shadow-2xl" />
          </div>
        )}
      </div>
    )
  }

  const inFlight = job && (job.status === 'queued' || job.status === 'rendering')
  return (
    <div className="w-full md:w-[347px] aspect-[2/3] md:aspect-auto md:h-[520px] self-start rounded-md border border-dashed border-border-gray bg-subtle-gray flex flex-col items-center justify-center gap-3 p-4 text-center">
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
// Remembered per render in this browser, so Mark as complete is still there
// after looking at another order. Storage can be unavailable; then it is per visit.
const attachKey = (jobId: string) => `trackstar:attach-opened:${jobId}`
function readOpened(jobId: string) { try { return localStorage.getItem(attachKey(jobId)) === '1' } catch { return false } }
function writeOpened(jobId: string) { try { localStorage.setItem(attachKey(jobId), '1') } catch { /* per visit only */ } }

export function DesignReview({ d, arteloOrderUrl = null, onComplete, compact = false }: { d: Design; arteloOrderUrl?: string | null; onComplete?: () => void; compact?: boolean }) {
  // compact: the phone's bottom bar, shorter buttons in the same order.
  const pad = compact ? 'py-3 text-[15px]' : 'py-4 text-base'
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const job = d.job
  const [opened, setOpened] = useState(false)
  useEffect(() => { setOpened(job ? readOpened(job.id) : false) }, [job?.id])  // eslint-disable-line react-hooks/exhaustive-deps
  // Approved, and the order is still open: attach the file in Artelo. Mark as
  // complete appears beside it only once Attach has been clicked, and Attach
  // stays, because a click is not proof the attaching got done.
  if (d.visible && job?.status === 'done' && job.review === 'approved' && arteloOrderUrl) {
    return (
      <div className={`grid gap-3 ${opened && onComplete ? (compact ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2') : 'grid-cols-1'}`}>
        <a href={arteloOrderUrl} target="_blank" rel="noopener noreferrer" onClick={() => { writeOpened(job.id); setOpened(true) }}
          className={`flex items-center justify-center gap-2 ${pad} rounded-md font-semibold transition-opacity ${opened ? 'bg-white border-2 border-[#4600D6]/30 text-[#4600D6] hover:bg-[#4600D6]/[0.04]' : 'bg-[#4600D6] text-white hover:opacity-90'}`}>
          <img src="/artelo-icon.png" alt="" className="w-5 h-5 rounded-[4px]" /> {compact && opened ? 'Attach' : 'Attach in Artelo'} <ArrowUpRight className="w-4 h-4 opacity-70" />
        </a>
        {opened && onComplete && (
          <button onClick={onComplete} className={`inline-flex items-center justify-center gap-2 ${pad} rounded-md bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors`}>
            <Check className="w-5 h-5" /> {compact ? 'Complete' : 'Mark as complete'}
            {!compact && <kbd className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded border border-white/30 text-[11px] font-medium opacity-70 font-sans">⌘↵</kbd>}
          </button>
        )}
      </div>
    )
  }
  if (!d.visible || !d.canManage || job?.status !== 'done' || job.review !== 'pending') return null
  if (rejecting) {
    return (
      <div className={compact ? 'grid grid-cols-[1fr,auto] gap-2' : 'flex gap-2'}>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="What is wrong with it?" className={`${inputBase} flex-1`} autoFocus
          onKeyDown={e => { if (e.key === 'Enter' && note.trim()) d.review('rejected', note).then(ok => { if (ok) { setRejecting(false); setNote('') } }) }} />
        <button onClick={() => d.review('rejected', note).then(ok => { if (ok) { setRejecting(false); setNote('') } })} disabled={d.busy || !note.trim()} className="px-5 py-3 rounded-md bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-40">{compact ? 'Reject' : 'Reject with note'}</button>
        <button onClick={() => { setRejecting(false); setNote('') }} className={`${btnGhost} ${compact ? 'col-span-2 justify-center' : ''}`}>Cancel</button>
      </div>
    )
  }
  const approve = (
    <button key="a" onClick={() => d.review('approved')} disabled={d.busy} className={`inline-flex items-center justify-center gap-2 ${pad} rounded-md bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors`}>
      {d.busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />} {compact ? 'Approve' : 'Approve & Upload to Orders'}
    </button>
  )
  const reject = (
    <button key="r" onClick={() => setRejecting(true)} disabled={d.busy} className={`inline-flex items-center justify-center gap-2 ${pad} rounded-md bg-white border-2 border-red-200 text-red-700 font-semibold hover:bg-red-50 disabled:opacity-50 transition-colors`}>
      <X className="w-5 h-5" /> Reject
    </button>
  )
  // On a phone Approve is the wide button on the right, under the thumb.
  return (
    <div className={`grid gap-3 ${compact ? 'grid-cols-[1fr,2fr]' : 'grid-cols-1 sm:grid-cols-2'}`}>
      {compact ? [reject, approve] : [approve, reject]}
    </div>
  )
}

function fmt(t: string | null) {
  return t ? new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
}

function Check2({ ok, label, title }: { ok: boolean | null; label: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 ${ok === false ? 'text-red-700 font-semibold' : ok ? 'text-green-700' : 'text-off-black/40'}`}>
      {ok === false ? <X className="w-3 h-3" /> : <Check className="w-3 h-3" />}{label}
    </span>
  )
}

/**
 * Above the review buttons: what the print was made from, and what the PDF
 * measured (trim, bleed, color) so nobody has to open it to trust it.
 */
export function DesignDetails({ d }: { d: Design }) {
  const job = d.job
  if (!d.visible || !job || job.status !== 'done') return null
  const o = job.output
  const b = o?.bleedIn
  const bleedOk = b ? [b.left, b.right, b.top, b.bottom].every(v => Math.abs(v - 0.25) <= 0.01) : null
  const made = [
    `v${job.version}${job.requestedBy === 'system' ? ' auto' : ''}`,
    job.spec.template || null,
    job.spec.photoPath ? 'photo' : 'no photo',
    job.spec.noTime ? 'no time' : null,
    `made ${fmt(job.finishedAt || job.createdAt)}`,
  ].filter(Boolean).join(' · ')
  return (
    <div className="bg-subtle-gray border border-border-gray rounded-md px-3 py-2.5 space-y-1.5 text-xs">
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
        <span className="text-body-sm text-off-black/60">Design Details</span>
        <span className="text-off-black/55">{made}</span>
        <span className="ml-auto flex items-center gap-3">
          {job.spec.dateSourceUrl && <a href={job.spec.dateSourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" title={`Date verified (${job.spec.dateSource})`}>Date source ↗</a>}
          {job.pdfUrl && <a href={job.pdfUrl} className="inline-flex items-center gap-1 text-blue-600 hover:underline"><Download className="w-3 h-3" /> PDF</a>}
          {d.canManage && (
            <button onClick={d.create} disabled={d.busy || !d.state?.eligible} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 disabled:opacity-40" title={d.state?.eligible ? 'Render this order again' : d.state?.reasons.join('. ')}>
              <RefreshCw className="w-3 h-3" /> Re-render
            </button>
          )}
        </span>
      </div>
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
        {o ? (
          <>
            <Check2 ok={o.trimIn ? o.trimIn === job.spec.size : null} label={`${o.trimIn || job.spec.size} trim`} title="Measured from the PDF's trim box" />
            <Check2 ok={bleedOk} label={b ? (bleedOk ? '0.25" bleed all sides' : `bleed ${b.left}/${b.right}/${b.top}/${b.bottom}"`) : 'bleed'} title="Measured from the PDF's bleed box" />
            <Check2 ok={o.color ? o.color === 'CMYK' : null} label={o.color || 'color'} title="Read from the PDF's color operators and images" />
          </>
        ) : (
          <span className="text-off-black/40">Not measured (made before the PDF check)</span>
        )}
        {job.review === 'approved' && (
          <span className="ml-auto flex items-center gap-3">
            <span className="text-off-black/55">Approved{job.reviewer ? ` by ${job.reviewer}` : ''} {fmt(job.reviewedAt)}</span>
            {job.deliveredAt
              ? <a href={job.deliveredPath || '#'} target="_blank" rel="noopener noreferrer" className="text-green-700 hover:underline">In Orders folder ↗</a>
              : <span className="text-red-700">Not in Drive: {job.deliveryError || 'retrying'}</span>}
            {job.arteloUploadedAt
              ? <a href={job.arteloUrl || '#'} target="_blank" rel="noopener noreferrer" className="text-green-700 hover:underline">In Artelo library ↗</a>
              : <span className="text-red-700">Not in Artelo: {job.arteloError || 'retrying'}</span>}
          </span>
        )}
      </div>
      {job.notes && <div className="text-amber-700">{job.notes}</div>}
      {job.reviewNote && <div className={job.review === 'closed' ? 'text-off-black/60' : 'text-red-700'}>{job.review === 'closed' ? 'Closed' : 'Rejected'}: {job.reviewNote}</div>}
      {d.err && <div className="text-red-600">{d.err}</div>}
    </div>
  )
}

/** A small tag, styled like the order's other chips. tone: green ok, red problem, purple Artelo, gray neutral. */
function Tag({ tone = 'gray', children, href, title, onClick }: { tone?: 'green' | 'red' | 'purple' | 'gray' | 'blue'; children: React.ReactNode; href?: string | null; title?: string; onClick?: () => void }) {
  const cls = `inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-medium ${
    tone === 'green' ? 'bg-green-50 border-green-200 text-green-800'
    : tone === 'red' ? 'bg-red-50 border-red-200 text-red-700'
    : tone === 'purple' ? 'bg-[#4600D6]/[0.06] border-[#4600D6]/25 text-[#4600D6]'
    : tone === 'blue' ? 'bg-blue-50 border-blue-200 text-blue-700'
    : 'bg-white border-border-gray text-off-black/70'}`
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" title={title} className={`${cls} hover:opacity-80`}>{children}</a>
  if (onClick) return <button type="button" onClick={onClick} title={title} className={`${cls} hover:opacity-80 disabled:opacity-40`}>{children}</button>
  return <span title={title} className={cls}>{children}</span>
}

/**
 * Design Details for the right column: what the print was made from and what
 * its PDF measured, as tags, colored where it means something (green = checked
 * and fine, red = a problem, purple = in Artelo).
 */
export function DesignDetailsTags({ d }: { d: Design }) {
  const job = d.job
  if (!d.visible || !job || job.status !== 'done') return null
  const o = job.output
  const b = o?.bleedIn
  const bleedOk = b ? [b.left, b.right, b.top, b.bottom].every(v => Math.abs(v - 0.25) <= 0.01) : null
  const ok = (v: boolean | null) => v === null ? 'gray' : v ? 'green' : 'red'
  return (
    <div>
      <h4 className="text-[10px] font-semibold text-off-black/40 uppercase tracking-wider mb-1.5">Design Details</h4>
      <div className="flex flex-wrap gap-1.5">
        <Tag title={job.requestedBy === 'system' ? 'Rendered automatically' : 'Re-rendered by hand'}>V{job.version}</Tag>
        {job.spec.template && <Tag>{job.spec.template}</Tag>}
        <Tag tone={job.spec.photoPath ? 'blue' : 'gray'}>{job.spec.photoPath ? 'Photo' : 'No photo'}</Tag>
        {job.spec.noTime && <Tag tone="red">No time</Tag>}
        <Tag title={job.finishedAt ? `Finished ${fmt(job.finishedAt)}` : undefined}>Made {fmt(job.createdAt)}</Tag>
        {o ? (
          <>
            <Tag tone={ok(o.trimIn ? o.trimIn === job.spec.size : null)} title="Measured from the PDF's trim box">{o.trimIn ? o.trimIn === job.spec.size ? '✓ ' : '✕ ' : ''}{o.trimIn || job.spec.size} trim</Tag>
            <Tag tone={ok(bleedOk)} title="Measured from the PDF's bleed box">{bleedOk === null ? '' : bleedOk ? '✓ ' : '✕ '}{b && !bleedOk ? `bleed ${b.left}/${b.right}/${b.top}/${b.bottom}"` : '0.25" bleed'}</Tag>
            <Tag tone={ok(o.color ? o.color === 'CMYK' : null)} title="Read from the PDF's color">{o.color === 'CMYK' ? '✓ ' : o.color ? '✕ ' : ''}{o.color || 'Color'}</Tag>
          </>
        ) : <Tag title="Made before the PDF check">Not measured</Tag>}
        {job.review === 'approved' && <Tag tone="green" title={job.reviewedAt ? fmt(job.reviewedAt) : undefined}>✓ Approved{job.reviewer ? ` by ${job.reviewer.split(' ')[0]}` : ''}</Tag>}
        {job.review === 'approved' && (job.deliveredAt
          ? <Tag tone="green" href={job.deliveredPath}>In Orders folder ↗</Tag>
          : <Tag tone="red" title={job.deliveryError || undefined}>Not in Drive</Tag>)}
        {job.review === 'approved' && (job.arteloUploadedAt
          ? <Tag tone="purple" href={job.arteloUrl}>In Artelo library ↗</Tag>
          : <Tag tone="red" title={job.arteloError || undefined}>Not in Artelo</Tag>)}
        {job.spec.dateSourceUrl && <Tag href={job.spec.dateSourceUrl} title={`Date verified (${job.spec.dateSource})`}>Date source ↗</Tag>}
      </div>
      {job.notes && <p className="mt-1.5 text-xs text-amber-700">{job.notes}</p>}
      {job.reviewNote && <p className="mt-1 text-xs text-red-700">{job.review === 'closed' ? 'Closed' : 'Rejected'}: {job.reviewNote}</p>}
      {d.err && <p className="mt-1 text-xs text-red-600">{d.err}</p>}
    </div>
  )
}
