/**
 * Product Catalog — stable identifier → design variant + display info.
 *
 * Why: a single race (e.g. Boston Marathon) can have multiple Shopify products
 * with different artwork (regular print vs World Major Race Poster, etc.).
 * The scraper retrieves the same runner data either way, but Eli needs to
 * know which DESIGN TEMPLATE to use. We key off the Shopify `product_id`
 * (or Etsy `listing_id`) — these are stable and don't change if the
 * product title is renamed.
 *
 * To add a new product: paste its id + a one-line entry below. No code
 * changes anywhere else needed. The Dashboard reads `productInfo` off the
 * order and renders the hero image + label.
 *
 * Adding a new product without an entry → falls back to the order's raw
 * title (still works, just not visually labeled).
 */

const SHOPIFY_PRODUCTS = {
  // ── Boston ────────────────────────────────────────────────────────────
  '10155461378331': {
    designVariant: 'boston-standard',
    label: 'Boston Race Print',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/d297414e-aec8-415b-87a7-c75978981c8f.preview.lg.jpg',
  },
  '10223122940187': {
    designVariant: 'boston-world-major',
    label: 'Boston World Major Poster',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/0b7d7b5a-a42c-4eb6-93e4-70037d0ebe26.preview.lg.jpg',
  },

  // ── World Majors (other cities) ───────────────────────────────────────
  '10223121596699': {
    designVariant: 'berlin-world-major',
    label: 'Berlin World Major Poster',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/e4ea285b-a5fe-432a-b0e4-30dd727e1cfe.preview.lg.jpg',
  },
  '10223124185371': {
    designVariant: 'chicago-world-major',
    label: 'Chicago World Major Poster',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/8b8b54f0-fa43-4e5c-981b-6b153c6b801c.preview.lg.jpg',
  },
  '10223124873499': {
    designVariant: 'london-world-major',
    label: 'London World Major Poster',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/2e148ab0-3777-4c23-91d1-be1f9a8fe746.preview.lg.jpg',
  },
  '10223125496091': {
    designVariant: 'nyc-world-major',
    label: 'NYC World Major Poster',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/6a951cf0-6666-4099-bd87-93f3ebb79b71.preview.lg.jpg',
  },
  '10225669374235': {
    designVariant: 'sydney-world-major',
    label: 'Sydney World Major Poster',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/4bc341b4-98f0-4498-b48b-680cfeb95b47.preview.lg.jpg',
  },
  '10225669701915': {
    designVariant: 'tokyo-world-major',
    label: 'Tokyo World Major Poster',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/a09ca5bc-a6a6-4de0-92d4-1eb83e06c0ed.preview.lg.jpg',
  },
}

// Etsy listing IDs (add as needed — currently no race-specific Etsy variants).
const ETSY_LISTINGS = {}

/**
 * Resolve product info for an order. Returns `{ designVariant, label,
 * heroImageUrl, productId }` if a known catalog entry exists, otherwise a
 * fallback object built from the order's raw line-item title.
 */
export function getProductInfo(order) {
  if (!order || typeof order !== 'object') return null

  // Shopify
  if (order.source === 'shopify') {
    const li = order.shopifyOrderData?.line_items?.[order.lineItemIndex || 0]
    if (!li) return null
    const productId = String(li.product_id || '')
    const fromCatalog = SHOPIFY_PRODUCTS[productId]
    return {
      productId,
      variantId: li.variant_id ? String(li.variant_id) : null,
      rawTitle: li.title || null,
      designVariant: fromCatalog?.designVariant || null,
      label: fromCatalog?.label || li.title || null,
      heroImageUrl: fromCatalog?.heroImageUrl || null,
      inCatalog: !!fromCatalog,
    }
  }

  // Etsy
  if (order.source === 'etsy') {
    const tx = order.etsyOrderData?.transactions?.[order.lineItemIndex || 0]
    if (!tx) return null
    const listingId = String(tx.listing_id || '')
    const fromCatalog = ETSY_LISTINGS[listingId]
    return {
      productId: listingId,
      variantId: null,
      rawTitle: tx.title || null,
      designVariant: fromCatalog?.designVariant || null,
      label: fromCatalog?.label || tx.title || null,
      heroImageUrl: fromCatalog?.heroImageUrl || null,
      inCatalog: !!fromCatalog,
    }
  }

  return null
}

export default { getProductInfo }
