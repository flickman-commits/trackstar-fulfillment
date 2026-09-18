import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus, Loader2, Check, X, Upload, Download, Link2, Copy, ExternalLink, RefreshCw, FlaskConical,
  CheckCircle2, AlertTriangle, Circle, ChevronLeft, Trash2, FileText, Maximize2,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { btnPrimary, btnSecondary, btnGhost, inputBase } from '@/lib/ui'
import ProofFullscreen from '@/components/ProofFullscreen'

const API_BASE = import.meta.env.VITE_API_URL || ''

/**
 * Bulk partner orders: a prepaid run of co-branded prints for one race.
 *
 * The list is sorted by due date because that is the question Eli has: what
 * is next. The detail is one long page rather than a modal: a readiness
 * strip, the production file so nobody prints from the wrong artwork, the
 * runner list, the files, and the Artelo sheet at the bottom. Runners are
 * ordinary orders; clicking one opens the normal order modal.
 */

export interface BulkRunner {
  id: string
  orderNumber: string
  lineItemIndex: number
  runnerName: string
  email: string | null
  address: { line1: string; line2: string; city: string; state: string; zip: string; country: string } | null
  addressComplete: boolean
  fileUrl: string | null
  researched: boolean
  researchStatus: string | null
  bib: string | null
  time: string | null
  pace: string | null
  eventType: string | null
  completed: boolean
}

export interface BulkOrder {
  id: string
  number: string
  partnerName: string
  raceName: string
  raceYear: number
  quantity: number
  frameType: string
  productSize: string
  stripeInvoiceUrl: string | null
  paidAt: string | null
  productionFileUrl: string | null
  previewImageUrl: string | null
  raceDate: string | null
  dueDate: string | null
  status: string
  submittedAt: string | null
  intakeToken: string
  intakeNote: string | null
  notes: string | null
  partnerOrderId: string | null
  progress: { total: number; withAddress: number; researched: number; found: number; files: number; completed: number }
  runners?: BulkRunner[]
  readiness?: {
    paid: boolean
    raceDate: { ok: boolean; date: string | null }
    scraper: { ok: boolean; configured: boolean; yearConfigured: boolean; health: { status: string; checkedAt: string; detail: string | null } | null }
    design: { ok: boolean; status: string | null; approvedImageUrl: string | null }
    runners: { total: number; withAddress: number; ok: boolean }
  }
  sheetProblems?: { orderNumber: string; runnerName: string; problem: string }[]
}

