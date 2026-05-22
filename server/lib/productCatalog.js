/**
 * Product Catalog — stable identifier → design variant + display info.
 *
 * Supports lookup by:
 * 1. Shopify product_id (numeric ID from line_items)
 * 2. Shopify handle (slug from product URL)
 * 3. Title matching (fallback)
 *
 * The Dashboard reads `productInfo` off the order and renders the hero image + label.
 */

// Lookup by Shopify product_id (legacy entries that have known IDs)
const SHOPIFY_PRODUCTS_BY_ID = {
  '10155461378331': { handle: 'boston' },
  '10223122940187': { handle: 'wm-bos' },
  '10223121596699': { handle: 'wm-ber' },
  '10223124185371': { handle: 'wm-chi' },
  '10223124873499': { handle: 'wm-lon' },
  '10223125496091': { handle: 'wm-nyc' },
  '10225669374235': { handle: 'wm-syd' },
  '10225669701915': { handle: 'wm-tky' },
}

// Primary catalog keyed by handle (from Shopify CSV export)
const SHOPIFY_CATALOG = {
  // ── World Majors Collection ───────────────────────────────────────────
  'wm-ber': {
    label: 'Berlin World Major Poster',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/e4ea285b-a5fe-432a-b0e4-30dd727e1cfe.preview.lg.jpg',
  },
  'wm-bos': {
    label: 'Boston World Major Poster',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/0b7d7b5a-a42c-4eb6-93e4-70037d0ebe26.preview.lg.jpg',
  },
  'wm-chi': {
    label: 'Chicago World Major Poster',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/8b8b54f0-fa43-4e5c-981b-6b153c6b801c.preview.lg.jpg',
  },
  'wm-lon': {
    label: 'London World Major Poster',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/2e148ab0-3777-4c23-91d1-be1f9a8fe746.preview.lg.jpg',
  },
  'wm-nyc': {
    label: 'NYC World Major Poster',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/6a951cf0-6666-4099-bd87-93f3ebb79b71.preview.lg.jpg',
  },
  'wm-syd': {
    label: 'Sydney World Major Poster',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/4bc341b4-98f0-4498-b48b-680cfeb95b47.preview.lg.jpg',
  },
  'wm-tky': {
    label: 'Tokyo World Major Poster',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/a09ca5bc-a6a6-4de0-92d4-1eb83e06c0ed.preview.lg.jpg',
  },

  // ── Standard Race Prints ──────────────────────────────────────────────
  'air-force-marathon': {
    label: 'Air Force Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/20b63825-20c4-4a1a-b13f-f8fa3230e1d4.preview.lg.jpg',
  },
  'atm': {
    label: 'Army Ten Miler',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/a5b39ac4-a0c4-406d-a035-8dd4e8199594.preview.lg.jpg',
  },
  'austin': {
    label: 'Austin Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/a02e38b6-deaf-4a74-b746-1a059836c4d7.preview.lg.jpg',
  },
  'baltimore-marathon': {
    label: 'Baltimore Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/152b1498-0dd7-4d7c-9b29-8814aa7aeaf5.preview.lg.jpg',
  },
  'berlin': {
    label: 'Berlin Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/2d9799c4-c5a8-402d-84cf-2101d65a666a.preview.lg.jpg',
  },
  'boston': {
    label: 'Boston Race Print',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/d297414e-aec8-415b-87a7-c75978981c8f.preview.lg.jpg',
  },
  'buffalo': {
    label: 'Buffalo Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/23002da5-6709-4485-939e-f7f3c853334d.preview.lg.jpg',
  },
  'chicago-marathon-2': {
    label: 'Chicago Race Print',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/3a956eea-7e3a-4ae2-98fc-966dd4956993.preview.lg.jpg',
  },
  'cim': {
    label: 'California International Marathon (CIM)',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/ae096a9d-6a5a-4845-8597-a4c6d2adc476.preview.lg.jpg',
  },
  'columbus-marathon-personalized-race-print': {
    label: 'Columbus Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/5cb7f386-1b38-4df7-96b2-0466b9a748e5.preview.lg.jpg',
  },
  'cowtown': {
    label: 'Cowtown Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/bf5a26bc-8355-47de-81d5-dd729fd9819e.preview.lg.jpg',
  },
  'custom': {
    label: 'Custom Trackstar Print',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/Custom_Hero.png',
  },
  'dallas-marathon': {
    label: 'Dallas Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/13191c47-248c-4a01-9565-b462a77255f3.preview.lg.jpg',
  },
  'dcm': {
    label: 'Denver Colfax Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/df5900cc-9f77-4e2e-8862-9ac173689a46.preview.lg.jpg',
  },
  'detroit-marathon-personalized-race-print': {
    label: 'Detroit Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/55684e42-0cb2-427c-9f90-aa368fdf43b8.preview.lg.jpg',
  },
  'eugene': {
    label: 'Eugene Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/404f8c7f-d0ec-4dcf-8a5b-84f55883fa42.preview.lg.jpg',
  },
  'flm': {
    label: 'Ft. Lauderdale Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/dc073f05-9c34-4d56-9b70-b9aaa29f319e.preview.lg.jpg',
  },
  'gradstar': {
    label: 'Graduate Wall Art',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/1_-_All_Three_Styles_a80fb6d4-9e3a-4983-9628-cffb2f56f3e4.png',
  },
  'grandmas-marathon': {
    label: "Grandma's Marathon",
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/923fb73d-0a5f-44db-835b-1d55b171c59d.preview.lg.jpg',
  },
  'historic-half': {
    label: 'Marine Corps Historic Half',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/902cd366-b3d4-4c9a-9731-857e417a49c2.preview.lg.jpg',
  },
  'honolulu-marathon': {
    label: 'Honolulu Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/57888bdb-1c6a-4945-adde-f7562b0fb646.preview.lg.jpg',
  },
  'houston-marathon': {
    label: 'Houston Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/b8b5a5f2-7513-434c-9425-e7b38d698232.preview.lg.jpg',
  },
  'illinois': {
    label: 'Illinois Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/a94a90cf-5b72-43e3-9df8-fb980f020e6c.preview.lg.jpg',
  },
  'indianapolis-monumental-marathon-personalized-race-print': {
    label: 'Indianapolis Monumental Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/08400b96-ed6f-4e4e-864f-e5084d074d64.preview.lg.jpg',
  },
  'jcm': {
    label: 'Jersey City Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/b0276550-58e6-4a56-a5ce-7f3dba0e93e0.preview.lg.jpg',
  },
  'jhm': {
    label: 'Jackson Hole Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/e1bb608c-125e-4c6f-afae-e98aa90fd8e6.preview.lg.jpg',
  },
  'kiawah-island-marathon': {
    label: 'Kiawah Island Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/0d703e8b-9646-4a41-a497-029c6dfd1c65.preview.lg.jpg',
  },
  'london': {
    label: 'London Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/8946de06-b4fc-49be-8245-501444177d51.preview.lg.jpg',
  },
  'los-angeles': {
    label: 'Los Angeles Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/6ff323ea-9598-4026-a30f-41f7589ecd3a.preview.lg_7c31bd4b-ca42-44a6-891e-4b034b1de83c.jpg',
  },
  'louisiana-marathon': {
    label: 'Louisiana Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/a1e63a89-9e26-4fc5-bdb7-fb807514c848.preview.lg.jpg',
  },
  'lvm': {
    label: 'Las Vegas Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/4271b159-5691-4742-a30d-28592fed00ba.preview.lg.jpg',
  },
  'marine-corps-marathon': {
    label: 'Marine Corps Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/3b0257a1-72d0-4517-a034-42f1c42ef4eb.preview.lg.jpg',
  },
  'memphis': {
    label: 'Memphis Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/698fc91d-84a6-4c60-9594-e0d7c849c1d9.preview.lg.jpg',
  },
  'mesa': {
    label: 'Mesa Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/3809e57a-c35c-44f0-9640-8d46a8914667.preview.lg.jpg',
  },
  'miami': {
    label: 'Miami Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/9f015a29-0a28-46c7-a09b-96a30c59ed96.preview.lg.jpg',
  },
  'nyc-marathon': {
    label: 'New York City Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/dc2c9278-888b-486c-8ec9-690a68add30c.preview.lg.jpg',
  },
  'oakland': {
    label: 'Oakland Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/107e2265-981f-4eb5-b216-8192a00293d8.preview.lg.jpg',
  },
  'oc-marathon': {
    label: 'Orange County Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/60d61e6e-e079-4098-90d4-ec85ce8ed30f.preview.lg.jpg',
  },
  'palm-beaches-marathon': {
    label: 'Palm Beaches Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/fc0eaea3-0fac-4ae0-b054-2ff0f45ee584.preview.lg.jpg',
  },
  'philadelphia-marathon': {
    label: 'Philadelphia Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/9b2b2bba-020c-463b-967c-3232555a6a43.preview.lg.jpg',
  },
  'pittsburgh': {
    label: 'Pittsburgh Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/04a32c1e-398c-4490-acbe-f9bf1a6cad6e.preview.lg.jpg',
  },
  'san-antonio-marathon-personalized-race-poster': {
    label: 'San Antonio Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/dedc61f2-701e-4ded-8578-a8fc8e4e87b7.preview.lg.jpg',
  },
  'scm': {
    label: 'Surf City Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/6ec035c9-aee4-4f05-8261-8b21fa338780.preview.lg.jpg',
  },
  'sf-marathon': {
    label: 'San Francisco Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/1898eee1-1f07-4af2-bf45-7873f6457e0c.preview.lg.jpg',
  },
  'sgm': {
    label: 'St. George Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/f37c1492-f7a8-439b-8faf-502557e0cc6c.preview.lg.jpg',
  },
  'sydney': {
    label: 'Sydney Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/88895859-a509-4da5-8b83-8793048d7a4b.preview.lg.jpg',
  },
  'tcm': {
    label: 'Twin Cities Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/49860b07-9802-4b97-9146-41dab18669ba.preview.lg.jpg',
  },
  'tokyo': {
    label: 'Tokyo Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/d62742c4-e3f0-43e5-9702-5afee170dd90.preview.lg.jpg',
  },
  'trackstar-gift-card': {
    label: 'Trackstar Gift Card',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/TrackstarGiftCard.png',
  },
  'vermont-city': {
    label: 'Vermont City Marathon',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/4b75a456-6304-4f24-a565-7d001ba6d496.preview.lg.jpg',
  },
  '1775k': {
    label: 'Marine Corps 17.75k',
    heroImageUrl: 'https://cdn.shopify.com/s/files/1/0662/7151/0811/files/d418ea51-95a6-4f39-977e-ee2dcc5b6bf9.preview.lg.jpg',
  },
}

