/**
 * Product resolution for orders: line item → what Eli should see.
 *
 * WHAT CHANGED, AND WHY
 *   This file used to BE the catalog: ~250 lines of hand-written
 *   handle → { label, heroImageUrl }, plus a numeric-id → handle map for
 *   legacy products. Every new product needed a human to come edit it, and it
 *   had already drifted — four live products missing (both triathlon prints,
 *   Missoula, Relay for America) and stale entries for products since renamed.
 *   The Dashboard's own tooltip asked the user to go add missing ones by hand.
 *
 *   Shopify is now the single source of truth for what exists. It syncs into
 *   the ShopifyProduct table (server/services/shopifyProducts.js →
 *   syncProductCatalog), and this file shrank to what a local file is actually
 *   good for: the editorial overlay, for the handful of cases where the label
 *   or image Eli needs differs from what the storefront shows.
 *
 *   The legacy numeric-id map is gone entirely: line items carry the numeric
 *   product id, and the synced table is keyed on exactly that, so all eight
 *   legacy ids resolve directly.
 *
 * CALLING CONVENTION
 *   getProductInfo(order, catalog) now takes the catalog, because it comes
 *   from the database rather than a module constant. Callers load it once per
 *   request via loadProductCatalog() rather than per order.
 */

import { resolveShopifyLineIndex, resolveEtsyTxIndex } from './lineItemMatching.js'

/**
 * Editorial overrides, keyed by Shopify handle.
 *
 * Only for cases where the storefront's own title or image is NOT what the
 * fulfillment queue should show. Anything absent here just uses Shopify's
 * values, which is the right default and the reason this map should stay
 * close to empty. Adding a product to Shopify must never require a code
 * change again.
 */
const PRODUCT_OVERRIDES = {}

/** Etsy has no catalog sync; listing titles come straight off the order. */
const ETSY_LISTINGS = {}

/**
 * Load the synced Shopify catalog into lookup maps.
 *
 * Call once per request and pass the result into getProductInfo — resolving
 * per order would mean one query per row.
 */
export async function loadProductCatalog() {
  const { default: prisma } = await import('../../api/_lib/prisma.js')
  const rows = await prisma.shopifyProduct.findMany({
    select: { productId: true, handle: true, title: true, featuredImage: true, raceCanonical: true },
  })

  const byId = new Map()
  const byHandle = new Map()
  for (const r of rows) {
    const entry = {
      handle: r.handle,
      label: PRODUCT_OVERRIDES[r.handle]?.label || r.title,
      heroImageUrl: PRODUCT_OVERRIDES[r.handle]?.heroImageUrl || r.featuredImage || null,
      raceCanonical: r.raceCanonical,
    }
    byId.set(String(r.productId), entry)
    byHandle.set(r.handle, entry)
  }
  return { byId, byHandle, size: rows.length }
}

/** Handle stashed on a line item by some themes. */
function extractHandle(li) {
  if (li.properties) {
    for (const prop of li.properties) {
      if (prop.name === '_product_handle' || prop.name === 'product_handle') {
        return prop.value
      }
    }
  }
  return null
}

/**
 * Last-resort title match, for line items whose product has since been deleted
 * from Shopify (so the id resolves to nothing) but whose title still names a
 * product we know. Kept deliberately strict: an exact-ish title comparison
 * rather than the old substring-keyword scan, which could match "Boston" in a
 * title belonging to a different product.
 */
function findByTitle(catalog, title) {
  if (!title) return null
  const norm = s => String(s || '').trim().toLowerCase()
  const target = norm(title)
  for (const entry of catalog.byHandle.values()) {
    if (norm(entry.label) === target) return entry
  }
  return null
}

/**
 * Resolve product info for an order.
 *
 * @param {Object} order
 * @param {{byId: Map, byHandle: Map}} catalog - from loadProductCatalog()
 */
export function getProductInfo(order, catalog) {
  if (!order || typeof order !== 'object') return null
  const empty = { byId: new Map(), byHandle: new Map() }
  const cat = catalog || empty

  if (order.source === 'shopify') {
    // NOT line_items[lineItemIndex] — that index belongs to Artelo's item list,
    // and indexing Shopify with it made photo orders show "Photo Add-On" as the
    // product whenever the add-on happened to sit at that position.
    const li = order.shopifyOrderData?.line_items?.[resolveShopifyLineIndex(order)]
    if (!li) return null

    const productId = String(li.product_id || '')

    // 1) numeric product id — what line items actually carry
    let fromCatalog = cat.byId.get(productId) || null
    // 2) handle, when a theme stashed one on the line item
    if (!fromCatalog) {
      const h = extractHandle(li)
      if (h) fromCatalog = cat.byHandle.get(h) || null
    }
    // 3) title, for products deleted from Shopify since the order
    if (!fromCatalog) fromCatalog = findByTitle(cat, li.title)

    return {
      source: 'shopify',
      productId,
      productIdLabel: 'Shopify product ID',
      variantId: li.variant_id ? String(li.variant_id) : null,
      rawTitle: li.title || null,
      handle: fromCatalog?.handle || null,
      label: fromCatalog?.label || li.title || null,
      heroImageUrl: fromCatalog?.heroImageUrl || null,
      inCatalog: !!fromCatalog,
      catalogRequired: true,
    }
  }

  if (order.source === 'etsy') {
    const tx = order.etsyOrderData?.transactions?.[resolveEtsyTxIndex(order)]
    if (!tx) return null
    const listingId = String(tx.listing_id || '')
    const fromCatalog = ETSY_LISTINGS[listingId]
    return {
      source: 'etsy',
      productId: listingId,
      productIdLabel: 'Etsy listing ID',
      variantId: null,
      rawTitle: tx.title || null,
      handle: null,
      label: fromCatalog?.label || tx.title || null,
      heroImageUrl: fromCatalog?.heroImageUrl || null,
      inCatalog: !!fromCatalog,
      catalogRequired: false,
    }
  }

  return null
}

export default { getProductInfo, loadProductCatalog }
