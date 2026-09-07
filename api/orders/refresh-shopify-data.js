/**
 * POST /api/orders/refresh-shopify-data
 *
 * Handles two modes:
 *   1. Single order: { shopifyOrderId } — re-fetches personalization for one order
 *   2. Batch refresh: {} (no body) — re-fetches Shopify data for ALL Shopify orders
 *
 * Both modes go through refreshOrderFromShopify() so they cannot drift. The
 * batch path used to call the Admin API directly with SHOPIFY_SHOP_URL and
 * SHOPIFY_ACCESS_TOKEN, two variables nothing else in the app defines, so it
 * failed on every order. It also keyed on the per-line-item orderNumber
 * ("12345-1"), which is not a Shopify id, and reset every row to "pending".
 * Now it walks distinct parent orders with the shared shopifyFetch client and
 * keeps each row's status, exactly like the single-order path.
 *
 * Useful for updating orders when extraction logic changes.
 */

import prisma from '../_lib/prisma.js'
import { setCors, requireAdmin } from '../_lib/auth.js'
import { shopifyFetch } from '../../server/services/shopifyAuth.js'
import { parseRaceNameFromTitle } from '../../server/scrapers/raceNameNormalization.js'
import { resolveShopifyLineIndex } from '../../server/lib/lineItemMatching.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'POST, OPTIONS' })) return
  if (!requireAdmin(req, res)) return

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { shopifyOrderId } = req.body || {}

    // Single order mode — fetch personalization for one order
    if (shopifyOrderId) {
      return await handleSingleOrder(res, shopifyOrderId)
    }

    // Batch mode — refresh all orders
    return await handleBatchRefresh(res)

  } catch (error) {
    console.error('[API /orders/refresh-shopify-data] Error:', error)
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}

/**
 * Re-fetch one Shopify order and update every line-item row that belongs to
 * it. Returns a summary, or null when Shopify has no such order.
 */
async function refreshOrderFromShopify(shopifyOrderId) {
  const data = await shopifyFetch(`/orders/${shopifyOrderId}.json`)
  const shopifyOrder = data.order
  if (!shopifyOrder) return null

  const parsed = extractShopifyData(shopifyOrder.line_items)
  const notes = await fetchShopifyComments(shopifyOrderId)

  const existingOrders = await prisma.order.findMany({
    where: { parentOrderNumber: String(shopifyOrderId) }
  })

  let updated = 0
  for (const existing of existingOrders) {
    // `existing.lineItemIndex` indexes ARTELO's items, not Shopify's. Using it
    // directly against line_items could land on the photo add-on and overwrite
    // the row's personalization with the add-on's (empty) properties.
    const shopifyIdx = resolveShopifyLineIndex({ ...existing, shopifyOrderData: shopifyOrder })
    const lineItem = shopifyIdx >= 0 ? shopifyOrder.line_items?.[shopifyIdx] : null
    if (!lineItem) continue

    const lineItemData = extractShopifyData([lineItem])

    await prisma.order.update({
      where: { id: existing.id },
      data: {
        raceName: lineItemData.raceName || existing.raceName,
        runnerName: lineItemData.runnerName || existing.runnerName,
        raceYear: lineItemData.raceYear || existing.raceYear,
        hadNoTime: lineItemData.hadNoTime || false,
        notes: notes || existing.notes,
        shopifyOrderData: shopifyOrder,
        status: lineItemData.needsAttention ? 'missing_year' : existing.status,
        // Widget / Easify parity fields
        customerBib: lineItemData.customerBib,
        customerFinishTime: lineItemData.customerFinishTime,
        customerPace: lineItemData.customerPace,
        customerEventType: lineItemData.customerEventType,
        lookupVerified: lineItemData.lookupVerified,
        lookupOutcome: lineItemData.lookupOutcome,
        photoPath: lineItemData.photoPath,
        isGift: lineItemData.isGift
      }
    })
    updated++
  }

  return { shopifyOrder, parsed, notes, updated, rows: existingOrders.length }
}

/**
 * Fetch personalization data from Shopify for a single order
 */
async function handleSingleOrder(res, shopifyOrderId) {
  const result = await refreshOrderFromShopify(shopifyOrderId)
  if (!result) {
    return res.status(404).json({ error: 'Order not found in Shopify' })
  }
  const { shopifyOrder, parsed, notes } = result

  return res.status(200).json({
    success: true,
    shopifyOrderId: shopifyOrder.id,
    orderName: shopifyOrder.name,
    raceName: parsed.raceName,
    runnerName: parsed.runnerName,
    raceYear: parsed.raceYear,
    hadNoTime: parsed.hadNoTime,
    notes,
    needsAttention: parsed.needsAttention,
    raw: {
      productTitle: parsed.rawProductTitle,
      raceName: parsed.rawRaceName,
      runnerName: parsed.rawRunnerName,
      raceYear: parsed.rawRaceYear
    }
  })
}

/**
 * Re-fetch Shopify data for ALL Shopify orders in the database.
 * One Shopify order can be several rows (one per line item); fetch each
 * parent once and let refreshOrderFromShopify fan out to its rows.
 */
