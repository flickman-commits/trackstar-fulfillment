/**
 * pricing.js - Landed cost, price and margin for every size/frame we sell,
 * across sales channels.
 *
 * Two live sources, no hardcoded money:
 *   - Artelo's pricing API for production + shipping (see arteloCosts.js)
 *   - Shopify for the current retail price of each size/frame
 *
 * Costs reconcile to ARTELO, which is who actually fulfills our orders. If a
 * second print partner is ever adopted, its costs belong behind the same
 * fetchArteloCost seam rather than being pasted in as constants — the point of
 * this file is that no money is typed by hand except a negotiated discount.
 *
 * WHAT SCALES WITH QUANTITY AND WHAT DOES NOT is the whole point of the bulk
 * view, and Artelo does not make it obvious:
 *
 *   production  PER UNIT   — flat, no volume break (36.34 at qty 1 and at 50)
 *   shipping    PER ORDER  — 9.75 for one 12x18, 61.20 for fifty, so per-unit
 *                            shipping falls from $9.75 to $1.22
 *   branding    PER ORDER  — $0.80 once, however many prints are in the box
 *
 * So bulk economics come almost entirely from shipping and branding being
 * amortized, not from a production discount. Quoting a bulk order off the
 * qty-1 numbers overstates cost badly at volume.
 */

import { fetchArteloCost, SIZES, COLUMNS, BRANDING_COST_PER_ORDER } from './arteloCosts.js'
import { fetchVariantCatalog } from './shopifyProducts.js'

export { SIZES, COLUMNS }

/**
 * Shopify Payments US online rate: 2.9% + $0.30 per TRANSACTION. This is a
 * Shopify rate, nothing to do with who prints the poster — it applies to a
 * $100 order as $3.20 and a $250 order as $7.55. The fixed 30c is per order,
 * so like shipping it amortizes across a bulk order.
 */
export const SHOPIFY_FEE_PERCENT = 0.029
export const SHOPIFY_FEE_FIXED = 0.30

/**
 * The photo add-on is sold as a separate $20 line item on DTC orders. It costs
 * us nothing extra at Artelo — the photo is composited into the same print, so
 * there is no additional production or shipping — which makes it effectively
 * pure margin minus the payment fee. `photoCost` is still a parameter rather
 * than a constant so that stops being an assumption the day it changes.
 */
export const PHOTO_ADDON_PRICE = 20
export const PHOTO_ADDON_COST = 0

/** Current retail price per size + frame, straight from Shopify. */
export async function fetchRetailPrices() {
  const rows = await fetchVariantCatalog()
  const groups = {}
  for (const v of rows) {
    if (!v.size || !v.frame || v.isCustom || v.productStatus !== 'ACTIVE') continue
    const key = `${v.size}|${/unframed/i.test(v.frame) ? 'Unframed' : 'Framed'}`
    ;(groups[key] ||= []).push(Number(v.price))
  }

  const out = {}
  for (const [key, prices] of Object.entries(groups)) {
    // The catalog is meant to be uniform per size/frame. Where it is not, the
    // most common price is the real one and the outliers are stragglers from a
    // half-finished repricing — surfaced rather than averaged away, because an
    // average would quietly invent a price nobody actually charges.
    const counts = {}
    for (const p of prices) counts[p] = (counts[p] || 0) + 1
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    out[key] = {
      price: Number(sorted[0][0]),
      variantCount: prices.length,
      outliers: sorted.slice(1).map(([p, n]) => ({ price: Number(p), count: n })),
    }
  }
  return out
}

/**
 * Per-unit economics for one size/frame at a given order quantity.
 *
 * `price` is the per-unit selling price for whichever channel the caller is
 * modeling; this function does no channel math of its own, it just tells you
 * what a unit costs and what is left over.
 */
export function unitEconomics({ price, productionCost, orderShipping, quantity, includePhoto, photoPrice, photoCost, feePercent, feeFixed }) {
  const qty = Math.max(1, quantity || 1)

  const unitShipping = orderShipping / qty
  const unitBranding = BRANDING_COST_PER_ORDER / qty
  const unitCost = productionCost + unitShipping + unitBranding + (includePhoto ? photoCost : 0)

  const unitPrice = price + (includePhoto ? photoPrice : 0)
  // Percentage is per-unit; the flat 30c is per order, so it amortizes.
  const unitFee = unitPrice * feePercent + feeFixed / qty

  const grossProfit = unitPrice - unitCost - unitFee
  return {
    unitPrice: round(unitPrice),
    productionCost: round(productionCost),
    unitShipping: round(unitShipping),
    unitBranding: round(unitBranding),
    photoCost: includePhoto ? round(photoCost) : 0,
    unitCost: round(unitCost),
    unitFee: round(unitFee),
    grossProfit: round(grossProfit),
    // Margin on revenue. Null rather than Infinity when a channel gives the
    // product away, so the UI can show a dash instead of a nonsense percentage.
    grossMarginPct: unitPrice > 0 ? round((grossProfit / unitPrice) * 100, 1) : null,
    orderShipping: round(orderShipping),
    quantity: qty,
  }
}

function round(n, dp = 2) {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

/**
 * The full grid: every size x (unframed, framed), costed at `quantity` and
 * priced at retail. Channel pricing is applied by the caller on top of the
 * `retailPrice` returned here.
 */
export async function buildPricingGrid({ quantity = 1, shippingDestination = 'US' } = {}) {
  const retail = await fetchRetailPrices()
  const rows = []

  for (const size of SIZES) {
    for (const column of COLUMNS) {
      const frameStyle = column.id === 'Framed' ? size.framedStyle : 'Unframed'
      const key = `${size.id}|${column.id}`
      try {
        const cost = await fetchArteloCost({
          size: size.id,
          frameStyle,
          shippingDestination,
          quantity,
        })
        const r = retail[`${size.label}|${column.id}`] || null
        rows.push({
          key,
          sizeId: size.id,
          sizeLabel: size.label,
          frame: column.id,
          frameLabel: column.id === 'Framed' ? size.framedLabel : 'Unframed',
          productionCost: cost.productionCost,
          orderShipping: cost.shippingCost,
          brandingCost: BRANDING_COST_PER_ORDER,
          retailPrice: r?.price ?? null,
          retailVariantCount: r?.variantCount ?? 0,
          retailOutliers: r?.outliers ?? [],
        })
      } catch (error) {
        rows.push({ key, sizeId: size.id, sizeLabel: size.label, frame: column.id, error: error.message })
      }
    }
  }

  return rows
}
