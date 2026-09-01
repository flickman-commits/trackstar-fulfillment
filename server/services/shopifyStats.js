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
 * ─── Denominators are the whole game ───
 *
 * Every metric here is a percentage, and the arguments are all about what goes
 * underneath the line. Two worked examples, both measured rather than assumed:
 *
 *   Gift rate. 71 of 73 recent orders carried the Gift question. 47 answered
 *   "This is a gift", 9 answered "This is for me", and 15 left it blank.
 *   Counting blanks as "not a gift" gives 66%; excluding them gives 84%. We
 *   exclude, because a shopper who skipped the question did not tell us they
 *   were not gifting - and `unanswered` is reported so the choice is visible.
 *
 *   Photo add-on. Measured against orders that COULD have added one, meaning
 *   orders containing a personalized print. Gift cards and anything else the
 *   add-on is not offered on would otherwise pad the denominator and understate
 *   the rate. In the last 30 days zero add-ons appeared on a non-eligible
 *   order, which is what makes that definition trustworthy rather than tidy.
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

const propValue = (li, name) =>
  (li?.properties || []).find(p => String(p?.name).trim().toLowerCase() === name)?.value

const hasProp = (li, name) =>
  (li?.properties || []).some(p => String(p?.name).trim().toLowerCase() === name)

/** The paid photo add-on, which rides as its own line item. */
export const isPhotoAddon = li =>
  hasProp(li, '_addon_for') || /photo\s*add-?on/i.test(String(li?.title || ''))

/**
 * A personalized race print: the thing the add-on attaches to, and therefore
 * what makes an order eligible for it. Checked against several property names
 * because the wizard has shipped more than one spelling over time.
 */
export const isPersonalizedPrint = li =>
  !isPhotoAddon(li) &&
  ['runner name (first & last)', 'runner name', 'race name', '_gc_ext_personalized_order']
    .some(n => hasProp(li, n))

/* ── the metrics ──────────────────────────────────────────────────────── */

export const METRICS = [
  {
    key: 'gift_rate',
    label: 'Gifting rate',
    unit: '%',
    describe: 'Share of shoppers who said the print was a gift, out of those who answered the question.',
    compute(orders) {
      let answered = 0, gifts = 0, unanswered = 0
      for (const o of orders) {
        // One answer per ORDER, not per item: a three-print order is one
        // shopper making one decision.
        const raw = (o.line_items || []).map(li => propValue(li, 'gift')).find(v => v !== undefined)
        if (raw === undefined) continue
        if (!String(raw).trim()) { unanswered++; continue }
        answered++
        if (/this is a gift/i.test(String(raw))) gifts++
      }
      return {
        numerator: gifts,
        denominator: answered,
        detail: `${gifts} of ${answered} who answered`,
        note: unanswered
          ? `${unanswered} saw the question and skipped it, and are left out rather than counted as "not a gift".`
          : null,
      }
    },
  },
  {
    key: 'photo_addon_rate',
    label: 'Photo add-on take rate',
    unit: '%',
    describe: 'Share of orders containing a personalized print that also bought the photo add-on.',
    compute(orders) {
      let eligible = 0, took = 0
      for (const o of orders) {
        const items = o.line_items || []
        if (!items.some(isPersonalizedPrint)) continue
        eligible++
        if (items.some(isPhotoAddon)) took++
      }
      return {
        numerator: took,
        denominator: eligible,
        detail: `${took} of ${eligible} eligible orders`,
        note: 'Measured against orders that could have added one, not all orders.',
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
  const fields = 'id,name,created_at,cancelled_at,test,line_items,financial_status'
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
