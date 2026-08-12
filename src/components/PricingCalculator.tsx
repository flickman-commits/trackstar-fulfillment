import { useEffect, useMemo, useState, useCallback } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { apiFetch } from '@/lib/api'

const API_BASE = import.meta.env.VITE_API_URL || ''

/**
 * Pricing calculator: what a print costs us, what we charge, and what is left.
 *
 * Costs are live from Artelo and retail prices are live from Shopify, so the
 * only number typed in by hand is the discount, which is genuinely a
 * negotiation.
 *
 * The channel tabs are not cosmetic. They change how the unit is shipped:
 *
 *   Retail DTC — one print per order, so shipping, package branding and the
 *                flat 30c processing fee are carried by that single unit.
 *                Quantity is fixed at 1 because a busy month is still one box
 *                per order.
 *   Wholesale  — charities and race partners alike: one consignment, so the
 *                per-order costs divide across the run, and package branding
 *                is dropped entirely because bulk boxes go out plain.
 *
 * Volume margin comes from that amortization, not from cheaper printing —
 * Artelo gives no production discount at all, so a bulk quote built on
 * retail's per-unit shipping is simply wrong. Charities and race partners
 * were once separate tabs but differed only by discount percentage, which is
 * an input, not a channel.
 *
 * The Shipping column carries package branding as well as freight on DTC,
 * where both are billed per ORDER and amortize together. Bulk gets no branding
 * at all. Either way the row reads as arithmetic: price minus production minus
 * shipping minus processing fees is exactly gross profit.
 */

type Channel = 'retail' | 'wholesale'

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
    stripeFeePercent?: number
    stripeFeeFixed?: number
    wholesaleTiers?: { min: number; max: number | null; discount: number; label: string }[]
    wholesaleExcludedSizes?: string[]
    photoAddOnPrice: number
    photoAddOnCost: number
  }
}

const CHANNELS: { id: Channel; label: string; blurb: string }[] = [
  { id: 'retail', label: 'Retail (DTC)', blurb: 'One print per order, shipped on its own.' },
  {
    id: 'wholesale',
    label: 'Wholesale (Charities, Race Partners)',
    blurb: 'One consignment — shipping and the flat processing fee split across the run. No package branding.',
  },
]

const money = (n: number) => `$${n.toFixed(2)}`

/**
 * Wholesale prices round to whole dollars, halves UP. This differs from the
 * printed sheet in one cell only — 16x24 framed at 25% off is 142.5, shown as
 * $142 there and $143 here — which reads as a rounding artifact on the sheet
 * rather than a deliberate price.
 */
function roundHalfUp(n: number) {
  return Math.round(n)
}

/**
 * Row tint by margin. Absolute bands rather than "best in this table", so a
 * row means the same thing whichever channel you are looking at — a 45% line
 * should not read as healthy just because everything around it is worse.
 *
 * Thresholds are set where the decisions actually change: 75%+ is the strong
 * end of the range, 60-75% is workable but worth a look before discounting
 * further, and under 60% is where a quote stops being obviously worth doing.
 */
