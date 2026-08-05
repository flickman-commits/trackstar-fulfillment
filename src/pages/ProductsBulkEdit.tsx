import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, ArrowLeft, RotateCcw, AlertTriangle, Check } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'

const API_BASE = import.meta.env.VITE_API_URL || ''

/**
 * Bulk product editor.
 *
 * The shape is filter -> preview -> apply, deliberately not a CSV round trip:
 * you can see every row that is about to change, with its before and after
 * price, before anything is written. Apply sends the exact variant IDs shown
 * in the table, so the preview and the write can never disagree.
 */

interface Variant {
  variantId: string
  productId: string
  productTitle: string
  productHandle: string
  productStatus: string
  imageUrl: string | null
  tags: string[]
  isCustom: boolean
  sku: string | null
  price: string
  size: string | null
  frame: string | null
}

interface Batch {
  id: string
  createdAt: string
  description: string
  count: number
  undoneAt: string | null
}

type PriceMode = 'set' | 'percent' | 'amount'

function money(n: number) {
  return `$${n.toFixed(2)}`
}

/** The new price for a row, or null when the rule does not produce a change. */
function computeNewPrice(current: string, mode: PriceMode, raw: string): number | null {
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  const cur = Number(current)
  if (!Number.isFinite(cur)) return null
  let next: number
  if (mode === 'set') next = value
  else if (mode === 'percent') next = cur * (1 + value / 100)
  else next = cur + value
  if (!Number.isFinite(next) || next <= 0) return null
  return Math.round(next * 100) / 100
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
        active
          ? 'bg-off-black text-white border-off-black'
          : 'bg-white text-off-black/60 border-border-gray hover:bg-off-black/5'
      }`}
    >
      {children}
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-off-black/50 uppercase tracking-wider mb-1.5">{label}</p>
      {children}
    </div>
  )
}

export default function ProductsBulkEdit() {
  const [variants, setVariants] = useState<Variant[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [batches, setBatches] = useState<Batch[]>([])

  // Filters
  const [sizes, setSizes] = useState<string[]>([])
  const [frames, setFrames] = useState<string[]>([])
  const [titleQuery, setTitleQuery] = useState('')
  const [excludeCustom, setExcludeCustom] = useState(true)
  const [activeOnly, setActiveOnly] = useState(false)

  // Price rule
  const [mode, setMode] = useState<PriceMode>('set')
  const [amount, setAmount] = useState('')

  const [applying, setApplying] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await apiFetch(`${API_BASE}/api/products/bulk-edit?action=catalog`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load catalog')
      setVariants(data.variants)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load catalog')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadBatches = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/api/products/bulk-edit?action=batches`)
      const data = await res.json()
      if (res.ok) setBatches(data.batches)
    } catch { /* the batch list is a convenience, not worth surfacing */ }
  }, [])

  useEffect(() => { loadCatalog(); loadBatches() }, [loadCatalog, loadBatches])

  const allSizes = useMemo(
    () => [...new Set(variants.map(v => v.size).filter(Boolean))] as string[],
    [variants]
  )
  const allFrames = useMemo(
    () => [...new Set(variants.map(v => v.frame).filter(Boolean))] as string[],
    [variants]
  )

  const matched = useMemo(() => {
    const q = titleQuery.trim().toLowerCase()
    return variants.filter(v => {
      if (sizes.length && (!v.size || !sizes.includes(v.size))) return false
      if (frames.length && (!v.frame || !frames.includes(v.frame))) return false
      if (excludeCustom && v.isCustom) return false
      if (activeOnly && v.productStatus !== 'ACTIVE') return false
      if (q && !v.productTitle.toLowerCase().includes(q)) return false
      return true
    })
  }, [variants, sizes, frames, titleQuery, excludeCustom, activeOnly])

  // Rows that would actually move. A variant already at the target price is
  // matched but not changed, and is called out separately so the counts add up.
  const rows = useMemo(
    () => matched.map(v => ({ v, next: computeNewPrice(v.price, mode, amount) })),
    [matched, mode, amount]
  )
  const changing = useMemo(
    () => rows.filter(r => r.next !== null && r.next.toFixed(2) !== Number(r.v.price).toFixed(2)),
    [rows]
  )
  const unchanged = rows.length - changing.length

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) =>
    setList(list.includes(value) ? list.filter(x => x !== value) : [...list, value])

  // Only a single uniform target price can be applied in one batch, because
  // that is all the API takes. Percent and amount rules produce per-row prices,
  // so they are previewed but applied one price group at a time.
  const priceGroups = useMemo(() => {
    const groups = new Map<string, string[]>()
    for (const r of changing) {
      const key = r.next!.toFixed(2)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(r.v.variantId)
    }
    return [...groups.entries()]
  }, [changing])

  const apply = async () => {
    setApplying(true)
    try {
      let applied = 0
      const allFailures: { productId: string; message: string }[] = []
      for (const [price, variantIds] of priceGroups) {
        const res = await apiFetch(`${API_BASE}/api/products/bulk-edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'apply',
            variantIds,
            price,
            filters: { sizes, frames, titleQuery, excludeCustom, activeOnly, mode, amount },
            description:
              mode === 'set' ? `Set price to $${price}`
              : mode === 'percent' ? `${Number(amount) >= 0 ? '+' : ''}${amount}% to $${price}`
              : `${Number(amount) >= 0 ? '+' : ''}$${amount} to $${price}`,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Apply failed')
        applied += data.applied
        allFailures.push(...(data.failures || []))
      }
      if (allFailures.length) {
        toast.error(`${applied} updated, ${allFailures.length} product(s) failed`)
        console.error('Bulk edit failures:', allFailures)
      } else {
        toast.success(`Updated ${applied} variant${applied === 1 ? '' : 's'}`)
      }
      setConfirming(false)
      await Promise.all([loadCatalog(), loadBatches()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Apply failed')
    } finally {
      setApplying(false)
    }
  }

  const undo = async (batch: Batch) => {
    if (!window.confirm(`Undo "${batch.description}"? This restores ${batch.count} variant price${batch.count === 1 ? '' : 's'}.`)) return
    try {
      const res = await apiFetch(`${API_BASE}/api/products/bulk-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'undo', batchId: batch.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Undo failed')
      if (data.fullyUndone) toast.success(`Reverted ${data.reverted} variants`)
      else toast.error(`Reverted ${data.reverted} of ${data.total}; some failed`)
      await Promise.all([loadCatalog(), loadBatches()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Undo failed')
    }
  }

  return (
    <div className="min-h-screen bg-off-white">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-off-black/50 hover:text-off-black mb-4">
          <ArrowLeft className="w-4 h-4" /> Orders
        </Link>
        <div className="flex items-baseline justify-between mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-off-black">Bulk Product Editor</h1>
          {!loading && (
            <p className="text-sm text-off-black/40">{variants.length} variants</p>
          )}
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-off-black/50 py-16 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading catalog from Shopify…
          </div>
        )}

        {loadError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            {loadError}
            <button onClick={loadCatalog} className="ml-3 underline">Retry</button>
          </div>
        )}

        {!loading && !loadError && (
          <>
            {/* Filters */}
            <div className="bg-white border border-border-gray rounded-xl p-4 md:p-5 mb-4 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Size">
                  <div className="flex flex-wrap gap-1.5">
                    {allSizes.map(s => (
                      <Chip key={s} active={sizes.includes(s)} onClick={() => toggle(sizes, setSizes, s)}>{s}</Chip>
                    ))}
                  </div>
                </Field>
                <Field label="Frame">
                  <div className="flex flex-wrap gap-1.5">
                    {allFrames.map(f => (
                      <Chip key={f} active={frames.includes(f)} onClick={() => toggle(frames, setFrames, f)}>{f}</Chip>
                    ))}
                  </div>
                </Field>
              </div>
              <div className="grid md:grid-cols-2 gap-4 items-end">
                <Field label="Product title contains">
                  <input
                    value={titleQuery}
                    onChange={e => setTitleQuery(e.target.value)}
                    placeholder="Any product"
                    className="w-full px-3 py-2 border border-border-gray rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20"
                  />
                </Field>
                <div className="flex flex-wrap gap-4 pb-1">
                  <label className="inline-flex items-center gap-2 text-sm text-off-black/70">
                    <input type="checkbox" checked={excludeCustom} onChange={e => setExcludeCustom(e.target.checked)} className="w-4 h-4" />
                    Exclude custom products
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-off-black/70">
                    <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} className="w-4 h-4" />
                    Active products only
                  </label>
                </div>
              </div>
            </div>

            {/* Price rule */}
            <div className="bg-white border border-border-gray rounded-xl p-4 md:p-5 mb-4">
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Change">
                  <div className="flex gap-1.5">
                    <Chip active={mode === 'set'} onClick={() => setMode('set')}>Set to</Chip>
                    <Chip active={mode === 'amount'} onClick={() => setMode('amount')}>Adjust $</Chip>
                    <Chip active={mode === 'percent'} onClick={() => setMode('percent')}>Adjust %</Chip>
                  </div>
                </Field>
                <Field label={mode === 'percent' ? 'Percent' : 'Amount'}>
                  <div className="relative w-40">
                    {mode !== 'percent' && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-off-black/40 text-sm">$</span>
                    )}
                    <input
                      value={amount}
                      onChange={e => setAmount(e.target.value.replace(/[^0-9.-]/g, ''))}
                      placeholder={mode === 'percent' ? '10' : '100'}
                      inputMode="decimal"
                      className={`w-full py-2 border border-border-gray rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20 ${
                        mode !== 'percent' ? 'pl-7 pr-3' : 'px-3'
                      }`}
                    />
                    {mode === 'percent' && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-off-black/40 text-sm">%</span>
                    )}
                  </div>
                </Field>
                <div className="flex-1" />
                <div className="text-right">
                  <p className="text-2xl font-bold text-off-black leading-tight">{changing.length}</p>
                  <p className="text-xs text-off-black/50">
                    will change{unchanged > 0 && `, ${unchanged} already match`}
                  </p>
                </div>
                <button
                  onClick={() => setConfirming(true)}
                  disabled={!changing.length || applying}
                  className="px-4 py-2.5 text-sm font-medium text-white bg-off-black hover:opacity-90 rounded-md transition-opacity disabled:opacity-30"
                >
                  Review and apply
                </button>
              </div>
            </div>

            {/* Preview */}
            <div className="bg-white border border-border-gray rounded-xl overflow-hidden mb-6">
              <div className="px-4 py-3 border-b border-border-gray flex items-center justify-between">
                <p className="text-xs font-semibold text-off-black/50 uppercase tracking-wider">Preview</p>
                <p className="text-xs text-off-black/40">{matched.length} matched</p>
              </div>
              {!matched.length ? (
                <p className="px-4 py-10 text-center text-sm text-off-black/40">No variants match these filters.</p>
              ) : (
                <div className="max-h-[26rem] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-off-white/95 backdrop-blur">
                      <tr className="text-left text-[11px] uppercase tracking-wider text-off-black/40">
                        <th className="px-4 py-2 font-semibold">Product</th>
                        <th className="px-3 py-2 font-semibold">Size</th>
                        <th className="px-3 py-2 font-semibold">Frame</th>
                        <th className="px-3 py-2 font-semibold text-right">Current</th>
                        <th className="px-4 py-2 font-semibold text-right">New</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ v, next }) => {
                        const willChange = next !== null && next.toFixed(2) !== Number(v.price).toFixed(2)
                        return (
                          <tr key={v.variantId} className="border-t border-border-gray/60">
                            <td className="px-4 py-2">
                              <span className="text-off-black">{v.productTitle}</span>
                              {v.productStatus !== 'ACTIVE' && (
                                <span className="ml-2 px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-50 text-amber-700 border border-amber-200">
                                  {v.productStatus}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-off-black/60">{v.size || '—'}</td>
                            <td className="px-3 py-2 text-off-black/60">{v.frame || '—'}</td>
                            <td className="px-3 py-2 text-right text-off-black/60 tabular-nums">{money(Number(v.price))}</td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              {next === null ? (
                                <span className="text-off-black/30">—</span>
                              ) : willChange ? (
                                <span className="font-semibold text-green-700">{money(next)}</span>
                              ) : (
                                <span className="text-off-black/30">no change</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Recent batches */}
            {batches.length > 0 && (
              <div className="bg-white border border-border-gray rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border-gray">
                  <p className="text-xs font-semibold text-off-black/50 uppercase tracking-wider">Recent changes</p>
                </div>
                <ul>
                  {batches.map(b => (
                    <li key={b.id} className="px-4 py-3 border-t border-border-gray/60 first:border-t-0 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm text-off-black truncate">{b.description}</p>
                        <p className="text-xs text-off-black/40">
                          {b.count} variant{b.count === 1 ? '' : 's'} · {new Date(b.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                      {b.undoneAt ? (
                        <span className="inline-flex items-center gap-1 text-xs text-off-black/40 shrink-0">
                          <Check className="w-3.5 h-3.5" /> Undone
                        </span>
                      ) : (
                        <button
                          onClick={() => undo(b)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-off-black/70 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors shrink-0"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Undo
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {/* Confirm */}
      {confirming && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={() => !applying && setConfirming(false)}>
          <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-lg font-semibold text-off-black">Apply to {changing.length} variant{changing.length === 1 ? '' : 's'}?</h2>
                <p className="text-sm text-off-black/60 mt-1">
                  These are live storefront prices and the change takes effect immediately. You can undo this batch afterwards.
                </p>
              </div>
            </div>
            <div className="bg-off-white rounded-lg p-3 mb-5 max-h-40 overflow-y-auto">
              {priceGroups.map(([price, ids]) => (
                <p key={price} className="text-sm text-off-black/70">
                  {ids.length} variant{ids.length === 1 ? '' : 's'} to <span className="font-semibold text-off-black">${price}</span>
                </p>
              ))}
              <p className="text-xs text-off-black/40 mt-2">
                Across {new Set(changing.map(r => r.v.productId)).size} product{new Set(changing.map(r => r.v.productId)).size === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={apply}
                disabled={applying}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-off-black hover:opacity-90 rounded-md transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {applying ? <><Loader2 className="w-4 h-4 animate-spin" /> Applying…</> : 'Apply changes'}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={applying}
                className="px-4 py-2.5 text-sm font-medium text-off-black/70 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