async function handleBatchRefresh(res) {
  console.log('[API /orders/refresh-shopify-data] Starting batch refresh...')

  const parents = await prisma.order.findMany({
    where: { source: 'shopify' },
    select: { parentOrderNumber: true },
    distinct: ['parentOrderNumber']
  })

  console.log(`[Refresh] Found ${parents.length} Shopify orders to refresh`)

  const results = { total: parents.length, updated: 0, failed: 0, errors: [] }

  for (const { parentOrderNumber } of parents) {
    try {
      const result = await refreshOrderFromShopify(parentOrderNumber)
      if (!result) {
        results.failed++
        results.errors.push({ orderNumber: parentOrderNumber, error: 'No order data returned' })
        continue
      }
      results.updated += result.updated
      console.log(`[Refresh] Updated ${result.updated}/${result.rows} rows for order ${parentOrderNumber}: ${result.parsed.runnerName} - ${result.parsed.raceName} (${result.parsed.raceYear})`)
    } catch (error) {
      console.error(`[Refresh] Error processing order ${parentOrderNumber}:`, error.message)
      results.failed++
      results.errors.push({ orderNumber: parentOrderNumber, error: error.message })
    }
  }

  console.log(`[Refresh] Complete: ${results.updated} rows updated, ${results.failed} orders failed`)
  return res.status(200).json({ success: true, ...results })
}

/**
 * Extract and parse Shopify line item data
 */
function extractShopifyData(lineItems) {
  const result = {
    raceName: null,
    runnerName: null,
    raceYear: null,
    needsAttention: false,
    hadNoTime: false,
    // Parity with processOrders.extractShopifyPersonalization — Instant Lookup
    // widget / Easify fields so a refresh repopulates the same columns.
    customerBib: null,
    customerFinishTime: null,
    customerPace: null,
    customerEventType: null,
    lookupVerified: null,
    lookupOutcome: null,
    photoPath: null,
    isGift: false,
    rawProductTitle: null,
    rawRunnerName: null,
    rawRaceYear: null,
    rawRaceName: null
  }

  if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
    return result
  }

  const firstItem = lineItems[0]
  result.rawProductTitle = firstItem.title || null
  result.raceName = parseRaceNameFromTitle(result.rawProductTitle)

  for (const item of lineItems) {
    if (!item.properties || !Array.isArray(item.properties)) continue

    for (const prop of item.properties) {
      const name = (prop.name || '').trim()
      const value = (prop.value || '').trim()

      // "No time" checkbox. Presence is NOT the signal — the personalization
      // wizard always writes this property and leaves the value blank when the
      // shopper did not tick the box. See processOrders.isTruthyFlag.
      if (name === 'No time' || name === 'no time' || name === 'no_time') {
        const v = String(value || '').trim().toLowerCase()
        if (v && v !== 'false' && v !== 'no' && v !== '0' && v !== 'off') {
          result.hadNoTime = true
        }
      }
      else if (name === 'Runner Name (First & Last)' ||
          name === 'Runner Name' ||
          name === 'runner name' ||
          name === 'runner_name') {
        result.rawRunnerName = value
        const cleaned = cleanRunnerName(value)
        result.runnerName = cleaned.cleaned
        // Legacy: also detect "no time" typed into the name field
        if (cleaned.hadNoTime) result.hadNoTime = true
      }
      else if (name === 'Race Year' || name === 'race year' || name === 'race_year') {
        result.rawRaceYear = value
        const yearInt = parseInt(value, 10)
        result.raceYear = isNaN(yearInt) ? null : yearInt
      }
      else if (name === 'Race Name' || name === 'race name' || name === 'race_name') {
        result.rawRaceName = value
        // Parsed, not trusted raw: the wizard sometimes puts the full product
        // title in this property. See the matching note in processOrders.js.
        if (value) result.raceName = parseRaceNameFromTitle(value) || value
      }
      else if (name === 'Bib #' || name === 'Bib #:' || name === 'bib_number') {
        result.customerBib = value || null
      }
      else if (name === 'Time' || name === 'Time:' || name === 'time') {
        result.customerFinishTime = value || null
      }
      else if (name === 'Pace' || name === 'Pace:' || name === 'pace') {
        result.customerPace = value || null
      }
      else if (name === 'Event' || name === 'Event Type' || name === 'event' || name === 'event_type' || name === 'Distance' || name === 'distance') {
        result.customerEventType = value || null
      }
      else if (name === 'Gift' || name === 'Gift:' || name === 'gift') {
        const v = value.toLowerCase()
        result.isGift = v === 'this is a gift' || v === 'yes' || v === 'true'
      }
      else if (name === '_lookup_verified' || name === 'lookup_verified') {
        result.lookupVerified = value ? value.toLowerCase() === 'true' : false
      }
      else if (name === '_lookup_outcome' || name === 'lookup_outcome') {
        result.lookupOutcome = value || null
      }
      else if (name === '_photo_path' || name === 'photo_path') {
        result.photoPath = value || null
      }
    }
  }

  if (!result.runnerName || !result.raceYear) {
    result.needsAttention = true
  }

  return result
}

/**
 * Clean runner name by removing "no time" variations
 */
function cleanRunnerName(runnerName) {
  if (!runnerName) return { cleaned: null, hadNoTime: false }

  let cleaned = runnerName.trim()
  const hadNoTime = /\bno\s+time\b/i.test(cleaned)
  cleaned = cleaned.replace(/\bno\s+time\b/gi, '').replace(/\s+/g, ' ').trim()

  return { cleaned: cleaned || null, hadNoTime }
}

/**
 * Fetch timeline comments (internal notes) from Shopify order events
 */
async function fetchShopifyComments(shopifyOrderId) {
  try {
    const data = await shopifyFetch(`/orders/${shopifyOrderId}/events.json`)
    const events = data.events || []

    const comments = events
      .filter(e => e.verb === 'comment' && e.body)
      .map(e => ({ body: e.body, author: e.author, createdAt: e.created_at }))

    if (comments.length === 0) return null
    return comments.map(c => c.body).join(' | ')
  } catch (error) {
    console.error(`Failed to fetch comments for order ${shopifyOrderId}:`, error.message)
    return null
  }
}