// Etsy listing IDs (add as needed)
const ETSY_LISTINGS = {}

/**
 * Try to extract product handle from Shopify line item.
 * Shopify doesn't include handle directly, but we can derive it from the
 * product admin URL if present, or fall back to title matching.
 */
function extractHandle(li) {
  // Check properties for handle (some themes store it)
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
 * Find catalog entry by matching title keywords.
 * Used as fallback when product_id and handle lookups fail.
 */
function findByTitle(title) {
  if (!title) return null
  const lower = title.toLowerCase()

  for (const [handle, entry] of Object.entries(SHOPIFY_CATALOG)) {
    // Check if the catalog label appears in the title
    if (entry.label && lower.includes(entry.label.toLowerCase())) {
      return { handle, ...entry }
    }
    // Check if handle keywords appear in title
    const handleWords = handle.replace(/-/g, ' ')
    if (lower.includes(handleWords)) {
      return { handle, ...entry }
    }
  }
  return null
}

/**
 * Resolve product info for an order. Returns catalog entry if found,
 * otherwise a fallback object built from the order's raw line-item title.
 */
export function getProductInfo(order) {
  if (!order || typeof order !== 'object') return null

  // Shopify
  if (order.source === 'shopify') {
    const li = order.shopifyOrderData?.line_items?.[order.lineItemIndex || 0]
    if (!li) return null

    const productId = String(li.product_id || '')
    let fromCatalog = null
    let handle = null

    // Try 1: Look up by product_id → handle → catalog
    const idEntry = SHOPIFY_PRODUCTS_BY_ID[productId]
    if (idEntry?.handle) {
      handle = idEntry.handle
      fromCatalog = SHOPIFY_CATALOG[handle]
    }

    // Try 2: Extract handle from line item properties
    if (!fromCatalog) {
      handle = extractHandle(li)
      if (handle) {
        fromCatalog = SHOPIFY_CATALOG[handle]
      }
    }

    // Try 3: Match by title
    if (!fromCatalog) {
      const titleMatch = findByTitle(li.title)
      if (titleMatch) {
        handle = titleMatch.handle
        fromCatalog = titleMatch
      }
    }

    return {
      source: 'shopify',
      productId,
      productIdLabel: 'Shopify product ID',
      variantId: li.variant_id ? String(li.variant_id) : null,
      rawTitle: li.title || null,
      handle,
      label: fromCatalog?.label || li.title || null,
      heroImageUrl: fromCatalog?.heroImageUrl || null,
      inCatalog: !!fromCatalog,
      catalogRequired: true,
    }
  }

  // Etsy
  if (order.source === 'etsy') {
    const tx = order.etsyOrderData?.transactions?.[order.lineItemIndex || 0]
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

export default { getProductInfo }
