/**
 * Storefront stats, computed from Shopify orders rather than our own database.
 *
 * Our Order rows are one per printed ITEM and only exist for orders we have
 * imported, so they are the wrong denominator for anything expressed as "what
 * share of orders". Shopify is the source of truth for what was actually
 * bought, so these read from it directly.
 *
 * ─── Adding a metric ───
 *
 * Add one object to METRICS. It gets the same already-fetched, already-filtered
 * order list every other metric sees and returns a numerator, a denominator and
 * a note. Nothing else needs touching - the endpoint and the dashboard both
 * iterate whatever is in the list.
 *
 * ─── Denominators ───
 *
 *   Gift rate. The order's Shopify TAG, over every order in the window. An
 *   earlier version read a line-item "Gift" property, which is how the store
 *   used to record this and is no longer the source of truth. The tag is set
 *   per order and needs no interpretation - a blank property once forced a
 *   choice between 66% and 84% depending on how you read a non-answer, and this
 *   has no such ambiguity.
 *
 *   Photo add-on. Orders containing the "Photo Add-On" product, over orders
 *   containing at least one print. Matched by TITLE because that product
 *   carries no SKU at all. Eligibility cannot be SKU-only either: prints are
 *   normally `...-s1p-...` but Personalized Chicago ships as plain `chi`, so
 *   the rule accepts either the SKU pattern or a print/poster title. Gift cards
 *   stay out of the denominator, which is the point of having one.
 */

import { shopifyFetch } from './shopifyAuth.js'

/** The business runs on Eastern time, so "today" means today in New York. */
const BUSINESS_TZ = 'America/New_York'

export const RANGES = {
  today: { label: 'Today', days: 0 },
  yesterday: { label: 'Yesterday', days: 0 },
  '7d': { label: 'Past 7 days', days: 7 },
  '30d': { label: 'Past 30 days', days: 30 },
  '90d': { label: 'Past 90 days', days: 90 },
}

