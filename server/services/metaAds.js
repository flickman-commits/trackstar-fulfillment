/**
 * Meta Ads service — pulls insights from the Marketing API.
 *
 * Auth:
 *   META_ADS_ACCESS_TOKEN — System User access token with ads_read scope
 *
 * The Trackstar ad account ID is hardcoded — account IDs aren't sensitive
 * and only one account is in play. If Matt ever switches accounts, change
 * AD_ACCOUNT_ID here.
 *
 * The cron asks for two views per run:
 *   1. Account-level totals (one row, for the scorecard)
 *   2. Ad-level breakdown (every ad with spend, for kill/scale decisions)
 *
 * Meta returns `actions` as an array of typed objects — purchases and
 * add-to-carts live inside there as `omni_purchase` / `omni_add_to_cart`.
 * Matt's Apps Script discovered (the hard way) that you must use the `omni_`
 * variants only — summing both `purchase` and `omni_purchase` double-counts.
 */

const AD_ACCOUNT_ID = 'act_1374112137558894'
const API_VERSION = 'v21.0'

// Action types that represent "a purchase happened" in Meta's universe
const PURCHASE_ACTION_TYPE = 'omni_purchase'
const ATC_ACTION_TYPE = 'omni_add_to_cart'

function getAccessToken() {
  const token = process.env.META_ADS_ACCESS_TOKEN
  if (!token) throw new Error('META_ADS_ACCESS_TOKEN not set')
  return token
}

/**
 * Sum the `value` field from an action-array entry matching `actionType`.
 * Returns 0 if no match.
 */
function sumActions(arr, actionType) {
  if (!Array.isArray(arr)) return 0
  let total = 0
  for (const item of arr) {
    if (item?.action_type === actionType) {
      total += parseFloat(item.value || 0)
    }
  }
  return total
}

/**
 * Pull account-level totals for a date range.
 * @param {string} since - "YYYY-MM-DD" (inclusive)
 * @param {string} until - "YYYY-MM-DD" (inclusive)
 */
export async function getAccountInsights(since, until) {
  const token = getAccessToken()
  const params = new URLSearchParams({
    access_token: token,
    time_range: JSON.stringify({ since, until }),
    fields: 'spend,impressions,clicks,cpc,ctr,cpm,reach,frequency,actions,action_values,cost_per_action_type',
    level: 'account',
  })
  const url = `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/insights?${params}`

  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Meta account insights failed (${res.status}): ${body.slice(0, 300)}`)
  }
  const json = await res.json()
  const row = (json.data || [])[0]
  if (!row) {
    return {
      spend: 0, impressions: 0, clicks: 0, cpc: 0, ctr: 0, cpm: 0,
      reach: 0, frequency: 0, purchases: 0, purchaseValue: 0, addToCarts: 0,
      cpa: 0, roas: 0,
    }
  }

  const spend = parseFloat(row.spend || 0)
  const purchases = sumActions(row.actions, PURCHASE_ACTION_TYPE)
  const purchaseValue = sumActions(row.action_values, PURCHASE_ACTION_TYPE)
  const addToCarts = sumActions(row.actions, ATC_ACTION_TYPE)

  return {
    spend,
    impressions: parseInt(row.impressions || 0),
    clicks: parseInt(row.clicks || 0),
    cpc: parseFloat(row.cpc || 0),
    ctr: parseFloat(row.ctr || 0),         // Meta returns CTR as a percentage (e.g. 1.5 for 1.5%)
    cpm: parseFloat(row.cpm || 0),
    reach: parseInt(row.reach || 0),
    frequency: parseFloat(row.frequency || 0),
    purchases,
    purchaseValue,
    addToCarts,
    cpa: purchases > 0 ? spend / purchases : 0,
    roas: spend > 0 ? purchaseValue / spend : 0,
  }
}

/**
 * Pull ad-level breakdown — one row per ad that had spend in the window.
 * This is the data the skill needs for kill/scale/graduate decisions.
 *
 * Includes campaign + ad set context (joined into each row) so the prompt
 * can group by concept / angle without making more API calls.
 *
 * Pagination: Meta returns up to 100 rows per page by default. We follow
 * the paging.next link until exhausted. For a typical week (~20-40 ads),
 * this is one call.
 */
export async function getAdLevelInsights(since, until) {
  const token = getAccessToken()
  const params = new URLSearchParams({
    access_token: token,
    time_range: JSON.stringify({ since, until }),
    fields: 'campaign_name,adset_name,ad_name,spend,impressions,clicks,cpc,ctr,cpm,actions,action_values',
    level: 'ad',
    limit: '500',
    // Filter to only ads that ran (any spend > 0). Saves bytes + makes the
    // prompt focus on actionable data.
    filtering: JSON.stringify([{ field: 'spend', operator: 'GREATER_THAN', value: 0 }]),
  })
  const url = `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/insights?${params}`

  const rows = []
  let nextUrl = url
  let safety = 10  // up to 10 pages = 5000 ads, more than we'll ever have

  while (nextUrl && safety-- > 0) {
    const res = await fetch(nextUrl)
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Meta ad-level insights failed (${res.status}): ${body.slice(0, 300)}`)
    }
    const json = await res.json()
    for (const r of (json.data || [])) {
      const spend = parseFloat(r.spend || 0)
      const purchases = sumActions(r.actions, PURCHASE_ACTION_TYPE)
      const purchaseValue = sumActions(r.action_values, PURCHASE_ACTION_TYPE)
      const addToCarts = sumActions(r.actions, ATC_ACTION_TYPE)
      rows.push({
        campaign: r.campaign_name || '(no name)',
        adset: r.adset_name || '(no name)',
        ad: r.ad_name || '(no name)',
        spend,
        impressions: parseInt(r.impressions || 0),
        clicks: parseInt(r.clicks || 0),
        cpc: parseFloat(r.cpc || 0),
        ctr: parseFloat(r.ctr || 0),
        cpm: parseFloat(r.cpm || 0),
        purchases,
        purchaseValue,
        addToCarts,
        cpa: purchases > 0 ? spend / purchases : 0,
        roas: spend > 0 ? purchaseValue / spend : 0,
      })
    }
    nextUrl = json.paging?.next || null
  }

  // Sort by spend descending — the highest-spend ads are the most actionable
  rows.sort((a, b) => b.spend - a.spend)
  return rows
}

/**
 * One-shot convenience: pull both account totals + ad-level for a window.
 */
export async function pullWeekFromMeta(since, until) {
  const [accountTotals, adLevel] = await Promise.all([
    getAccountInsights(since, until),
    getAdLevelInsights(since, until),
  ])
  return { accountTotals, adLevel, window: { since, until } }
}