const STATUS_LABEL: Record<string, string> = {
  collecting: 'Collecting runners',
  researching: 'Researching',
  printing: 'Printing',
  submitted: 'Sent to Artelo',
  done: 'Done',
}
/** Same treatment as the order modal's design status: an icon, a tint, and the stages above it. */
const STATUS_STYLE: Record<string, { icon: string; color: string; bg: string; border: string }> = {
  collecting: { icon: '⚪', color: 'text-off-black/70', bg: 'bg-subtle-gray', border: 'border-border-gray' },
  researching: { icon: '🔵', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  printing: { icon: '🟠', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  submitted: { icon: '🟣', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
  done: { icon: '🟢', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
}
const STAGES: { key: string; label: string }[] = [
  { key: 'collecting', label: 'Collect' },
  { key: 'researching', label: 'Research' },
  { key: 'printing', label: 'Print' },
  { key: 'submitted', label: 'Artelo' },
  { key: 'done', label: 'Done' },
]

function fmtDate(s?: string | null) {
  return s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
}
function toInputDate(s?: string | null) {
  return s ? new Date(s).toISOString().slice(0, 10) : ''
}
function daysUntil(s?: string | null) {
  if (!s) return null
  return Math.round((new Date(s).getTime() - Date.now()) / 86400000)
}

async function api<T>(body: Record<string, unknown>): Promise<T> {
  const res = await apiFetch(`${API_BASE}/api/bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data as T
}

function copyText(text: string, what = 'Copied') {
  navigator.clipboard.writeText(text).then(() => toast.success(what)).catch(() => {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); toast.success(what)
  })
}

// ─── List ──────────────────────────────────────────────────────────────────

function Light({ ok, warn, label, detail }: { ok: boolean; warn?: boolean; label: string; detail?: string }) {
  const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : Circle
  const color = ok ? 'text-green-600' : warn ? 'text-amber-600' : 'text-off-black/30'
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
      <div className="min-w-0">
        <div className={`text-xs font-semibold ${ok ? 'text-off-black' : warn ? 'text-amber-800' : 'text-off-black/60'}`}>{label}</div>
        {detail && <div className="text-[11px] text-off-black/50 leading-snug">{detail}</div>}
      </div>
    </div>
  )
}

export default function BulkView({ onOpenRunner, refreshRunners }: {
  /** Open a runner in the ordinary order modal. */
  onOpenRunner: (orderNumber: string) => void
  /** Ask the dashboard to reload its bulk-runner orders so the modal has fresh data. */
  refreshRunners: () => void
}) {
  const [list, setList] = useState<BulkOrder[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/api/bulk`)
      const data = await res.json()
      setList(data.bulkOrders || [])
    } catch { toast.error('Could not load bulk orders') }
  }, [])
  useEffect(() => { load() }, [load])

  if (selectedId) {
    return <BulkDetail id={selectedId} onBack={() => { setSelectedId(null); load() }} onOpenRunner={onOpenRunner} refreshRunners={refreshRunners} />
  }

  return (
    <div className="bg-white border border-border-gray rounded-lg shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
      <div className="p-3 md:p-4 border-b border-border-gray flex items-center justify-between gap-3">
        <p className="text-sm text-off-black/60">Prepaid runs of co-branded prints. Sorted by due date, race day plus three.</p>
        <button onClick={() => setCreating(true)} className={btnPrimary}><Plus className="w-4 h-4" /> New bulk order</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {list === null ? (
          <div className="flex items-center justify-center py-16 text-off-black/40"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : list.length === 0 ? (
          <div className="text-center py-16 text-off-black/40 text-sm">No bulk orders yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-subtle-gray text-[11px] uppercase tracking-wider text-off-black/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Order</th>
                <th className="text-left px-3 py-2.5 font-semibold">Race</th>
                <th className="text-left px-3 py-2.5 font-semibold">Due</th>
                <th className="text-left px-3 py-2.5 font-semibold">Paid</th>
                <th className="text-left px-3 py-2.5 font-semibold">Runners</th>
                <th className="text-left px-3 py-2.5 font-semibold">Researched</th>
                <th className="text-left px-3 py-2.5 font-semibold">Files</th>
                <th className="text-left px-3 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map(b => {
                const d = daysUntil(b.dueDate)
                return (
                  <tr key={b.id} onClick={() => setSelectedId(b.id)} className="border-t border-border-gray/70 hover:bg-subtle-gray cursor-pointer">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-off-black">{b.partnerName}</div>
                      <div className="text-[11px] text-off-black/45 font-mono">{b.number}</div>
                    </td>
                    <td className="px-3 py-3 text-off-black/80">{b.raceName} <span className="text-off-black/45">{b.raceYear}</span></td>
                    <td className="px-3 py-3">
                      {b.dueDate ? (
                        <span className={d !== null && d < 0 ? 'text-red-600 font-semibold' : d !== null && d <= 3 ? 'text-amber-700 font-semibold' : 'text-off-black/80'}>
                          {fmtDate(b.dueDate)}{d !== null && d < 0 ? ` · ${-d}d late` : ''}
                        </span>
                      ) : <span className="text-off-black/40">No race date</span>}
                    </td>
                    <td className="px-3 py-3">{b.paidAt ? <span className="text-green-700 font-semibold">Paid</span> : <span className="text-amber-700 font-semibold">Unpaid</span>}</td>
                    <td className="px-3 py-3 tabular-nums">{b.progress.total}{b.quantity ? <span className="text-off-black/40"> / {b.quantity}</span> : ''}</td>
                    <td className="px-3 py-3 tabular-nums">{b.progress.found}<span className="text-off-black/40"> / {b.progress.total}</span></td>
                    <td className="px-3 py-3 tabular-nums">{b.progress.files}<span className="text-off-black/40"> / {b.progress.total}</span></td>
                    <td className="px-3 py-3"><span className="px-2 py-0.5 rounded bg-subtle-gray border border-border-gray text-xs">{STATUS_LABEL[b.status] || b.status}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {creating && <CreateModal onClose={() => setCreating(false)} onCreated={b => { setCreating(false); setList(prev => [b, ...(prev || [])]); setSelectedId(b.id) }} />}
    </div>
  )
}

// ─── Create ────────────────────────────────────────────────────────────────

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (b: BulkOrder) => void }) {
  const [opts, setOpts] = useState<{ frames: string[]; sizes: string[] } | null>(null)
  const [partners, setPartners] = useState<{ id: string; raceName: string; customerName: string | null }[]>([])
  const [f, setF] = useState({ partnerName: '', raceName: '', raceYear: String(new Date().getFullYear()), quantity: '', frameType: 'Natural Premium Oak', productSize: '12x18', stripeInvoiceUrl: '', partnerOrderId: '' })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    apiFetch(`${API_BASE}/api/bulk?options=1`).then(r => r.json()).then(setOpts).catch(() => setOpts({ frames: ['Unframed', 'Natural Premium Oak', 'Black Premium Oak'], sizes: ['8x10', '12x18', '16x24'] }))
    apiFetch(`${API_BASE}/api/orders?type=race_partner`).then(r => r.json()).then(d => setPartners((d.orders || []).map((o: { id: string; raceName: string; customerName: string | null }) => ({ id: o.id, raceName: o.raceName, customerName: o.customerName })))).catch(() => {})
  }, [])
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF(v => ({ ...v, [k]: e.target.value }))
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const out = await api<{ bulkOrder: BulkOrder }>({ action: 'create', ...f })
      toast.success(`${out.bulkOrder.number} created`)
      onCreated(out.bulkOrder)
    } catch (err) { toast.error((err as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 bg-off-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()} className="bg-white rounded-lg shadow-xl w-full max-w-lg p-5 space-y-3">
        <div className="flex items-center justify-between"><h3 className="text-base font-semibold">New bulk order</h3><button type="button" onClick={onClose} className={btnGhost}><X className="w-4 h-4" /></button></div>
        <div>
          <label className="block text-[11px] font-semibold text-off-black/50 uppercase tracking-wider mb-1">Partner design</label>
          <select value={f.partnerOrderId} onChange={e => { const p = partners.find(x => x.id === e.target.value); setF(v => ({ ...v, partnerOrderId: e.target.value, partnerName: p ? p.raceName : v.partnerName })) }} className={`${inputBase} w-full`}>
            <option value="">None yet</option>
            {partners.map(p => <option key={p.id} value={p.id}>{p.raceName}</option>)}
          </select>
          <p className="text-[11px] text-off-black/45 mt-1">Links the approved co-branded design so the preview and readiness follow it.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2"><label className="block text-[11px] font-semibold text-off-black/50 uppercase tracking-wider mb-1">Partner</label><input required value={f.partnerName} onChange={set('partnerName')} placeholder="Release Recovery Foundation" className={`${inputBase} w-full`} /></div>
          <div><label className="block text-[11px] font-semibold text-off-black/50 uppercase tracking-wider mb-1">Race</label><input required value={f.raceName} onChange={set('raceName')} placeholder="NYC Marathon" className={`${inputBase} w-full`} /></div>
          <div><label className="block text-[11px] font-semibold text-off-black/50 uppercase tracking-wider mb-1">Year</label><input required inputMode="numeric" value={f.raceYear} onChange={set('raceYear')} className={`${inputBase} w-full`} /></div>
          <div><label className="block text-[11px] font-semibold text-off-black/50 uppercase tracking-wider mb-1">Units invoiced</label><input inputMode="numeric" value={f.quantity} onChange={set('quantity')} placeholder="100" className={`${inputBase} w-full`} /></div>
          <div><label className="block text-[11px] font-semibold text-off-black/50 uppercase tracking-wider mb-1">Stripe invoice</label><input value={f.stripeInvoiceUrl} onChange={set('stripeInvoiceUrl')} placeholder="https://invoice.stripe.com/…" className={`${inputBase} w-full`} /></div>
          <div><label className="block text-[11px] font-semibold text-off-black/50 uppercase tracking-wider mb-1">Frame</label>
            <select value={f.frameType} onChange={e => setF(v => ({ ...v, frameType: e.target.value, productSize: e.target.value === 'Unframed' ? '8x10' : '12x18' }))} className={`${inputBase} w-full`}>{(opts?.frames || []).map(o => <option key={o}>{o}</option>)}</select></div>
          <div><label className="block text-[11px] font-semibold text-off-black/50 uppercase tracking-wider mb-1">Size</label>
            <select value={f.productSize} onChange={set('productSize')} className={`${inputBase} w-full`}>{(opts?.sizes || []).map(o => <option key={o}>{o}</option>)}</select></div>
        </div>
        <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={onClose} className={btnGhost}>Cancel</button><button type="submit" disabled={busy} className={btnPrimary}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}</button></div>
      </form>
    </div>
  )
}

