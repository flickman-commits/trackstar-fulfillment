import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { btnPrimary, btnSecondary } from '@/lib/ui'

const API_BASE = import.meta.env.VITE_API_URL || ''

/**
 * The custom design fee.
 *
 * A custom print costs the standard print price for the same size and frame
 * plus this fee, so the fee is the only number to change. Saving reprices
 * every custom variant in Shopify and stores the fee where the storefront's
 * copy reads it ("*Price includes the $125 design fee"), so prices and words
 * move together. See server/services/customPricing.js.
 */

interface PlanRow {
  variantId: string
  productTitle: string
  size: string
  frame: string
  standard: string
  current: string
  next: string
  changes: boolean
}

interface Plan {
  currentFee: number
  fee: number
  rows: PlanRow[]
  problems: { productTitle: string; size: string | null; frame: string | null; reason: string }[]
}

const SIZE_ORDER = ['8x10', '12x18', '16x24', '24x36']
const usd = (s: string) => `$${Number(s).toFixed(0)}`

/** "Natural Premium Oak" and "Natural Oak" price the same; group them. */
function material(frame: string) {
  const f = frame.toLowerCase()
  if (f.includes('natural')) return 'Natural oak'
  if (f.includes('black')) return 'Black oak'
  return 'Unframed'
}

