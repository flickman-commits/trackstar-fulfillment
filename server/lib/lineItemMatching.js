/**
 * lineItemMatching.js - Pairing Artelo line items with their upstream
 * Shopify / Etsy counterparts, and telling prints apart from add-ons.
 *
 * Two separate problems live here, and they interact:
 *
 * 1. ORDERING. Artelo's `orderItems[]` is NOT guaranteed to be in the same
 *    order as Shopify's `line_items[]`. We saw a real mix-up on order #3348
 *    where Artelo flipped the items — the customer ordered 12x18 (Victor) +
 *    8x10 (Hannah), and positional `[lineItemIndex]` lookup glued Victor's
 *    name onto the 8x10 print and Hannah's onto the 12x18.
 *
 * 2. ADD-ONS. The $15 photo upcharge is its own Shopify product, so a photo
 *    order arrives as TWO line items: the poster and the add-on. Only the
 *    poster is a print. Leaving the add-on in the candidate pool caused both
 *    of the bugs this module exists to prevent: a print row pairing with the
 *    add-on (so the dashboard showed "Photo Add-On" as the product), and an
 *    extra Artelo item importing as a second, bogus order row.
 *
 * The fix for (2) is to drop add-ons before matching. A print can then never
 * pair with one, and an Artelo item that ends up unmatched (map value -1) is
 * itself the add-on and should not become an order row.
 */

// Matched on product id first (exact, survives renaming), then the `_addon_for`
// cart property the storefront writes, then the title.
const PHOTO_ADDON_PRODUCT_ID = Number(process.env.PHOTO_ADDON_PRODUCT_ID || 10329625723163)
const PHOTO_ADDON_TITLE_RE = /^photo add-?on$/i

export function isPhotoAddonLineItem(lineItem) {
  if (!lineItem) return false
  if (Number(lineItem.product_id) === PHOTO_ADDON_PRODUCT_ID) return true
  if ((lineItem.properties || []).some(p => p?.name === '_addon_for')) return true
  return PHOTO_ADDON_TITLE_RE.test(String(lineItem.title || '').trim())
}

/** The line items that are actual prints, i.e. everything but the add-ons. */
export function printableLineItems(lineItems) {
  return (lineItems || []).filter(li => !isPhotoAddonLineItem(li))
}

function normalizePrintSize(raw) {
  if (!raw) return ''
  // Artelo prefixes with "x" (e.g. "x8x10"); strip it. Lowercase + trim.
  return String(raw).replace(/^x/i, '').toLowerCase().trim()
}

function skuContainsSize(sku, size) {
  if (!sku || !size) return false
  // SKUs look like "eugene-s1p-12x18-bl-pok-am" — size is a hyphen-bounded token
  return new RegExp(`(^|[-_])${size}([-_]|$)`, 'i').test(sku)
}

/**
 * Score-based stable matching. We compute a score for every (artelo[i],
 * upstream[j]) pair, then greedily assign highest-scoring pairs first.
 * Positional alignment is a tiebreaker (small penalty for index distance) —
 * this means when sizes don't disambiguate (e.g. two 8x10s), positional
 * stays put. Swaps only happen when size info clearly points to a different
 * pairing.
 */
function buildMatchMapByScore(arteloItems, upstreamItems, scoreSizeMatchFns) {
  const n = arteloItems?.length || 0
  const result = new Array(n).fill(-1)
  if (!upstreamItems?.length || !n) return result

  const candidates = []
  for (let i = 0; i < n; i++) {
    const aSize = normalizePrintSize(arteloItems[i]?.product?.size)
    for (let j = 0; j < upstreamItems.length; j++) {
      let score = 0
      if (aSize) {
        for (const fn of scoreSizeMatchFns) {
          score += fn(upstreamItems[j], aSize)
        }
      }
      // Positional tiebreaker — small penalty for index distance. Keeps
      // positional matching when no size info disambiguates.
      score -= Math.abs(i - j)
      candidates.push({ i, j, score })
    }
  }
  // Highest score first; deterministic tiebreak by i then j
  candidates.sort((a, b) => b.score - a.score || a.i - b.i || a.j - b.j)
  const usedI = new Set()
  const usedJ = new Set()
  for (const c of candidates) {
    if (usedI.has(c.i) || usedJ.has(c.j)) continue
    result[c.i] = c.j
    usedI.add(c.i)
    usedJ.add(c.j)
  }
  return result
}

