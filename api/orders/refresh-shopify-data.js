/**
 * POST /api/orders/refresh-shopify-data
 *
 * Handles two modes:
 *   1. Single order: { shopifyOrderId } — fetches personalization for one order
 *   2. Batch refresh: {} (no body) — re-fetches Shopify data for ALL orders
 *
 * Useful for updating orders when extraction logic changes
 */

import prisma from '../_lib/prisma.js'
import { setCors, requireAdmin } from '../_lib/auth.js'
import { shopifyFetch } from '../../server/services/shopifyAuth.js'
import { normalizeRaceName } from '../../server/scrapers/raceNameNormalization.js'

// Fallback for batch mode (uses direct token auth)
const SHOPIFY_SHOP_URL = process.env.SHOPIFY_SHOP_URL
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN

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
      return await handleSingleOrder(req, res, shopifyOrderId)
    }

    // Batch mode — refresh all orders
    return await handleBatchRefresh(req, res)

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
 * Fetch personalization data from Shopify for a single order
 */
async function handleSingleOrder(req, res, shopifyOrderId) {
  const data = await shopifyFetch(`/orders/${shopifyOrderId}.json`)
  const shopifyOrder = data.order

  if (!shopifyOrder) {
    return res.status(404).json({ error: 'Order not found in Shopify' })
  }

  const parsed = extractShopifyData(shopifyOrder.line_items)
  const notes = await fetchShopifyComments(shopifyOrderId)

  // Update all line items for this order
  const existingOrders = await prisma.order.findMany({
    where: { parentOrderNumber: String(shopifyOrderId) }
  })

  for (const existing of existingOrders) {
    const lineItemIndex = existing.lineItemIndex
    const lineItem = shopifyOrder.line_items?.[lineItemIndex]

    if (lineItem) {
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
          status: lineItemData.needsAttention ? 'missing_year' : existing.status
        }
      })
    }
  }

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
 * Re-fetch Shopify data for ALL orders in the database
 */
async function handleBatchRefresh(req, res) {
  console.log('[API /orders/refresh-shopify-data] Starting batch refresh...')

  const orders = await prisma.order.findMany({
    where: { source: 'shopify' },
    select: { orderNumber: true }
  })

  console.log(`[Refresh] Found ${orders.length} Shopify orders to refresh`)

  const results = { total: orders.length, updated: 0, failed: 0, errors: [] }

  for (const order of orders) {
    try {
      const orderNumber = order.orderNumber

      const response = await fetch(`https://${SHOPIFY_SHOP_URL}/admin/api/2024-01/orders/${orderNumber}.json`, {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        results.failed++
        results.errors.push({ orderNumber, error: `Shopify API ${response.status}` })
        continue
      }

      const data = await response.json()
      const shopifyOrder = data.order

      if (!shopifyOrder) {
        results.failed++
        results.errors.push({ orderNumber, error: 'No order data returned' })
        continue
      }

      const parsed = extractShopifyData(shopifyOrder.line_items || [])
      const notes = await fetchShopifyComments(shopifyOrder.id)

      await prisma.order.update({
        where: { orderNumber: String(orderNumber) },
        data: {
          raceName: parsed.raceName,
          runnerName: parsed.runnerName,
          raceYear: parsed.raceYear,
          shopifyOrderData: shopifyOrder,
          hadNoTime: parsed.hadNoTime,
          notes: notes,
          status: parsed.needsAttention ? 'missing_year' : 'pending'
        }
      })

      results.updated++
      console.log(`[Refresh] Updated order ${orderNumber}: ${parsed.runnerName} - ${parsed.raceName} (${parsed.raceYear})`)

    } catch (error) {
      console.error(`[Refresh] Error processing order ${order.orderNumber}:`, error.message)
      results.failed++
      results.errors.push({ orderNumber: order.orderNumber, error: error.message })
    }
  }

  console.log(`[Refresh] Complete: ${results.updated} updated, ${results.failed} failed`)
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
  result.raceName = parseRaceName(result.rawProductTitle)

  for (const item of lineItems) {
    if (!item.properties || !Array.isArray(item.properties)) continue

    for (const prop of item.properties) {
      const name = (prop.name || '').trim()
      const value = (prop.value || '').trim()

      // "No time" checkbox property
      if (name === 'No time' || name === 'no time' || name === 'no_time') {
        result.hadNoTime = true
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
        if (value) result.raceName = value
      }
    }
  }

  if (!result.runnerName || !result.raceYear) {
    result.needsAttention = true
  }

  return result
}

/**
 * Parse race name from product title.
 *
 * Handles two title formats:
 *   Old: "Boston Marathon Personalized Race Print" → "Boston Marathon"
 *   New: "Personalized Boston Poster"              → "Boston Marathon" (via normalize)
 *        "Personalized Eugene Marathon Poster"     → "Eugene Marathon"
 */
function parseRaceName(productTitle) {
  if (!productTitle) return null

  let raceName = productTitle.trim()

  // Strip leading "Personalized " prefix (new title format)
  raceName = raceName.replace(/^Personalized\s+/i, '').trim()

  // Strip known suffixes — longest first so "Personalized Race Print" beats "Print"
  const suffixes = ['Personalized Race Print', 'Race Print', 'Personalized Poster', 'Poster', 'Print']
  for (const suffix of suffixes) {
    if (raceName.toLowerCase().endsWith(suffix.toLowerCase())) {
      raceName = raceName.slice(0, -suffix.length).trim()
      break
    }
  }

  // Map bare names ("Boston") to canonical ("Boston Marathon") for scraper lookup
  return normalizeRaceName(raceName) || null
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
