import { useEffect, useMemo, useState, useCallback } from 'react'
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { apiFetch } from '@/lib/api'

const API_BASE = import.meta.env.VITE_API_URL || ''

/**
 * Pricing calculator: what a print costs us, what we charge, and what is left.
 *
 * Costs are live from Artelo and retail prices are live from Shopify, so the
 * only numbers typed in by hand are the ones that are genuinely a negotiation
 * (wholesale discount, charity terms).
 *
 * The channel tabs are not cosmetic. They change how the unit is shipped:
 *
 *   Retail DTC — one print per order, so shipping, package branding and the
 *                flat 30c payment fee are carried by that single unit. Quantity
 *                is fixed at 1 because a busy month is still one box per order.
 *   Wholesale / Charity — one consignment, so those same per-order costs divide
 *                across the run. This is where the margin comes from at volume:
 *                Artelo gives no production discount at all, so a bulk quote
 *                built on retail's per-unit shipping is simply wrong.
 */

type Channel = 'retail' | 'wholesale' | 'charity'

interface Row {
  key: string
  sizeLabel: string
  frame: 'Unframed' | 'Framed'
  frameLabel: string
  productionCost: number
  orderShipping: number
  brandingCost: number
  retailPrice: number | null
  retailVariantCount: number
  retailOutliers: { price: number; count: number }[]
  error?: string
}

interface PricingData {
  quantity: number
  fetchedAt: string
  rows: Row[]
  assumptions: {
    shopifyFeePercent: number
    shopifyFeeFixed: number
    photoAddOnPrice: number
    photoAddOnCost: number
  }
}

const CHANNELS: { id: Channel; label: string; blurb: string }[] = [
  { id: 'retail', label: 'Retail (DTC)', blurb: 'One print per order, shipped on its own.' },
  { id: 'wholesale', label: 'Wholesale', blurb: 'One consignment — shipping and fees split across the run.' },
  { id: 'charity', label: 'Charity partner', blurb: 'One consignment at partner pricing.' },
]

const money = (n: number) => `$${n.toFixed(2)}`

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-off-black/40 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-green-700' : 'text-off-black'}`}>{value}</p>
    </div>
  )
}

