import { useEffect, useState, useCallback } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { apiFetch } from '@/lib/api'

const API_BASE = import.meta.env.VITE_API_URL || ''

/**
 * Artelo landed-cost matrix, shown inside the Settings modal.
 *
 * Costs are live from Artelo's pricing API, priced the way we actually order:
 * archival matte fine art paper, and framed items with framing service and
 * hanging pins included.
 *
 * "Framed" resolves per size to whichever Artelo frame style that size ships
 * with, and each cell labels the style it used. Every size is Premium Oak as
 * of Aug 2026; 8x10 was standard Oak before that. The storefront calls both
 * just "Black Oak" / "Natural Oak", so a change like that is invisible from
 * Shopify and only shows up in the landed cost.
 */

interface Cell {
  productionCost?: number
  shippingCost?: number
  brandingCost?: number
  totalCost?: number
  frameLabel?: string
  error?: string
}

interface CostMatrix {
  sizes: { id: string; label: string; framedLabel: string }[]
  columns: { id: string; label: string }[]
  cells: Record<string, Cell>
  fetchedAt: string
  shippingDestination: string
  quantity: number
}

export default function ArteloCosts() {
  const [data, setData] = useState<CostMatrix | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch(`${API_BASE}/api/products/artelo-costs`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load Artelo costs')
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Artelo costs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-off-black/50">
          Live from Artelo, priced per unit shipping to the US.
        </p>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-1.5 text-xs text-off-black/60">
            <input
              type="checkbox"
              checked={showBreakdown}
              onChange={e => setShowBreakdown(e.target.checked)}
              className="w-3.5 h-3.5"
            />
            Show breakdown
          </label>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-off-black/70 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-off-black/50">
          <Loader2 className="w-4 h-4 animate-spin" /> Pricing every size and frame…
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      {data && (
        <>
          <div className="overflow-x-auto border border-border-gray rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-subtle-gray text-left text-[11px] uppercase tracking-wider text-off-black/40">
                  <th className="px-3 py-2 font-semibold">Size</th>
                  {data.columns.map(c => (
                    <th key={c.id} className="px-3 py-2 font-semibold text-right whitespace-nowrap">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.sizes.map(size => (
                  <tr key={size.id} className="border-t border-border-gray/60">
                    <td className="px-3 py-2 font-medium text-off-black whitespace-nowrap">{size.label}</td>
                    {data.columns.map(col => {
                      const cell = data.cells[`${size.id}|${col.id}`]
                      if (!cell || cell.error) {
                        return <td key={col.id} className="px-3 py-2 text-right text-off-black/25">—</td>
                      }
                      return (
                        <td key={col.id} className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                          <span className="font-semibold text-off-black">${cell.totalCost!.toFixed(2)}</span>
                          {col.id === 'Framed' && (
                            <span className="block text-[11px] text-off-black/40">{cell.frameLabel}</span>
                          )}
                          {showBreakdown && (
                            <span className="block text-[11px] text-off-black/40 leading-tight mt-0.5">
                              ${cell.productionCost!.toFixed(2)} make<br />
                              ${cell.shippingCost!.toFixed(2)} ship<br />
                              ${cell.brandingCost!.toFixed(2)} branding
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 space-y-1 text-[11px] text-off-black/40 leading-relaxed">
            <p>
              Every size ships as Premium Oak. Colour makes no difference to cost, so black and natural are the same price.
            </p>
            <p>
              Priced as we order: archival matte fine art paper, no mats, and framed items include framing service and hanging pins.
            </p>
            <p>
              Package branding is charged once per order, not per print, so a multi-print order pays it only once.
            </p>
            <p>Fetched {new Date(data.fetchedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
          </div>
        </>
      )}
    </div>
  )
}