function marginTint(pct: number | null): { row: string; label: string; chip: string } {
  if (pct === null) return { row: '', label: 'text-off-black/40', chip: '' }
  // Band on the DISPLAYED figure, not the raw one. 64.6% renders as "65%",
  // and a row reading 65% while tinted as though it were below the threshold
  // just makes the reader distrust the color.
  const shown = Math.round(pct)
  if (shown >= 75) return { row: 'bg-emerald-50', label: 'text-emerald-700', chip: 'bg-emerald-100 border-emerald-300' }
  if (shown >= 60) return { row: 'bg-yellow-100/80', label: 'text-yellow-800', chip: 'bg-yellow-100 border-yellow-400' }
  return { row: 'bg-orange-200/70', label: 'text-orange-900', chip: 'bg-orange-200 border-orange-400' }
}

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
  // Discount comes from the published tier for this quantity. The override is
  // for modelling a deal we have not published — empty means "use the tier".
  const [discountOverride, setDiscountOverride] = useState('')
  // Bulk orders are single-variant — we do not sell mixed consignments — so
  // the roll-up is for one chosen row rather than a blended basket.
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

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

  const tiers = data?.assumptions.wholesaleTiers ?? []
  const activeTier = channel === 'wholesale'
    ? tiers.find(t => effectiveQty >= t.min && (t.max === null || effectiveQty <= t.max)) ?? null
    : null
  const overrideNum = discountOverride.trim() === '' ? null : Number(discountOverride)
  const discountPct = channel !== 'wholesale' ? 0
    : (overrideNum !== null && Number.isFinite(overrideNum) ? overrideNum : (activeTier ? activeTier.discount * 100 : 0))
  const excludedSizes = data?.assumptions.wholesaleExcludedSizes ?? []

  const computed = useMemo(() => {
    if (!data) return []
    const a = data.assumptions
    const qty = data.quantity
    const { photoAddOnPrice, photoAddOnCost } = a
    // DTC collects through Shopify Payments; bulk is invoiced via Stripe. We
    // absorb the fee on bulk rather than passing it on, so it is a real cost
    // either way and stays in the margin math.
    // Fall back to the Shopify rate if the API predates the Stripe fields.
    // A stale or cached response must not be able to white-screen the
    // dashboard, which is exactly what an undefined rate did here.
    const stripePct = a.stripeFeePercent ?? a.shopifyFeePercent
    const stripeFix = a.stripeFeeFixed ?? a.shopifyFeeFixed
    const feePercent = channel === 'retail' ? a.shopifyFeePercent : stripePct
    const feeFixed = channel === 'retail' ? a.shopifyFeeFixed : stripeFix

    return data.rows.filter(r => !r.error).map(r => {
      const base = r.retailPrice ?? 0
      const offSheet = channel === 'wholesale' && excludedSizes.includes(r.sizeLabel)
      const price = channel === 'retail'
        ? base
        : roundHalfUp(base * (1 - (Number.isFinite(discountPct) ? discountPct : 0) / 100))

      const unitShipping = r.orderShipping / qty
      // Package branding (insert + sticker) is a DTC touch. Bulk consignments
      // to charities and race partners go out plain, so it is not a cost there
      // at all — not merely amortized to something small.
      const unitBranding = channel === 'retail' ? r.brandingCost / qty : 0
      const unitCost = r.productionCost + unitShipping + unitBranding + (includePhoto ? photoAddOnCost : 0)
      const unitPrice = price + (includePhoto ? photoAddOnPrice : 0)
      // Percentage applies per unit; the flat fee is per order, so it divides.
      const unitFee = unitPrice * feePercent + feeFixed / qty
      const gp = unitPrice - unitCost - unitFee

      return {
        ...r,
        offSheet,
        // Undiscounted per-unit price, for showing the customer their saving.
        listPrice: base + (includePhoto ? photoAddOnPrice : 0),
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

  const selectable = useMemo(
    () => computed.filter(r => !r.offSheet),
    [computed]
  )

  // Default the selection to the most representative line rather than nothing,
  // and re-point it if the current pick stops being sellable in this channel.
  useEffect(() => {
    if (!selectable.length) return
    if (selectedKey && selectable.some(r => r.key === selectedKey)) return
    const preferred = selectable.find(r => r.frame === 'Framed') ?? selectable[0]
    setSelectedKey(preferred.key)
  }, [selectable, selectedKey])

  const selected = selectable.find(r => r.key === selectedKey) ?? null

  /**
   * Order totals for the SELECTED variant only. Bulk consignments are
   * single-variant — mixed orders are not something we sell — so a blended
   * average across every size would describe an order nobody places.
   */
  const totals = useMemo(() => {
    if (!selected || !data) return null
    const qty = data.quantity
    const revenue = selected.unitPrice * qty
    const profit = selected.gp * qty
    const listRevenue = selected.listPrice * qty
    const saving = listRevenue - revenue
    return {
      qty,
      revenue,
      profit,
      pct: revenue > 0 ? (profit / revenue) * 100 : 0,
      listRevenue,
      saving,
      savingPct: listRevenue > 0 ? (saving / listRevenue) * 100 : 0,
    }
  }, [selected, data])

  return (
    <div>
      {/* Channel tabs + refresh */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
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
        <div className="flex-1" />
        <button
          onClick={() => load(effectiveQty)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-off-black/60 hover:text-off-black hover:bg-off-black/5 rounded-md transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh live Artelo/Shopify data
        </button>
      </div>
      <p className="text-[11px] text-off-black/40 mb-3">
        {CHANNELS.find(c => c.id === channel)?.blurb}
        {channel === 'wholesale' && tiers.length > 0 && (
          <span className="ml-1">
            Published tiers: {tiers.map(t => `${t.label} ${(t.discount * 100).toFixed(0)}% off`).join(' · ')}.
          </span>
        )}
      </p>

      {/* Controls */}
      <div className={`mb-4 flex flex-wrap items-end gap-4 ${
        channel === 'retail' ? '' : 'bg-subtle-gray border border-border-gray rounded-lg p-3'
      }`}>
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
                Tier discount
              </label>
              <div className="flex items-center gap-2">
                <div className="px-2.5 py-1.5 rounded-md bg-white border border-border-gray text-sm tabular-nums min-w-[4.5rem] text-center">
                  {activeTier ? `${(activeTier.discount * 100).toFixed(0)}%` : '—'}
                </div>
                <span className="text-[11px] text-off-black/45">
                  {activeTier ? activeTier.label : `under ${tiers[0]?.min ?? 10} units — retail`}
                </span>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-off-black/50 uppercase tracking-wider mb-1">
                Override
              </label>
              <div className="relative w-24">
                <input
                  value={discountOverride}
                  onChange={e => setDiscountOverride(e.target.value.replace(/[^0-9.]/g, ''))}
                  inputMode="decimal"
                  placeholder="tier"
                  className="w-full pl-2.5 pr-6 py-1.5 border border-border-gray rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-off-black/40 text-xs">%</span>
              </div>
            </div>
          </>
        )}
        <label className="inline-flex items-center gap-1.5 text-[11px] text-off-black/55 pb-2 cursor-pointer">
          <input type="checkbox" checked={includePhoto} onChange={e => setIncludePhoto(e.target.checked)} className="w-3.5 h-3.5" />
          Photo add-on {data ? `+${money(data.assumptions.photoAddOnPrice)}` : ''}
        </label>
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
                  <th className="px-3 py-2 font-semibold text-right">Production</th>
                  <th className="px-3 py-2 font-semibold text-right">Shipping</th>
                  <th className="px-3 py-2 font-semibold text-right">Processing fees</th>
                  <th className="px-3 py-2 font-semibold text-right">Gross profit</th>
                  <th className="px-3 py-2 font-semibold text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {computed.map(r => {
                  const tint = r.offSheet ? { row: '', label: '', chip: '' } : marginTint(r.gpPct)
                  const isSelected = channel === 'wholesale' && r.key === selectedKey
                  const clickable = channel === 'wholesale' && !r.offSheet
                  return (
                  <tr
                    key={r.key}
                    onClick={clickable ? () => setSelectedKey(r.key) : undefined}
                    className={`border-t border-border-gray/60 ${tint.row} ${
                      clickable ? 'cursor-pointer hover:brightness-95' : ''
                    } ${isSelected ? 'outline outline-1 -outline-offset-1 outline-off-black/70' : ''}`}
                  >
                    <td className="px-3 py-2 font-medium text-off-black whitespace-nowrap">{r.sizeLabel}</td>
                    <td className="px-3 py-2 text-off-black/60 whitespace-nowrap">
                      {r.frame === 'Framed' ? r.frameLabel : 'Unframed'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.offSheet
                        ? <span className="text-off-black/30" title="24x36 is not sold wholesale">not offered</span>
                        : money(r.unitPrice)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-off-black/60">{money(r.productionCost)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-off-black/60">
                      {money(r.unitShipping + r.unitBranding)}
                      {r.unitBranding > 0 && (
                        <span className="block text-[10px] text-off-black/35 leading-tight">
                          incl. {money(r.unitBranding)} branding
                        </span>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.offSheet ? 'text-off-black/25' : 'text-off-black/60'}`}>
                      {r.offSheet ? '—' : money(r.unitFee)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${r.offSheet ? 'text-off-black/25' : r.gp < 0 ? 'text-red-600' : 'text-green-700'}`}>
                      {r.offSheet ? '—' : money(r.gp)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${r.offSheet ? 'text-off-black/25' : r.gp < 0 ? 'text-red-600' : tint.label}`}>
                      {r.offSheet || r.gpPct === null ? '—' : `${r.gpPct.toFixed(0)}%`}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Order roll-up for the SELECTED variant, bulk only */}
          {channel === 'wholesale' && totals && selected && (
            <div className="mt-3 border border-border-gray rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-subtle-gray border-b border-border-gray flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-semibold text-off-black/60 uppercase tracking-wider">
                  Order total · {totals.qty} × {selected.sizeLabel} {selected.frame === 'Framed' ? selected.frameLabel : 'Unframed'}
                </p>
                <p className="text-[11px] text-off-black/40">Click a row to change</p>
              </div>
              <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Revenue" value={money(totals.revenue)} />
                <Stat label="Gross profit" value={money(totals.profit)} tone={totals.profit < 0 ? 'bad' : 'good'} />
                <Stat label="Margin" value={`${totals.pct.toFixed(0)}%`} tone={totals.profit < 0 ? 'bad' : undefined} />
                <div>
                  <p className="text-[11px] font-semibold text-off-black/40 uppercase tracking-wider">Customer saves</p>
                  <p className="text-lg font-bold tabular-nums text-off-black">{money(totals.saving)}</p>
                  <p className="text-[11px] text-off-black/45">
                    {totals.savingPct.toFixed(0)}% off {money(totals.listRevenue)} retail
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-off-black/45">
            <span className="font-semibold uppercase tracking-wider text-off-black/35">Margin</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" /> 75%+</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-400" /> 60-75%</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-200 border border-orange-400" /> under 60%</span>
          </div>

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
                : `Bulk ships as one consignment of ${data.quantity}, so shipping and the flat 30c processing fee divide across the run, and package branding is not applied at all. Production cost does not fall with volume — Artelo gives no quantity discount.`}
            </p>
            <p>
              {channel === 'retail'
                ? `Processing is Shopify Payments at ${(data.assumptions.shopifyFeePercent * 100).toFixed(1)}% + ${money(data.assumptions.shopifyFeeFixed)} per order.`
                : `Processing is Stripe at ${(((data.assumptions.stripeFeePercent ?? data.assumptions.shopifyFeePercent)) * 100).toFixed(1)}% + ${money(data.assumptions.stripeFeeFixed ?? data.assumptions.shopifyFeeFixed)} per consignment — we absorb it rather than passing it to the partner, so it comes out of margin.`}
              {' '}Gross profit excludes design time, returns and sales tax.
            </p>
            <p>Fetched {new Date(data.fetchedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
          </div>
        </>
      )}
    </div>
  )
}