// ─── Detail ────────────────────────────────────────────────────────────────

function BulkDetail({ id, onBack, onOpenRunner, refreshRunners }: { id: string; onBack: () => void; onOpenRunner: (n: string) => void; refreshRunners: () => void }) {
  const [b, setB] = useState<BulkOrder | null>(null)
  const [intakeText, setIntakeText] = useState('')
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [intakeProblems, setIntakeProblems] = useState<string[]>([])
  const [researching, setResearching] = useState(false)
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null)
  const [unmatched, setUnmatched] = useState<{ filename: string; candidates: { orderNumber: string; runnerName: string }[] }[]>([])
  const [checking, setChecking] = useState(false)
  const [reach, setReach] = useState<Record<string, boolean>>({})
  const [preview, setPreview] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [opts, setOpts] = useState<{ frames: string[]; sizes: string[] }>({ frames: ['Unframed', 'Natural Premium Oak', 'Black Premium Oak'], sizes: ['8x10', '12x18', '16x24'] })
  const fileInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const res = await apiFetch(`${API_BASE}/api/bulk?id=${id}`)
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Not found'); onBack(); return }
    setB(data.bulkOrder)
  }, [id, onBack])
  useEffect(() => { load(); apiFetch(`${API_BASE}/api/bulk?options=1`).then(r => r.json()).then(setOpts).catch(() => {}) }, [load])

  const act = async (body: Record<string, unknown>, ok?: string) => {
    try {
      const out = await api<{ bulkOrder: BulkOrder }>({ id, ...body })
      if (out.bulkOrder) setB(out.bulkOrder)
      if (ok) toast.success(ok)
      return out
    } catch (err) { toast.error((err as Error).message); return null }
  }

  const update = (fields: Record<string, unknown>) => act({ action: 'update', ...fields })

  const runIntake = async () => {
    const out = await act({ action: 'intake', text: intakeText }) as { added: number; skipped: number; problems: string[] } | null
    if (!out) return
    setIntakeProblems(out.problems || [])
    toast.success(`${out.added} added${out.skipped ? `, ${out.skipped} already on the list` : ''}`)
    if (!out.problems?.length) { setIntakeText(''); setIntakeOpen(false) }
    refreshRunners()
  }

  const researchAll = async () => {
    setResearching(true)
    try {
      let remaining = 1
      let total = 0
      while (remaining > 0) {
        const out = await api<{ done: { status: string }[]; remaining: number; bulkOrder: BulkOrder }>({ id, action: 'research', limit: 3 })
        total += out.done.length
        remaining = out.remaining
        setB(out.bulkOrder)
        if (out.done.length === 0) break
      }
      toast.success(`Researched ${total} runner${total === 1 ? '' : 's'}`)
      refreshRunners()
    } catch (err) { toast.error((err as Error).message) } finally { setResearching(false) }
  }

  const uploadFiles = async (files: FileList | File[], orderNumber?: string) => {
    const arr = Array.from(files)
    if (!arr.length) return
    setUploading({ done: 0, total: arr.length })
    const misses: typeof unmatched = []
    let matched = 0
    for (let i = 0; i < arr.length; i++) {
      const fd = new FormData()
      fd.append('id', id)
      fd.append('file', arr[i])
      if (orderNumber) fd.append('orderNumber', orderNumber)
      try {
        const res = await apiFetch(`${API_BASE}/api/bulk/files`, { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) { toast.error(`${arr[i].name}: ${data.error}`) }
        else if (data.matched) { matched++; if (data.reachable === false) toast.warning(`${arr[i].name} uploaded but is not reachable from outside`) }
        else misses.push({ filename: data.filename, candidates: data.candidates || [] })
      } catch { toast.error(`${arr[i].name}: upload failed`) }
      setUploading({ done: i + 1, total: arr.length })
    }
    setUploading(null)
    if (matched) toast.success(`${matched} file${matched === 1 ? '' : 's'} attached`)
    if (misses.length) setUnmatched(prev => [...prev, ...misses])
    await load()
  }

  const checkUrls = async () => {
    setChecking(true)
    try {
      const res = await apiFetch(`${API_BASE}/api/bulk/files`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'check' }) })
      const data = await res.json()
      const map: Record<string, boolean> = {}
      for (const r of data.results || []) map[r.orderNumber] = r.ok
      setReach(map)
      if (data.unreachable) toast.error(`${data.unreachable} file${data.unreachable === 1 ? ' is' : 's are'} not reachable. Artelo will reject those rows.`)
      else toast.success(`All ${data.checked} files reachable from outside`)
    } catch { toast.error('Check failed') } finally { setChecking(false) }
  }

  const downloadSheet = async (force = false) => {
    const res = await apiFetch(`${API_BASE}/api/bulk/sheet?id=${id}${force ? '&force=1' : ''}`)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error || 'Could not build the sheet', { duration: 8000 })
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (res.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1] || `${b?.number}_Artelo.xlsx`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const intakeLink = useMemo(() => (b ? `${window.location.origin}/intake/${b.intakeToken}` : ''), [b])
  const previewUrl = b?.previewImageUrl || b?.readiness?.design.approvedImageUrl || null

  if (!b) return <div className="flex items-center justify-center py-16 text-off-black/40"><Loader2 className="w-5 h-5 animate-spin" /></div>
  const r = b.readiness!
  const runners = b.runners || []
  const d = daysUntil(b.dueDate)
  const canResearch = r.paid && runners.length > 0 && r.scraper.ok
  const allResearched = runners.length > 0 && runners.every(x => x.researched)
  const problems = b.sheetProblems || []

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pb-6">
      {preview && previewUrl && (
        <ProofFullscreen proofs={[{ id: 'preview', imageUrl: previewUrl }]} index={0} onIndexChange={() => {}} onClose={() => setPreview(false)} counterLabel="Co-branded design" />
      )}

      {/* Header: the same shape as the order modal. Name, the stages, and a
          tinted status you can change in place. */}
      <div className="bg-white border border-border-gray rounded-lg shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <button onClick={onBack} className={`${btnGhost} -ml-2 mb-1`}><ChevronLeft className="w-4 h-4" /> All bulk orders</button>
            <div className="flex items-center gap-2.5">
              <span className="text-2xl leading-none">{(STATUS_STYLE[b.status] || STATUS_STYLE.collecting).icon}</span>
              <h2 className="text-xl font-bold text-off-black">{b.partnerName}</h2>
              <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 text-xs font-medium">bulk</span>
            </div>
            <div className="text-sm text-off-black/60 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-[12px]">{b.number}</span>
              <span>{b.raceName} {b.raceYear}</span>
              <span>{b.productSize} · {b.frameType}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold text-off-black/45 uppercase tracking-wider">Due</div>
            <div className={`text-lg font-bold ${d !== null && d < 0 ? 'text-red-600' : d !== null && d <= 3 ? 'text-amber-700' : 'text-off-black'}`}>{b.dueDate ? fmtDate(b.dueDate) : 'No race date'}</div>
            {b.raceDate && <div className="text-[11px] text-off-black/45">Race {fmtDate(b.raceDate)} + 3 days</div>}
          </div>
        </div>

        {/* Stages */}
        {(() => {
          const at = Math.max(0, STAGES.findIndex(x => x.key === b.status))
          return (
            <div className="flex items-center">
              {STAGES.map((st, i) => (
                <div key={st.key} className="flex items-center flex-1 last:flex-none">
                  <button onClick={() => update({ status: st.key })} className={`flex items-center gap-1.5 text-xs ${i <= at ? 'text-off-black font-medium' : 'text-off-black/40'}`} title={`Set to ${STATUS_LABEL[st.key]}`}>
                    <span className={`w-2.5 h-2.5 rounded-full ${i <= at ? 'bg-off-black' : 'bg-off-black/20'}`} />
                    {st.label}
                  </button>
                  {i < STAGES.length - 1 && <div className={`flex-1 h-px mx-2 ${i < at ? 'bg-off-black/40' : 'bg-border-gray'}`} />}
                </div>
              ))}
            </div>
          )
        })()}

        {/* Status select, tinted like the order modal */}
        <div className="relative">
          <select
            value={b.status}
            onChange={e => update({ status: e.target.value })}
            className={`w-full appearance-none px-4 py-3 pr-8 rounded-md text-sm font-medium border cursor-pointer focus:outline-none focus:ring-2 focus:ring-off-black/20 ${(STATUS_STYLE[b.status] || STATUS_STYLE.collecting).bg} ${(STATUS_STYLE[b.status] || STATUS_STYLE.collecting).color} ${(STATUS_STYLE[b.status] || STATUS_STYLE.collecting).border}`}
          >
            {STAGES.map(st => <option key={st.key} value={st.key}>{STATUS_STYLE[st.key].icon} {STATUS_LABEL[st.key]}</option>)}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            <svg className="h-4 w-4 text-off-black/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </div>
        </div>
      </div>

      {/* Readiness */}
      <div className="bg-white border border-border-gray rounded-lg shadow-sm p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Light ok={r.paid} warn={!r.paid} label={r.paid ? `Paid ${fmtDate(b.paidAt)}` : 'Not paid'} detail={r.paid ? undefined : 'Nothing is researched or printed until it is.'} />
          <Light ok={r.raceDate.ok} warn={!r.raceDate.ok} label={r.raceDate.ok ? `Race ${fmtDate(r.raceDate.date)}` : 'Race date not verified'} detail={r.raceDate.ok ? undefined : 'Pin it in the Race Database, or set it below.'} />
          <Light ok={r.scraper.ok} warn={!r.scraper.ok} label={!r.scraper.configured ? 'No scraper for this race' : !r.scraper.yearConfigured ? `${b.raceYear} not configured` : r.scraper.health ? `Scraper ${r.scraper.health.status}` : 'Scraper ready'} detail={r.scraper.health ? `Probed ${fmtDate(r.scraper.health.checkedAt)}${r.scraper.health.detail ? `: ${r.scraper.health.detail}` : ''}` : r.scraper.configured ? 'Not probed yet' : 'Ask dev to add it before race day.'} />
          <Light ok={r.design.ok} warn={Boolean(b.partnerOrderId) && !r.design.ok} label={r.design.ok ? 'Design approved' : b.partnerOrderId ? `Design ${(r.design.status || 'not started').replace(/_/g, ' ')}` : 'No partner design linked'} />
          <Light ok={r.runners.ok} warn={r.runners.total > 0 && !r.runners.ok} label={r.runners.total ? `${r.runners.withAddress} of ${r.runners.total} with address` : 'No runners yet'} detail={b.quantity && r.runners.total !== b.quantity ? `${b.quantity} invoiced` : undefined} />
        </div>
      </div>

      {/* Production file */}
      <div className="bg-white border border-border-gray rounded-lg shadow-sm p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <button type="button" onClick={() => previewUrl && setPreview(true)} disabled={!previewUrl} className="relative shrink-0 w-full md:w-40 h-40 rounded-md border border-border-gray bg-subtle-gray overflow-hidden flex items-center justify-center group disabled:cursor-default">
            {previewUrl ? (
              <>
                <img src={previewUrl} alt="Co-branded design" className="w-full h-full object-contain p-2" />
                <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded bg-white/95 border border-border-gray px-1.5 py-0.5 text-[10px] opacity-0 group-hover:opacity-100"><Maximize2 className="w-3 h-3" /> Full screen</span>
              </>
            ) : <span className="text-xs text-off-black/40 px-3 text-center">No preview yet. Link a partner design or paste an image URL.</span>}
          </button>
          <div className="flex-1 min-w-0 space-y-2">
            <div>
              <div className="text-[11px] font-semibold text-[#4600D6] uppercase tracking-wider">Co-branded production file</div>
              <p className="text-sm text-off-black/70 mt-0.5">Every print in this order comes from this file, not the standard {b.raceName} artwork.</p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <input value={b.productionFileUrl || ''} onChange={e => setB({ ...b, productionFileUrl: e.target.value })} onBlur={e => update({ productionFileUrl: e.target.value })} placeholder="Google Drive link to the Illustrator file" className={`${inputBase} flex-1 min-w-[240px]`} />
              {b.productionFileUrl && <a href={b.productionFileUrl} target="_blank" rel="noopener noreferrer" className={btnSecondary}><ExternalLink className="w-3.5 h-3.5" /> Open</a>}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <input value={b.previewImageUrl || ''} onChange={e => setB({ ...b, previewImageUrl: e.target.value })} onBlur={e => update({ previewImageUrl: e.target.value || null })} placeholder={r.design.approvedImageUrl ? 'Preview: using the approved partner proof' : 'Preview image URL (optional)'} className={`${inputBase} flex-1 min-w-[240px] text-xs`} />
            </div>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="bg-white border border-border-gray rounded-lg shadow-sm p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-off-black/50 uppercase tracking-wider mb-1">Payment</label>
          <div className="flex items-center gap-2">
            <button onClick={() => act({ action: 'paid', paid: !b.paidAt }, b.paidAt ? 'Marked unpaid' : 'Marked paid')} className={`${b.paidAt ? 'bg-green-600 text-white' : 'bg-white text-off-black border border-border-gray'} px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5`}>
              {b.paidAt ? <><Check className="w-3.5 h-3.5" /> Paid</> : 'Mark paid'}
            </button>
            {b.stripeInvoiceUrl && <a href={b.stripeInvoiceUrl} target="_blank" rel="noopener noreferrer" className={btnGhost} title="Open the Stripe invoice"><ExternalLink className="w-3.5 h-3.5" /></a>}
          </div>
          <input value={b.stripeInvoiceUrl || ''} onChange={e => setB({ ...b, stripeInvoiceUrl: e.target.value })} onBlur={e => update({ stripeInvoiceUrl: e.target.value })} placeholder="Stripe invoice link" className={`${inputBase} w-full mt-1.5 text-xs`} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-off-black/50 uppercase tracking-wider mb-1">Race date</label>
          <input type="date" value={toInputDate(b.raceDate)} onChange={e => update({ raceDate: e.target.value || null })} className={`${inputBase} w-full`} />
          <label className="block text-[11px] font-semibold text-off-black/50 uppercase tracking-wider mb-1 mt-2">Due date</label>
          <input type="date" value={toInputDate(b.dueDate)} onChange={e => update({ dueDate: e.target.value || null })} className={`${inputBase} w-full`} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-off-black/50 uppercase tracking-wider mb-1">Product</label>
          <select value={b.frameType} onChange={e => update({ frameType: e.target.value, productSize: e.target.value === 'Unframed' ? '8x10' : b.productSize === '8x10' ? '12x18' : b.productSize })} className={`${inputBase} w-full`}>{opts.frames.map(o => <option key={o}>{o}</option>)}</select>
          <select value={b.productSize} onChange={e => update({ productSize: e.target.value })} className={`${inputBase} w-full mt-1.5`}>{opts.sizes.map(o => <option key={o}>{o}</option>)}</select>
          <input inputMode="numeric" value={b.quantity || ''} onChange={e => setB({ ...b, quantity: Number(e.target.value) || 0 })} onBlur={e => update({ quantity: Number(e.target.value) || 0 })} placeholder="Units invoiced" className={`${inputBase} w-full mt-1.5 text-xs`} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-off-black/50 uppercase tracking-wider mb-1">Partner intake link</label>
          <p className="text-[11px] text-off-black/50 leading-snug mb-1.5">Send this to the partner. They enter names and addresses; the list fills in here.</p>
          <div className="flex gap-1">
            <button onClick={() => copyText(intakeLink, 'Intake link copied')} className={`${btnSecondary} flex-1`}><Copy className="w-3.5 h-3.5" /> Copy link</button>
            <a href={intakeLink} target="_blank" rel="noopener noreferrer" className={btnGhost} title="Open"><ExternalLink className="w-3.5 h-3.5" /></a>
            <button onClick={() => { if (confirm('Rotate the link? The old one stops working.')) act({ action: 'new-intake-link' }, 'New link made') }} className={btnGhost} title="Make a new link"><RefreshCw className="w-3.5 h-3.5" /></button>
          </div>
          <input value={b.intakeNote || ''} onChange={e => setB({ ...b, intakeNote: e.target.value })} onBlur={e => update({ intakeNote: e.target.value })} placeholder="Note shown to the partner (optional)" className={`${inputBase} w-full mt-1.5 text-xs`} />
        </div>
      </div>

      {/* Runners */}
      <div className="bg-white border border-border-gray rounded-lg shadow-sm">
        <div className="p-3 md:p-4 border-b border-border-gray flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-tight">Runners</h3>
            <span className="text-xs text-off-black/50 tabular-nums">{b.progress.found} found · {b.progress.researched} researched · {b.progress.files} files · {b.progress.completed} done of {runners.length}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setIntakeOpen(o => !o)} className={btnSecondary}><Plus className="w-3.5 h-3.5" /> Add runners</button>
            <button onClick={researchAll} disabled={!canResearch || researching || allResearched} className={btnPrimary} title={!r.paid ? 'Mark paid first' : !r.scraper.ok ? 'Scraper is not ready' : allResearched ? 'Everyone is researched' : 'Research every runner without results'}>
              {researching ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />} Research all
            </button>
          </div>
        </div>

        {intakeOpen && (
          <div className="p-3 md:p-4 border-b border-border-gray bg-subtle-gray space-y-2">
            <p className="text-xs text-off-black/60">Paste a CSV with a header row (First Name, Last Name, Address, Address 2, City, State, Zip, Country, Email), or one name per line to add addresses later.</p>
            <textarea value={intakeText} onChange={e => setIntakeText(e.target.value)} rows={6} className={`${inputBase} w-full font-mono text-xs`} placeholder={'First Name,Last Name,Address,City,State,Zip\nJane,Doe,1 Main St,Brooklyn,NY,11201'} />
            {intakeProblems.length > 0 && (
              <ul className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2 space-y-0.5 max-h-32 overflow-y-auto">{intakeProblems.map((p, i) => <li key={i}>{p}</li>)}</ul>
            )}
            <div className="flex gap-2 justify-end"><button onClick={() => { setIntakeOpen(false); setIntakeProblems([]) }} className={btnGhost}>Cancel</button><button onClick={runIntake} disabled={!intakeText.trim()} className={btnPrimary}>Add to list</button></div>
          </div>
        )}

        {runners.length === 0 ? (
          <div className="text-center py-10 text-sm text-off-black/40">No runners yet. Add them above or send the partner the intake link.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-subtle-gray text-[11px] uppercase tracking-wider text-off-black/50">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">#</th>
                  <th className="text-left px-3 py-2 font-semibold">Runner</th>
                  <th className="text-left px-3 py-2 font-semibold">Address</th>
                  <th className="text-left px-3 py-2 font-semibold">Bib</th>
                  <th className="text-left px-3 py-2 font-semibold">Time</th>
                  <th className="text-left px-3 py-2 font-semibold">Research</th>
                  <th className="text-left px-3 py-2 font-semibold">File</th>
                  <th className="text-left px-3 py-2 font-semibold">Done</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {runners.map(x => (
                  <RunnerRow key={x.id} r={x} reach={reach[x.orderNumber]} editing={editing === x.orderNumber}
                    onEdit={() => setEditing(editing === x.orderNumber ? null : x.orderNumber)}
                    onSave={async (fields) => { await act({ action: 'update-runner', orderNumber: x.orderNumber, ...fields }, 'Saved'); setEditing(null); refreshRunners() }}
                    onRemove={async () => { if (confirm(`Remove ${x.runnerName}?`)) { await act({ action: 'remove-runner', orderNumber: x.orderNumber }, 'Removed'); refreshRunners() } }}
                    onOpen={() => onOpenRunner(x.orderNumber)}
                    onUpload={(f) => uploadFiles([f], x.orderNumber)}
                    onDetach={async () => { await apiFetch(`${API_BASE}/api/bulk/files`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'detach', orderNumber: x.orderNumber }) }); load() }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Files */}
      <div className="bg-white border border-border-gray rounded-lg shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-tight">Print files</h3>
            <p className="text-xs text-off-black/60 mt-0.5">Drop the finished PDFs. They match to runners by the filename ({b.number}-17_… or by last name) and get a public link Artelo can fetch.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={checkUrls} disabled={checking || b.progress.files === 0} className={btnSecondary}>{checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />} Check links</button>
            <button onClick={() => fileInput.current?.click()} disabled={Boolean(uploading)} className={btnPrimary}>{uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> {uploading.done} of {uploading.total}</> : <><Upload className="w-4 h-4" /> Add files</>}</button>
            <input ref={fileInput} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff" className="hidden" onChange={e => { if (e.target.files) uploadFiles(e.target.files); e.target.value = '' }} />
          </div>
        </div>
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); uploadFiles(e.dataTransfer.files) }}
          className="border-2 border-dashed border-border-gray rounded-md py-6 text-center text-xs text-off-black/45"
        >
          Drag files here
        </div>
        {unmatched.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-800">These files did not match a runner. Pick who they belong to and drop them again on that row, or rename them.</p>
            <ul className="text-xs text-amber-900 space-y-0.5">
              {unmatched.map((u, i) => <li key={i}><span className="font-mono">{u.filename}</span>{u.candidates.length ? ` could be ${u.candidates.map(c => c.runnerName).join(' or ')}` : ' matched nobody'}</li>)}
            </ul>
            <button onClick={() => setUnmatched([])} className={btnGhost}>Clear</button>
          </div>
        )}
      </div>

      {/* Artelo */}
      <div className="bg-white border border-border-gray rounded-lg shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-tight">Artelo bulk upload</h3>
            <p className="text-xs text-off-black/60 mt-0.5">One row per runner in the template's columns. Download, then upload it on Artelo's Orders page.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => downloadSheet(false)} disabled={runners.length === 0} className={btnPrimary}><Download className="w-4 h-4" /> Download sheet</button>
            {b.status !== 'submitted' && b.status !== 'done' && <button onClick={() => { if (confirm('Mark this order as uploaded to Artelo?')) act({ action: 'submitted' }, 'Marked as sent to Artelo') }} className={btnSecondary}><FileText className="w-3.5 h-3.5" /> Mark uploaded</button>}
          </div>
        </div>
        {problems.length > 0 ? (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-xs font-semibold text-red-700 mb-1">{problems.length} row{problems.length === 1 ? '' : 's'} would fail at Artelo</p>
            <ul className="text-xs text-red-800 space-y-0.5 max-h-40 overflow-y-auto">{problems.map((p, i) => <li key={i}><span className="font-mono">{p.orderNumber}</span> {p.runnerName}: {p.problem}</li>)}</ul>
            <button onClick={() => downloadSheet(true)} className={`${btnGhost} mt-1`}>Download anyway</button>
          </div>
        ) : runners.length > 0 ? (
          <p className="text-xs text-green-700 inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Every row has an address and a file.</p>
        ) : null}
        {b.submittedAt && <p className="text-xs text-off-black/50">Uploaded to Artelo {fmtDate(b.submittedAt)}.</p>}
      </div>

      <div className="px-1">
        <textarea value={b.notes || ''} onChange={e => setB({ ...b, notes: e.target.value })} onBlur={e => update({ notes: e.target.value })} rows={2} placeholder="Notes" className={`${inputBase} w-full text-xs`} />
      </div>
    </div>
  )
}