/** Midnight in the business timezone, N days ago, as a Date. */
function businessMidnight(daysAgo = 0) {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const get = t => parts.find(p => p.type === t).value
  const local = new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00`)
  local.setDate(local.getDate() - daysAgo)
  // Re-express that wall-clock midnight as a real instant by asking what the
  // offset is on that date, so this stays correct across a DST boundary.
  const offsetMins = -new Date(local.toLocaleString('en-US', { timeZone: BUSINESS_TZ })).getTimezoneOffset()
  return new Date(local.getTime() - offsetMins * 60000 + local.getTimezoneOffset() * 60000)
}

export function rangeWindow(key) {
  const now = new Date()
  if (key === 'today') return { since: businessMidnight(0), until: now }
  if (key === 'yesterday') return { since: businessMidnight(1), until: businessMidnight(0) }
  const days = RANGES[key]?.days ?? 30
  return { since: new Date(now.getTime() - days * 86400000), until: now }
}

/* ── line-item helpers, derived from what the store actually sends ─────── */

/**
 * The paid photo add-on. Matched on title: when a shopper takes it, Shopify
 * adds a line item literally called "Photo Add-On", and that product carries no
 * SKU to match on instead.
 */
export const isPhotoAddon = li => /^photo\s*add-?on$/i.test(String(li?.title || '').trim())

/**
 * A print: what makes an order eligible for the add-on.
 *
 * Two ways to be one, because neither alone covers the catalogue. Print SKUs
 * are normally `sydney-s1p-12x18-bl-pok-am`, but Personalized Chicago ships as
 * plain `chi`, so a SKU-only rule silently drops it. The title fallback catches
 * that without letting gift cards in.
 */
export const isPrint = li =>
  !isPhotoAddon(li) &&
  (/-s1p-/i.test(String(li?.sku || '')) || /\b(print|poster)\b/i.test(String(li?.title || '')))

/* ── the metrics ──────────────────────────────────────────────────────── */

export const METRICS = [
  {
    key: 'gift_rate',
    label: 'Gifting rate',
    unit: '%',
    describe: 'Share of orders tagged "gift" in Shopify.',
    compute(orders) {
      const gifts = orders.filter(o =>
        String(o.tags || '')
          .split(',')
          .some(t => t.trim().toLowerCase() === 'gift')
      ).length
      return {
        numerator: gifts,
        denominator: orders.length,
        detail: `${gifts} of ${orders.length} orders`,
        note: null,
      }
    },
  },
  {
    key: 'photo_addon_rate',
    label: 'Photo add-on take rate',
    unit: '%',
    describe: 'Share of orders containing a print that also bought the Photo Add-On.',
    compute(orders) {
      let eligible = 0, took = 0, firstSeen = null
      for (const o of orders) {
        const items = o.line_items || []
        if (!items.some(isPrint)) continue
        eligible++
        if (items.some(isPhotoAddon)) {
          took++
          if (!firstSeen || o.created_at < firstSeen) firstSeen = o.created_at
        }
      }
      return {
        numerator: took,
        denominator: eligible,
        detail: `${took} of ${eligible} orders with a print`,
        // Say what was measured, not what it implies. firstSeen is the
        // earliest add-on order INSIDE this window, which is not the same as
        // the date the add-on launched - on a 30-day window it is just the
        // oldest one that happens to fall in range. Asserting a launch date
        // from it would be inventing a fact.
        note: firstSeen
          ? `The add-on is recent: the earliest one in this window is ${String(firstSeen).slice(0, 10)}. Longer windows include orders placed before it was offered, so the rate reads low.`
          : null,
      }
    },
  },
]

/* ── fetching ─────────────────────────────────────────────────────────── */

/**
 * Every order in the window, following pagination.
 *
 * Cancelled and test orders are dropped: neither is a real purchase, and
 * leaving them in quietly moves every percentage on the page.
 */
async function fetchOrders({ since, until }) {
  const fields = 'id,name,created_at,cancelled_at,test,tags,line_items,financial_status'
  let endpoint =
    `/orders.json?status=any&limit=250&fields=${fields}` +
    `&created_at_min=${since.toISOString()}&created_at_max=${until.toISOString()}`

  const all = []
  // A hard page cap so a bad window can never walk the whole store.
  for (let page = 0; page < 10 && endpoint; page++) {
    const data = await shopifyFetch(endpoint)
    all.push(...(data.orders || []))
    endpoint = data.orders?.length === 250
      ? `/orders.json?status=any&limit=250&fields=${fields}` +
        `&created_at_min=${since.toISOString()}&created_at_max=${until.toISOString()}` +
        `&since_id=${data.orders[data.orders.length - 1].id}`
      : null
  }
  return all.filter(o => !o.cancelled_at && !o.test)
}

/** Short-lived cache: the dashboard re-asks on every range flip. */
const cache = new Map()
const CACHE_TTL_MS = 5 * 60 * 1000

export async function computeStats(rangeKey = '30d') {
  const key = RANGES[rangeKey] ? rangeKey : '30d'
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ...hit.value, cached: true }

  const window = rangeWindow(key)
  const orders = await fetchOrders(window)

  const value = {
    range: key,
    rangeLabel: RANGES[key].label,
    since: window.since.toISOString(),
    until: window.until.toISOString(),
    orderCount: orders.length,
    metrics: METRICS.map(m => {
      const r = m.compute(orders)
      return {
        key: m.key,
        label: m.label,
        unit: m.unit,
        describe: m.describe,
        // Null rather than 0 when there is nothing to divide by, so the UI can
        // stay quiet instead of printing a confident 0%.
        value: r.denominator > 0 ? Math.round((r.numerator / r.denominator) * 100) : null,
        numerator: r.numerator,
        denominator: r.denominator,
        detail: r.detail,
        note: r.note,
      }
    }),
    computedAt: new Date().toISOString(),
    cached: false,
  }
  cache.set(key, { at: Date.now(), value })
  return value
}