/**
 * Build mapping from Artelo line-item index → Shopify line-item index.
 * Returns an array `map` where `map[arteloIdx] = shopifyIdx | -1`.
 *
 * Photo add-ons are removed from the candidate pool first, then the winning
 * indices are translated back to positions in the original `line_items` array
 * so callers can keep indexing the untouched Shopify payload. A -1 therefore
 * means "this Artelo item has no print to pair with" — which is exactly the
 * add-on's own Artelo row.
 */
export function buildShopifyMatchMap(arteloItems, shopifyLineItems) {
  const prints = []
  ;(shopifyLineItems || []).forEach((li, j) => {
    if (!isPhotoAddonLineItem(li)) prints.push({ li, originalIndex: j })
  })
  const map = buildMatchMapByScore(arteloItems, prints.map(p => p.li), [
    // SKU containing the size token is the strongest signal (SKU encodes
    // the actual variant, while variant_title is display text that can be
    // misleading — e.g. "Black Oak" used as a label for "Black Premium Oak").
    (li, size) => skuContainsSize(li?.sku, size) ? 100 : 0,
    // variant_title is a weaker signal but still useful
    (li, size) => (li?.variant_title || '').toLowerCase().includes(size) ? 50 : 0,
  ])
  return map.map(k => (k >= 0 ? prints[k].originalIndex : -1))
}

/**
 * Same idea for Etsy transactions. SKU first, then variations text.
 * Etsy sells the photo upcharge as a listing variation rather than a separate
 * transaction, so there is nothing to filter out here.
 */
export function buildEtsyMatchMap(arteloItems, etsyTransactions) {
  return buildMatchMapByScore(arteloItems, etsyTransactions, [
    (t, size) => skuContainsSize(t?.sku, size) ? 100 : 0,
    (t, size) => {
      const haystacks = [
        t?.title || '',
        ...(t?.variations || []).map(v => `${v?.formatted_name || ''} ${v?.formatted_value || ''}`)
      ].join(' ').toLowerCase()
      return haystacks.includes(size) ? 50 : 0
    },
  ])
}

/**
 * Which Shopify line item does this saved order row describe?
 *
 * `order.lineItemIndex` is an index into ARTELO's items, not Shopify's, so it
 * cannot be used against `line_items` directly. Re-run the same matcher the
 * importer used. Returns -1 when there is no print to point at.
 */
export function resolveShopifyLineIndex(order) {
  const lineItems = order?.shopifyOrderData?.line_items
  if (!lineItems?.length) return -1
  const idx = order?.lineItemIndex || 0

  const arteloItems = order?.arteloOrderData?.orderItems
  if (arteloItems?.length) {
    const resolved = buildShopifyMatchMap(arteloItems, lineItems)[idx]
    if (resolved >= 0) return resolved
  }

  // No Artelo snapshot (or this row lost its match). Fall back to positional
  // over the prints only, so we still never land on an add-on.
  const prints = []
  lineItems.forEach((li, j) => { if (!isPhotoAddonLineItem(li)) prints.push(j) })
  if (!prints.length) return -1
  return prints[Math.min(idx, prints.length - 1)]
}

/**
 * Etsy counterpart of resolveShopifyLineIndex.
 */
export function resolveEtsyTxIndex(order) {
  const txs = order?.etsyOrderData?.transactions
  if (!txs?.length) return -1
  const idx = order?.lineItemIndex || 0

  const arteloItems = order?.arteloOrderData?.orderItems
  if (arteloItems?.length) {
    const resolved = buildEtsyMatchMap(arteloItems, txs)[idx]
    if (resolved >= 0) return resolved
  }
  return Math.min(idx, txs.length - 1)
}