function RunnerRow({ r, reach, editing, onEdit, onSave, onRemove, onOpen, onUpload, onDetach }: {
  r: BulkRunner; reach?: boolean; editing: boolean
  onEdit: () => void; onSave: (fields: { runnerName?: string; address?: BulkRunner['address'] }) => Promise<void>; onRemove: () => void; onOpen: () => void
  onUpload: (f: File) => void; onDetach: () => void
}) {
  const [name, setName] = useState(r.runnerName)
  const [a, setA] = useState(r.address || { line1: '', line2: '', city: '', state: '', zip: '', country: 'United States' })
  useEffect(() => { setName(r.runnerName); setA(r.address || { line1: '', line2: '', city: '', state: '', zip: '', country: 'United States' }) }, [r])
  const status = r.researchStatus
  const badge = !r.researched ? { t: 'Pending', c: 'bg-subtle-gray text-off-black/60' }
    : status === 'found' ? { t: 'Found', c: 'bg-green-100 text-green-700' }
    : status === 'not_found' ? { t: 'Not found', c: 'bg-amber-100 text-amber-700' }
    : status === 'ambiguous' ? { t: 'Ambiguous', c: 'bg-amber-100 text-amber-700' }
    : { t: (status || 'error').replace(/_/g, ' '), c: 'bg-red-100 text-red-700' }
  return (
    <>
      <tr className="border-t border-border-gray/70 hover:bg-subtle-gray/60">
        <td className="px-3 py-2 font-mono text-[11px] text-off-black/45">{r.lineItemIndex}</td>
        <td className="px-3 py-2 font-medium"><button onClick={onOpen} className="hover:underline text-left">{r.runnerName}</button></td>
        <td className="px-3 py-2 text-xs text-off-black/70 max-w-[260px] truncate">{r.addressComplete ? `${r.address!.line1}, ${r.address!.city} ${r.address!.state} ${r.address!.zip}` : <span className="text-amber-700 font-semibold">Missing</span>}</td>
        <td className="px-3 py-2 tabular-nums">{r.bib || <span className="text-off-black/30">·</span>}</td>
        <td className="px-3 py-2 tabular-nums">{r.time || <span className="text-off-black/30">·</span>}</td>
        <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${badge.c}`}>{badge.t}</span></td>
        <td className="px-3 py-2">
          {r.fileUrl ? (
            <span className="inline-flex items-center gap-1">
              <a href={r.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-green-700 font-semibold inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> File{reach === false ? <span className="text-red-600"> · unreachable</span> : reach === true ? <span className="text-green-700"> · ok</span> : ''}</a>
              <button onClick={onDetach} className="text-off-black/30 hover:text-red-600" title="Detach"><X className="w-3 h-3" /></button>
            </span>
          ) : (
            <label className="text-[11px] text-off-black/50 hover:text-off-black cursor-pointer inline-flex items-center gap-1"><Upload className="w-3 h-3" /> Add<input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff" onChange={e => { if (e.target.files?.[0]) onUpload(e.target.files[0]); e.target.value = '' }} /></label>
          )}
        </td>
        <td className="px-3 py-2">{r.completed ? <Check className="w-4 h-4 text-green-600" /> : <span className="text-off-black/30">·</span>}</td>
        <td className="px-2 py-2 text-right whitespace-nowrap">
          <button onClick={onEdit} className={btnGhost}>{editing ? 'Close' : 'Edit'}</button>
          <button onClick={onRemove} className={btnGhost} title="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
        </td>
      </tr>
      {editing && (
        <tr className="bg-subtle-gray/60">
          <td colSpan={9} className="px-3 py-3">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Runner name" className={`${inputBase} col-span-2`} />
              <input value={a.line1} onChange={e => setA({ ...a, line1: e.target.value })} placeholder="Address" className={`${inputBase} col-span-2`} />
              <input value={a.line2} onChange={e => setA({ ...a, line2: e.target.value })} placeholder="Apt / unit" className={inputBase} />
              <input value={a.city} onChange={e => setA({ ...a, city: e.target.value })} placeholder="City" className={inputBase} />
              <input value={a.state} onChange={e => setA({ ...a, state: e.target.value })} placeholder="State" className={inputBase} />
              <input value={a.zip} onChange={e => setA({ ...a, zip: e.target.value })} placeholder="Zip" className={inputBase} />
              <input value={a.country} onChange={e => setA({ ...a, country: e.target.value })} placeholder="Country" className={inputBase} />
              <div className="col-span-2 md:col-span-3 flex justify-end gap-2"><button onClick={() => onSave({ runnerName: name, address: a })} className={btnPrimary}>Save</button></div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
