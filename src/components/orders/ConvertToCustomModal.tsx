import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { btnPrimary, btnGhost, inputBase, fieldLabel } from '@/lib/ui'

/**
 * Convert a standard print to a custom one (server/domain/orders/convertToCustom.js):
 * for a runner who ran a race we have no design for, when we would rather
 * design it than refund. Shopify is not changed. The print moves to the
 * custom queue, due with the order's other custom prints if it has any.
 */
export default function ConvertToCustomModal({ order, onClose, onDone }: {
  order: { id: string; displayOrderNumber?: string | null; runnerName?: string | null; effectiveRaceName?: string | null; raceName?: string | null; effectiveRaceYear?: number | null; raceYear?: number | null; customerBib?: string | null; customerFinishTime?: string | null }
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [race, setRace] = useState('')
  const [year, setYear] = useState(String(order.effectiveRaceYear || order.raceYear || ''))
  const [bib, setBib] = useState(order.customerBib || '')
  const [time, setTime] = useState(order.customerFinishTime || '')
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const from = `${order.effectiveRaceName || order.raceName || 'this race'} ${order.effectiveRaceYear || order.raceYear || ''}`.trim()

  const submit = async () => {
    setBusy(true); setErr(null)
    try {
      const res = await apiFetch('/api/orders/convert-to-custom', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, raceName: race, raceYear: year, bib, time, creativeDirection: notes, reason }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not convert it')
      const due = d.dueDate ? new Date(d.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null
      onDone(`Now a custom order${due ? `, due ${due}` : ''}${d.matchedSiblings ? ' with the order’s other custom prints' : ''}. It is in the Custom view.`)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={() => { if (!busy) onClose() }}
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape' && !busy) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label="Convert to a custom order" tabIndex={-1} ref={el => el?.focus()}
        className="bg-white rounded-lg shadow-2xl w-full max-w-lg max-h-full overflow-auto p-5 space-y-3 outline-none" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-off-black">Convert to a custom order</h3>
            <p className="text-xs text-off-black/55 mt-0.5">
              For a runner who ran a race we do not carry. The {from} print becomes a custom print and goes to the designer. Shopify is not changed: same price, same item.
            </p>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1 -m-1 text-off-black/40 hover:text-off-black" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-[1fr_96px] gap-2">
          <label className="block"><span className={fieldLabel}>Race they ran</span><input className={`${inputBase} w-full`} value={race} onChange={e => setRace(e.target.value)} placeholder="e.g. Foot Traffic Flat" autoFocus /></label>
          <label className="block"><span className={fieldLabel}>Year</span><input className={`${inputBase} w-full`} value={year} onChange={e => setYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} inputMode="numeric" /></label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className={fieldLabel}>Bib</span><input className={`${inputBase} w-full`} value={bib} onChange={e => setBib(e.target.value)} /></label>
          <label className="block"><span className={fieldLabel}>Finish time</span><input className={`${inputBase} w-full`} value={time} onChange={e => setTime(e.target.value)} placeholder="3:53:29" /></label>
        </div>
        <label className="block"><span className={fieldLabel}>What the customer wants (for the designer)</span>
          <textarea className={`${inputBase} w-full`} rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder={`Runner ${order.runnerName || ''}; course, colors, anything they asked for`} />
        </label>
        <label className="block"><span className={fieldLabel}>Why (kept on the order)</span>
          <input className={`${inputBase} w-full`} value={reason} onChange={e => setReason(e.target.value)} placeholder="Ran a race we do not carry; big customer, designing instead of refunding" />
        </label>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button className={btnGhost} onClick={onClose} disabled={busy}>Cancel</button>
          <button className={btnPrimary} onClick={submit} disabled={busy || !race.trim() || !reason.trim()}>{busy && <Loader2 className="w-3 h-3 animate-spin" />} Convert to custom</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
