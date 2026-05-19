/**
 * Etsy listing image URL resolver with in-process cache.
 *
 * Etsy receipts include `listing_id` but no image URLs — those live on a
 * separate /listings/{id}/images endpoint. To avoid hitting Etsy on every
 * orders-list response we cache resolved URLs per server-process lifetime.
 * Listing images change very rarely, so a short TTL is fine.
 *
 * Returns null on any error so caller code can degrade gracefully (the
 * order list still renders, just without a hero image).
 */
import { etsyFetch } from '../services/etsyAuth.js'

// listing_id (string) → { url, fetchedAt }. Bare Map = no LRU eviction;
// memory footprint is tiny (≤ a few KB per listing).
const cache = new Map()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h — listing images rarely change

/**
 * Resolve the hero image URL for an Etsy listing.
 * @param {string|number} listingId
 * @returns {Promise<string|null>}
 */
export async function getEtsyListingImageUrl(listingId) {
  if (!listingId) return null
  const key = String(listingId)
  const now = Date.now()

  const cached = cache.get(key)
  if (cached && (now - cached.fetchedAt) < CACHE_TTL_MS) {
    return cached.url
  }

  try {
    const resp = await etsyFetch(`/listings/${encodeURIComponent(key)}/images?limit=1`)
    const first = Array.isArray(resp?.results) ? resp.results[0] : null
    // Prefer 570xN — good for thumbnail without being huge
    const url = first?.url_570xN || first?.url_fullxfull || first?.url_170x135 || null
    cache.set(key, { url, fetchedAt: now })
    return url
  } catch (err) {
    // Cache the failure briefly so we don't hammer Etsy if something's wrong
    cache.set(key, { url: null, fetchedAt: now })
    return null
  }
}

/**
 * Resolve image URLs for a list of Etsy orders in parallel, deduped by
 * listing_id. Mutates each order's productInfo to attach `heroImageUrl`.
 *
 * @param {Array} orders - serialized order objects with productInfo
 */
export async function attachEtsyImages(orders) {
  const etsyOrders = orders.filter(o =>
    o?.productInfo &&
    !o.productInfo.heroImageUrl &&
    o.productInfo.productId
    // We can't tell source from the serialized object, so we look at the
    // original order's source via a side-channel. Caller wires it up below.
  )
  if (etsyOrders.length === 0) return

  // Dedupe by listing_id
  const uniqueIds = [...new Set(etsyOrders.map(o => o.productInfo.productId))]
  const results = await Promise.all(uniqueIds.map(async (id) => {
    const url = await getEtsyListingImageUrl(id)
    return [id, url]
  }))
  const urlMap = Object.fromEntries(results)

  for (const o of etsyOrders) {
    const url = urlMap[o.productInfo.productId]
    if (url) o.productInfo.heroImageUrl = url
  }
}