export default function PricingCalculator() {
  const [data, setData] = useState<PricingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [channel, setChannel] = useState<Channel>('retail')
  const [quantity, setQuantity] = useState(25)
  const [includePhoto, setIncludePhoto] = useState(false)
  // Channel pricing levers. Percentages are off retail.
  const [wholesaleDiscount, setWholesaleDiscount] = useState('50')
  const [charityDiscount, setCharityDiscount] = useState('40')

  // Retail always ships one at a time; bulk channels ship as one consignment.
  const effectiveQty = channel === 'retail' ? 1 : Math.max(1, Number(quantity) || 1)

  const load = useCallback(async (qty: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch(`${API_BASE}/api/products/pricing?quantity=${qty}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load pricing')
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pricing')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(effectiveQty) }, [load, effectiveQty])

  const discountPct = channel === 'wholesale' ? Number(wholesaleDiscount)
    : channel === 'charity' ? Number(charityDiscount) : 0

  const computed = useMemo(() => {
    if (!data) return []
    const { shopifyFeePercent, shopifyFeeFixed, photoAddOnPrice, photoAddOnCost } = data.assumptions
    const qty = data.quantity

    return data.rows.filter(r => !r.error).map(r => {
      const base = r.retailPrice ?? 0
      const price = channel === 'retail'
        ? base
        : Math.round(base * (1 - (Number.isFinite(discountPct) ? discountPct : 0) / 100) * 100) / 100

      const unitShipping = r.orderShipping / qty
      const unitBranding = r.brandingCost / qty
      const unitCost = r.productionCost + unitShipping + unitBranding + (includePhoto ? photoAddOnCost : 0)
      const unitPrice = price + (includePhoto ? photoAddOnPrice : 0)
      // Percentage applies per unit; the flat fee is per order, so it divides.
      const unitFee = unitPrice * shopifyFeePercent + shopifyFeeFixed / qty
      const gp = unitPrice - unitCost - unitFee

      return {
        ...r,
        unitPrice,
        unitShipping,
        unitBranding,
        unitCost,
        unitFee,
        gp,
        gpPct: unitPrice > 0 ? (gp / unitPrice) * 100 : null,
      }
    })
  }, [data, channel, discountPct, includePhoto])

  const totals = useMemo(() => {
    if (!computed.length) return null
    const qty = data?.quantity ?? 1
    // A run of one size, not a blended basket — this is "if the whole order
    // were this line", which is how these quotes actually get negotiated.
    const framed = computed.filter(r => r.frame === 'Framed')
    const revenue = framed.reduce((s, r) => s + r.unitPrice, 0) * qty / (framed.length || 1)
    const profit = framed.reduce((s, r) => s + r.gp, 0) * qty / (framed.length || 1)
    return { revenue, profit, pct: revenue > 0 ? (profit / revenue) * 100 : 0 }
  }, [computed, data])

  const outlierWarnings = (data?.rows || []).filter(r => (r.retailOutliers?.length || 0) > 0)

  return (
    <div>
      {/* Channel tabs */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {CHANNELS.map(c => (
          <button
            key={c.id}
            onClick={() => setChannel(c.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              channel === c.id
                ? 'bg-off-black text-white border-off-black'
                : 'bg-white text-off-black/60 border-border-gray hover:bg-off-black/5'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-off-black/40 mb-3">{CHANNELS.find(c => c.id === channel)?.blurb}</p>

      {/* Controls */}
      <div className="bg-subtle-gray border border-border-gray rounded-lg p-3 mb-4 flex flex-wrap items-end gap-4">
        {channel !== 'retail' && (
          <>
            <div>
              <label className="block text-[11px] font-semibold text-off-black/50 uppercase tracking-wider mb-1">Units in shipment</label>
              <input
                value={quantity}
                onChange={e => setQuantity(Number(e.target.value.replace(/[^0-9]/g, '')) || 1)}
                inputMode="numeric"
                className="w-24 px-2.5 py-1.5 border border-border-gray rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-off-black/50 uppercase tracking-wider mb-1">
                {channel === 'wholesale' ? 'Wholesale' : 'Partner'} discount
              </label>
              <div className="relative w-24">
                <input
                  value={channel === 'wholesale' ? wholesaleDiscount : charityDiscount}
                  onChange={e => {
                    const v = e.target.value.replace(/[^0-9.]/g, '')
                    channel === 'wholesale' ? setWholesaleDiscount(v) : setCharityDiscount(v)
                  }}
                  inputMode="decimal"
                  className="w-full pl-2.5 pr-6 py-1.5 border border-border-gray rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-off-black/40 text-xs">%</span>
              </div>
            </div>
          </>
        )}
        <label className="inline-flex items-center gap-2 text-sm text-off-black/70 pb-1.5">
          <input type="checkbox" checked={includePhoto} onChange={e => setIncludePhoto(e.target.checked)} className="w-4 h-4" />
          Photo add-on {data ? `(+${money(data.assumptions.photoAddOnPrice)})` : ''}
        </label>
        <div className="flex-1" />
        <button
          onClick={() => load(effectiveQty)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-off-black/70 bg-white border border-border-gray hover:bg-off-black/5 rounded-md transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-off-black/50">
          <Loader2 className="w-4 h-4 animate-spin" /> Pricing every size and frame…
        </div>
      )}
      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

      {data && (
        <>
          <div className="overflow-x-auto border border-border-gray rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-subtle-gray text-left text-[11px] uppercase tracking-wider text-off-black/40">
                  <th className="px-3 py-2 font-semibold">Size</th>
                  <th className="px-3 py-2 font-semibold">Frame</th>
                  <th className="px-3 py-2 font-semibold text-right">Price</th>
                  <th className="px-3 py-2 font-semibold text-right">Cost</th>
                  <th className="px-3 py-2 font-semibold text-right">Fees</th>
                  <th className="px-3 py-2 font-semibold text-right">Gross profit</th>
                  <th className="px-3 py-2 font-semibold text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {computed.map(r => (
                  <tr key={r.key} className="border-t border-border-gray/60">
                    <td className="px-3 py-2 font-medium text-off-black whitespace-nowrap">{r.sizeLabel}</td>
                    <td className="px-3 py-2 text-off-black/60 whitespace-nowrap">
                      {r.frame === 'Framed' ? r.frameLabel : 'Unframed'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.unitPrice)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-off-black/60">
                      {money(r.unitCost)}
                      <span className="block text-[10px] text-off-black/35 leading-tight">
                        {money(r.productionCost)} make · {money(r.unitShipping)} ship
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-off-black/60">{money(r.unitFee)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${r.gp < 0 ? 'text-red-600' : 'text-green-700'}`}>
                      {money(r.gp)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${r.gp < 0 ? 'text-red-600' : 'text-off-black'}`}>
                      {r.gpPct === null ? '—' : `${r.gpPct.toFixed(0)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Order-level roll-up, bulk channels only */}
          {channel !== 'retail' && totals && (
            <div className="mt-3 grid grid-cols-3 gap-4 bg-subtle-gray border border-border-gray rounded-lg p-3">
              <Stat label={`Revenue · ${data.quantity} framed`} value={money(totals.revenue)} />
              <Stat label="Gross profit" value={money(totals.profit)} tone={totals.profit < 0 ? 'bad' : 'good'} />
              <Stat label="Margin" value={`${totals.pct.toFixed(0)}%`} tone={totals.profit < 0 ? 'bad' : undefined} />
            </div>
          )}

          {outlierWarnings.length > 0 && (
            <div className="mt-3 flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Retail prices are not uniform for every size.</p>
                {outlierWarnings.map(r => (
                  <p key={r.key}>
                    {r.sizeLabel} {r.frame}: mostly {money(r.retailPrice ?? 0)}, but{' '}
                    {r.retailOutliers.map(o => `${o.count} at ${money(o.price)}`).join(', ')}. The table uses the common price.
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 space-y-1 text-[11px] text-off-black/40 leading-relaxed">
            <p>
              Costs live from Artelo, retail prices live from Shopify. Every size ships as Premium Oak; frame color makes no difference to cost, so black and natural are the same price.
            </p>
            <p>
              Priced as we order: archival matte fine art paper, no mats, and framed items include framing service and hanging pins.
            </p>
            <p>
              {channel === 'retail'
                ? 'Retail ships one print per order, so that unit carries the full shipping, the $0.80 package branding and the flat 30c of the payment fee.'
                : `Bulk ships as one consignment of ${data.quantity}, so shipping, package branding and the flat 30c payment fee divide across the run. Production cost does not fall with volume — Artelo gives no quantity discount.`}
            </p>
            <p>
              Fees are Shopify Payments at {(data.assumptions.shopifyFeePercent * 100).toFixed(1)}% + {money(data.assumptions.shopifyFeeFixed)} per order. Gross profit excludes design time, returns and sales tax.
            </p>
            <p>Fetched {new Date(data.fetchedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
          </div>
        </>
      )}
    </div>
  )
}