export default function CustomFeePanel({ onApplied }: { onApplied?: () => void }) {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [applying, setApplying] = useState(false)
  const reqId = useRef(0)

  const load = useCallback(async (fee?: number) => {
    const id = ++reqId.current
    setLoading(true)
    setError(null)
    try {
      const qs = fee === undefined ? '' : `?fee=${fee}`
      const res = await apiFetch(`${API_BASE}/api/products/custom-fee${qs}`)
      const json = await res.json()
      if (id !== reqId.current) return // a newer preview superseded this one
      if (!res.ok) throw new Error(json.error || 'Could not load the custom pricing')
      setPlan(json)
      if (fee === undefined) setDraft(String(json.currentFee))
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : 'Could not load the custom pricing')
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const draftFee = /^\d{1,4}$/.test(draft) ? Number(draft) : null

  // Re-plan as the fee is typed, after a short pause.
  useEffect(() => {
    if (!plan || draftFee === null || draftFee === plan.fee) return
    const t = setTimeout(() => load(draftFee), 400)
    return () => clearTimeout(t)
  }, [draftFee, plan, load])

  // Both custom products share one price grid, so show one row per size and
  // frame rather than the same numbers twice.
  const grid = useMemo(() => {
    if (!plan) return []
    const byKey = new Map<string, { size: string; frame: string; standard: string; current: Set<string>; next: string; products: Set<string>; changes: number }>()
    for (const r of plan.rows) {
      const frame = material(r.frame)
      const key = `${r.size}|${frame}`
      if (!byKey.has(key)) byKey.set(key, { size: r.size, frame, standard: r.standard, current: new Set(), next: r.next, products: new Set(), changes: 0 })
      const g = byKey.get(key)!
      g.current.add(r.current)
      g.products.add(r.productTitle)
      if (r.changes) g.changes++
    }
    const frameOrder = ['Unframed', 'Natural oak', 'Black oak']
    return [...byKey.values()].sort((a, b) =>
      (SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size)) || (frameOrder.indexOf(a.frame) - frameOrder.indexOf(b.frame)))
  }, [plan])

  const changing = plan ? plan.rows.filter(r => r.changes).length : 0
  const products = plan ? [...new Set(plan.rows.map(r => r.productTitle))] : []
  const feeChanges = plan ? draftFee !== null && draftFee !== plan.currentFee : false
  const previewReady = plan && draftFee !== null && plan.fee === draftFee && !loading
  const nothingToDo = previewReady && changing === 0 && !feeChanges

  async function apply() {
    if (draftFee === null) return
    setApplying(true)
    try {
      const res = await apiFetch(`${API_BASE}/api/products/custom-fee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', fee: draftFee }),
      })
      const json = await res.json()
      if (!res.ok && res.status !== 207) throw new Error(json.error || 'Could not save')
      if (json.feeSaved) {
        toast.success(`Design fee is now $${json.fee}. Repriced ${json.repriced} custom variant${json.repriced === 1 ? '' : 's'}.`)
      } else {
        toast.error(`${json.failures?.length || 0} prices failed to update, so the fee stayed at $${json.feeBefore}. Save again to retry.`)
      }
      setConfirming(false)
      await load()
      onApplied?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="bg-white border border-border-gray rounded-xl p-4 md:p-5 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="text-base font-semibold text-off-black">Custom design fee</h2>
          <p className="text-xs text-off-black/55 mt-1 leading-relaxed">
            Custom prints cost the standard print price for the same size and frame, plus this fee.
            Saving reprices {products.length ? products.join(' and ') : 'every custom product'} in Shopify and updates the fee
            everywhere the site mentions it.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <p className="text-[11px] font-semibold text-off-black/50 uppercase tracking-wider mb-1.5">Fee</p>
            <div className="relative w-28">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-off-black/40 text-sm">$</span>
              <input
                value={draft}
                onChange={e => { setDraft(e.target.value.replace(/[^0-9]/g, '')); setConfirming(false) }}
                inputMode="numeric"
                aria-label="Custom design fee in dollars"
                className="w-full pl-7 pr-3 py-2 border border-border-gray rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20"
              />
            </div>
          </div>
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              disabled={!previewReady || nothingToDo || applying}
              className={btnPrimary + ' py-2.5'}
            >
              Review and save
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setConfirming(false)} disabled={applying} className={btnSecondary + ' py-2.5'}>Cancel</button>
              <button onClick={apply} disabled={applying} className={btnPrimary + ' py-2.5'}>
                {applying ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : `Reprice ${changing} & set fee to $${draftFee}`}
              </button>
            </div>
          )}
        </div>
      </div>

      {plan && (
        <p className="text-xs text-off-black/45 mt-3">
          Current fee <span className="font-semibold text-off-black/70">${plan.currentFee}</span>
          {previewReady && (nothingToDo
            ? ' · Every custom price already matches.'
            : ` · ${changing} custom variant${changing === 1 ? '' : 's'} will change${feeChanges ? `, and the site will say $${draftFee}` : ''}.`)}
        </p>
      )}

      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error} <button onClick={() => load()} className="ml-2 underline">Retry</button>
        </div>
      )}

      {plan && plan.problems.length > 0 && (
        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            {plan.problems.length} custom variant{plan.problems.length === 1 ? '' : 's'} can't be priced automatically and will be left alone:{' '}
            {plan.problems.map(p => `${p.productTitle} ${p.size || '?'} ${p.frame || ''}`.trim()).join(', ')}.
          </span>
        </div>
      )}

      {grid.length > 0 && (
        <div className={`mt-4 border border-border-gray rounded-lg overflow-hidden ${loading ? 'opacity-60' : ''}`}>
          <table className="w-full text-sm">
            <thead className="bg-off-white">
              <tr className="text-left text-[11px] uppercase tracking-wider text-off-black/40">
                <th className="px-3 py-2 font-semibold">Size</th>
                <th className="px-3 py-2 font-semibold">Frame</th>
                <th className="px-3 py-2 font-semibold text-right">Standard</th>
                <th className="px-3 py-2 font-semibold text-right">+ Fee</th>
                <th className="px-3 py-2 font-semibold text-right">Custom now</th>
                <th className="px-3 py-2 font-semibold text-right">Custom new</th>
              </tr>
            </thead>
            <tbody>
              {grid.map(g => (
                <tr key={`${g.size}|${g.frame}`} className="border-t border-border-gray">
                  <td className="px-3 py-2 text-off-black/80">{g.size}</td>
                  <td className="px-3 py-2 text-off-black/60">{g.frame}</td>
                  <td className="px-3 py-2 text-right text-off-black/60">{usd(g.standard)}</td>
                  <td className="px-3 py-2 text-right text-off-black/40">${plan?.fee}</td>
                  <td className="px-3 py-2 text-right text-off-black/60">{[...g.current].map(usd).join(' / ')}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${g.changes ? 'text-purple-700' : 'text-off-black/70'}`}>
                    {usd(g.next)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loading && !plan && (
        <div className="flex items-center gap-2 text-off-black/50 py-8 justify-center text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading custom pricing…
        </div>
      )}
    </div>
  )
}
