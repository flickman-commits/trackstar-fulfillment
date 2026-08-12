/**
 * arteloCosts.js - Landed cost lookup against Artelo's catalog pricing API.
 *
 * POST /api/open/catalog/get-costs returns { productionCost, shippingCost } for
 * one product configuration. There is no bulk endpoint, so a full matrix is one
 * call per cell (4 sizes x 5 frame styles = 20).
 *
 * Every default here was derived from real order items in arteloOrderData
 * rather than from the API docs, because the docs example is not what we sell:
 *
 *   catalogProductId  IndividualArtPrint      (every order we have ever placed)
 *   paperType         ArchivalMatteFineArt    (docs example uses MattePoster)
 *   includeMats       false                   (never used)
 *
 * The framing flags are the subtle one. Framed orders go out with framing
 * service AND hanging pins; unframed orders have both off. Pricing a framed
 * item with the flags off understates the real cost, so they are derived from
 * the frame style instead of being fixed.
 */

import { fetchWithTimeout } from '../lib/fetchWithTimeout.js'

const ARTELO_COSTS_URL = 'https://www.artelo.io/api/open/catalog/get-costs'
const CATALOG_PRODUCT_ID = 'IndividualArtPrint'
const PAPER_TYPE = 'ArchivalMatteFineArt'

// Artelo prefixes sizes with "x". `label` is what the storefront calls them.
/**
 * The framed style is per SIZE, because it has not always been the same
 * across the range.
 *
 * Every size now ships as PremiumOak. 8x10 used to go to Artelo as standard
 * Oak, which is why this is a per-size field rather than one constant — the
 * storefront calls both just "Black Oak" / "Natural Oak", so a change like
 * that is invisible from Shopify and only shows up on the invoice.
 *
 * Confirmed against Artelo's own pricing on 2026-08-12: 8x10 PremiumOak is
 * $25.37 + $7.85 and 24x36 PremiumOak is $75.72 + $21.92, both matching the
 * quotes Artelo returned for the upgraded variants. Pricing 8x10 as plain Oak
 * now UNDERSTATES it by about $5.50 a unit.
 *
 * If a size is ever downgraded again, change it here and re-check against the
 * API rather than assuming.
 */
export const SIZES = [
  { id: 'x8x10', label: '8x10', framedStyle: 'PremiumOak', framedLabel: 'Premium Oak' },
  { id: 'x12x18', label: '12x18', framedStyle: 'PremiumOak', framedLabel: 'Premium Oak' },
  { id: 'x16x24', label: '16x24', framedStyle: 'PremiumOak', framedLabel: 'Premium Oak' },
  { id: 'x24x36', label: '24x36', framedStyle: 'PremiumOak', framedLabel: 'Premium Oak' },
]

/**
 * Two columns, because that is the choice a customer actually makes. Which
 * frame style "Framed" resolves to is a property of the size (see SIZES).
 *
 * Cost depends on frameStyle, not frameColor — get-costs takes no color — so
 * black and natural are the same price. Metal exists in Artelo's catalog and
 * appears in older orders, but we no longer sell it, so it is not priced here.
 */
export const COLUMNS = [
  { id: 'Unframed', label: 'Unframed' },
  { id: 'Framed', label: 'Framed' },
]

/**
 * Package branding (insert + sticker) is billed on top of production and
 * shipping. Artelo's /branding/get returns our two branding items but exposes
 * no price, so this is a constant read off a real invoice: a 16x24 Black
 * Premium Oak order billed $49.33 production + $11.28 shipping + $0.80
 * branding = $61.41.
 *
 * Both branding items are placement "PerOrder", so this is charged once per
 * ORDER, not per unit. The matrix quotes a single-item order, where the two
 * are the same thing; a two-print order still pays $0.80 total, not $1.60.
 */
export const BRANDING_COST_PER_ORDER = Number(process.env.ARTELO_BRANDING_COST || 0.80)

export async function fetchArteloCost({ size, frameStyle, shippingDestination = 'US', quantity = 1 }) {
  const apiKey = process.env.ARTELO_API_KEY
  if (!apiKey) throw new Error('Missing ARTELO_API_KEY')

  const framed = frameStyle !== 'Unframed'

  const res = await fetchWithTimeout(ARTELO_COSTS_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      catalogProductId: CATALOG_PRODUCT_ID,
      size,
      frameStyle,
      includeMats: false,
      includeFramingService: framed,
      includeHangingPins: framed,
      paperType: PAPER_TYPE,
      shippingDestination,
      quantity,
    }),
  }, 15000)

  if (!res.ok) {
    throw new Error(`Artelo get-costs ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const data = await res.json()
  // Artelo returns unrounded floats (shipping comes back as 11.277000000000001).
  const round = n => Math.round(n * 100) / 100
  const productionCost = round(data.productionCost)
  const shippingCost = round(data.shippingCost)
  const brandingCost = BRANDING_COST_PER_ORDER
  return {
    productionCost,
    shippingCost,
    brandingCost,
    totalCost: round(productionCost + shippingCost + brandingCost),
  }
}

/**
 * The full size x frameStyle grid. Cells are fetched sequentially: 8 calls is
 * fast enough, and a burst of parallel requests against a pricing endpoint is
 * the kind of thing that earns a rate limit.
 *
 * A failed cell resolves to { error } rather than rejecting the whole matrix —
 * one unavailable combination should not blank the table.
 */
export async function fetchArteloCostMatrix({ shippingDestination = 'US', quantity = 1 } = {}) {
  const cells = {}
  for (const size of SIZES) {
    for (const column of COLUMNS) {
      // "Framed" means whichever style this size actually ships with.
      const frameStyle = column.id === 'Framed' ? size.framedStyle : 'Unframed'
      const key = `${size.id}|${column.id}`
      try {
        const cost = await fetchArteloCost({
          size: size.id,
          frameStyle,
          shippingDestination,
          quantity,
        })
        cells[key] = { ...cost, frameStyle, frameLabel: column.id === 'Framed' ? size.framedLabel : 'Unframed' }
      } catch (error) {
        cells[key] = { error: error.message }
      }
    }
  }
  return cells
}
