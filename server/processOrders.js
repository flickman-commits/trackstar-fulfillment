/**
 * processOrders.js - Core order processing logic
 *
 * This is the shared function that handles:
 * 1. Fetching orders from Artelo API
 * 2. Enriching with Shopify personalization data
 * 3. Saving/updating orders in the database
 * 4. Optionally running research for supported races
 *
 * Can be called from:
 * - API endpoint (manual "Import Now" button)
 * - Scheduled cron job (future)
 * - CLI scripts for testing
 */

import { PrismaClient } from '@prisma/client'
import { shopifyFetch } from './services/shopifyAuth.js'
import { etsyFetch } from './services/etsyAuth.js'
import { parseEtsyRaceName, parseEtsyPersonalization } from './services/etsyPersonalization.js'
import { researchService } from './services/ResearchService.js'
import { hasScraperForRace } from './scrapers/index.js'
import { incrementCustomersServed, syncCustomersServedToShopify, getCountedOrderIds, saveCountedOrderIds } from './services/customersServed.js'

// Artelo API configuration
const ARTELO_API_URL = 'https://www.artelo.io/api/open/orders/get'
const ARTELO_API_KEY = process.env.ARTELO_API_KEY

// Statuses that need design work
const ACTIONABLE_STATUSES = ['PendingFulfillmentAction', 'AwaitingPayment']

// Race name strings that indicate a custom order (customer provides their own data)
const CUSTOM_ORDER_RACE_NAMES = ['Custom Trackstar Print (Any Race)']

/**
 * Check if a race name indicates a custom order
 */
function isCustomOrder(raceName) {
  if (!raceName) return false
  return CUSTOM_ORDER_RACE_NAMES.some(keyword =>
    raceName.toLowerCase().trim() === keyword.toLowerCase()
  )
}

/**
 * Determine if an order is from Shopify or Etsy
 * Logic:
 * - channelName = "Online Store" → Shopify
 * - channelName contains "etsy" → Etsy
 * - channelName missing + order ID 13+ digits → Shopify
 * - channelName missing + order ID shorter → Etsy
 */
function determineOrderSource(order) {
  const channelName = order.channelName?.toLowerCase() || ''
  const orderId = order.orderId || ''

  // Explicit channel indicators
  if (channelName === 'online store') {
    return 'shopify'
  }
  if (channelName.includes('etsy')) {
    return 'etsy'
  }

  // Fallback to order ID length
  // Shopify order IDs are 13+ digits, Etsy are typically 10 digits
  if (orderId.length >= 13 && /^\d+$/.test(orderId)) {
    return 'shopify'
  }

  // Default to Etsy for shorter/different format IDs
  return 'etsy'
}

/**
 * Parse race name from Shopify product title
 */
function parseRaceName(productTitle) {
  if (!productTitle) return null
  const suffixes = ['Personalized Race Print', 'Race Print', 'Print']
  let raceName = productTitle.trim()
  for (const suffix of suffixes) {
    if (raceName.toLowerCase().endsWith(suffix.toLowerCase())) {
      raceName = raceName.slice(0, -suffix.length).trim()
      break
    }
  }
  return raceName || null
}

/**
 * Clean runner name by removing invalid entries like "no time"
 * Returns { cleaned, hadNoTime }
 * e.g., "Jennifer Samp no time" → { cleaned: "Jennifer Samp", hadNoTime: true }
 * e.g., "no time" → { cleaned: null, hadNoTime: true }
 * e.g., "Jennifer Samp" → { cleaned: "Jennifer Samp", hadNoTime: false }
 */
function cleanRunnerName(runnerName) {
  if (!runnerName) return { cleaned: null, hadNoTime: false }

  let cleaned = runnerName.trim()

  // Check if "no time" is present (case-insensitive)
  const hadNoTime = /\bno\s+time\b/i.test(cleaned)

  // Remove "no time" (case-insensitive)
  cleaned = cleaned.replace(/\bno\s+time\b/gi, '')

  // Clean up multiple spaces and trim
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  // If nothing left after cleaning, return null
  if (!cleaned || cleaned.length === 0) {
    return { cleaned: null, hadNoTime }
  }

  return { cleaned, hadNoTime }
}

/**
 * DEPRECATED: Old format parsing (kept for reference)
 * Parse runner name and year from combined string
 * OLD Format: "Runner Name 2024"
 */
function parseRunnerNameAndYear_DEPRECATED(rawValue) {
  if (!rawValue) return { runnerName: null, raceYear: null, needsAttention: true }
  const trimmed = rawValue.trim()
  const yearMatch = trimmed.match(/\s+(20\d{2})$/)
  if (yearMatch) {
    return {
      runnerName: trimmed.slice(0, -yearMatch[0].length).trim(),
      raceYear: parseInt(yearMatch[1], 10),
      needsAttention: false
    }
  }
  return { runnerName: trimmed, raceYear: null, needsAttention: true }
}

/**
 * Extract personalization data from a single Shopify line item
 * NEW FORMAT (as of 2025): Separate properties for each field
 * Also extracts custom order fields (bib, time, creative direction, gift)
 */
function extractShopifyPersonalization(lineItem) {
  const result = {
    productTitle: null,  // Raw product title (used for custom order detection)
    raceName: null,
    runnerName: null,
    raceYear: null,
    hadNoTime: false,  // Flag to indicate "no time" was present
    needsAttention: false,
    // Custom order fields
    bibNumberCustomer: null,
    timeCustomer: null,
    creativeDirection: null,
    isGift: false
  }

  if (!lineItem) {
    result.needsAttention = true
    return result
  }

  // Store the raw product title for custom order detection
  result.productTitle = lineItem.title || null

  // Parse race name from product title (default, may be overridden by Race Name property)
  result.raceName = parseRaceName(lineItem.title)

  // Extract from properties
  if (lineItem.properties && Array.isArray(lineItem.properties)) {
    for (const prop of lineItem.properties) {
      const name = (prop.name || '').trim()
      const value = (prop.value || '').trim()

      // Standardized property name: "Runner Name" (works for both normal and custom orders)
      // Matches: "Runner Name (First & Last)", "Runner Name", "runner name", "runner_name"
      if (name === 'Runner Name (First & Last)' ||
          name === 'Runner Name' ||
          name === 'runner name' ||
          name === 'runner_name') {
        // Clean the runner name (remove "no time" if present)
        const cleaned = cleanRunnerName(value)
        result.runnerName = cleaned.cleaned
        result.hadNoTime = cleaned.hadNoTime
      }
      // Race year
      else if (name === 'Race Year' || name === 'race year' || name === 'race_year') {
        const yearInt = parseInt(value, 10)
        result.raceYear = isNaN(yearInt) ? null : yearInt
      }
      // Race name (override product title if provided — e.g. custom orders provide the actual race)
      else if (name === 'Race Name' || name === 'race name' || name === 'race_name') {
        if (value) {
          result.raceName = value
        }
      }
      // Custom order fields
      else if (name === 'Bib #' || name === 'Bib #:' || name === 'bib_number') {
        result.bibNumberCustomer = value || null
      }
      else if (name === 'Time' || name === 'Time:' || name === 'time') {
        result.timeCustomer = value || null
      }
      else if (name === 'Creative Direction' || name === 'Creative Direction:' || name === 'creative_direction') {
        result.creativeDirection = value || null
      }
      else if (name === 'Gift' || name === 'Gift:' || name === 'gift') {
        result.isGift = value ? (value.toLowerCase() === 'yes' || value.toLowerCase() === 'true') : false
      }
    }
  }

  // Flag if missing critical data
  if (!result.runnerName || !result.raceYear) {
    result.needsAttention = true
  }

  return result
}

/**
 * Fetch Shopify order data including personalization
 * Returns the full order object with line_items array
 */
async function fetchShopifyOrderData(shopifyOrderId) {
  try {
    const data = await shopifyFetch(`/orders/${shopifyOrderId}.json`)
    const order = data.order

    if (!order || !order.line_items?.length) {
      return null
    }

    // Fetch timeline comments (internal notes) - shared across all line items
    const comments = await fetchShopifyComments(shopifyOrderId)

    return {
      shopifyOrderData: order,
      notes: comments
    }
  } catch (error) {
    console.error(`[processOrders] Failed to fetch Shopify data for order ${shopifyOrderId}:`, error.message)
    return null
  }
}

/**
 * Fetch Shopify order comments/notes
 */
async function fetchShopifyComments(shopifyOrderId) {
  try {
    const data = await shopifyFetch(`/orders/${shopifyOrderId}/events.json`)
    const events = data.events || []

    const comments = events
      .filter(e => e.verb === 'comment' && e.body)
      .map(e => ({
        body: e.body,
        author: e.author,
        createdAt: e.created_at
      }))

    if (comments.length === 0) return null

    return comments.map(c => c.body).join(' | ')
  } catch (error) {
    console.error(`[processOrders] Failed to fetch comments for order ${shopifyOrderId}:`, error.message)
    return null
  }
}

/**
 * Fetch Etsy receipt data for an order
 * The Artelo orderId for Etsy orders is the Etsy receipt_id
 * @param {string} receiptId - Etsy receipt ID
 * @returns {Object|null} - Receipt data with transactions
 */
async function fetchEtsyReceiptData(receiptId) {
  try {
    const shopId = process.env.ETSY_SHOP_ID
    if (!shopId) {
      console.error('[processOrders] ETSY_SHOP_ID not configured')
      return null
    }

    const receipt = await etsyFetch(`/shops/${shopId}/receipts/${receiptId}`)
    return receipt
  } catch (error) {
    console.error(`[processOrders] Failed to fetch Etsy receipt ${receiptId}:`, error.message)
    return null
  }
}

/**
 * Extract personalization from an Etsy transaction (line item)
 * @param {Object} transaction - Etsy transaction object
 * @returns {Object} - Extracted personalization data
 */
function extractEtsyPersonalization(transaction) {
  const result = {
    raceName: null,
    runnerName: null,
    raceYear: null,
    needsAttention: false,
    rawPersonalization: null
  }

  if (!transaction) {
    result.needsAttention = true
    return result
  }

  // Parse race name from listing title
  result.raceName = parseEtsyRaceName(transaction.title) || parseRaceName(transaction.title)

  // Find personalization in variations
  const variations = transaction.variations || []
  const personalization = variations.find(
    v => v.formatted_name === 'Personalization' ||
         v.formatted_name?.toLowerCase() === 'personalization'
  )

  if (personalization?.formatted_value) {
    result.rawPersonalization = personalization.formatted_value
    const parsed = parseEtsyPersonalization(personalization.formatted_value)
    result.runnerName = parsed.runnerName
    result.raceYear = parsed.raceYear
    result.needsAttention = parsed.needsAttention
  } else {
    result.needsAttention = true
  }

  return result
}

/**
 * Main order processing function
 *
 * @param {Object} options - Processing options
 * @param {boolean} options.runResearch - Whether to run research for supported races (default: false)
 * @param {boolean} options.verbose - Whether to log detailed output (default: true)
 * @param {PrismaClient} options.prisma - Optional existing Prisma client
 * @returns {Promise<Object>} Processing results
 */
export async function processOrders(options = {}) {
  const {
    runResearch = false,
    verbose = true,
    prisma: externalPrisma = null
  } = options

  const prisma = externalPrisma || new PrismaClient()
  const shouldDisconnect = !externalPrisma

  const log = verbose ? console.log.bind(console) : () => {}

  const results = {
    success: true,
    imported: 0,
    updated: 0,
    skipped: 0,
    enriched: 0,
    needsAttention: 0,
    researched: 0,
    researchFailed: 0,
    total: 0,
    errors: [],
    orders: []  // Details of processed orders
  }

  try {
    // 1. Fetch orders from Artelo
    log('\n[processOrders] Fetching orders from Artelo...')

    if (!ARTELO_API_KEY) {
      throw new Error('ARTELO_API_KEY not configured')
    }

    const params = new URLSearchParams({ limit: '100', allOrders: 'true' })
    const response = await fetch(`${ARTELO_API_URL}?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ARTELO_API_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Artelo API error: ${response.status}`)
    }

    const data = await response.json()
    const allOrders = Array.isArray(data) ? data : (data.orders || [])

    // Count ALL new Artelo orders (regardless of status) for the "customers served" counter.
    // This catches manual orders that go straight to "received"/"in production" and never
    // enter the actionable import path.
    //
    // We check two sources to determine if an order is "new":
    //  1. The DB (orders table) — catches actionable orders we've imported
    //  2. A separate "counted IDs" set in SystemConfig — catches non-actionable orders
    //     that were counted but never imported to the DB
    let allNewOrderCount = 0
    let countedOrderIds = new Set()
    const allArteloIds = new Set(allOrders.map(o => o.orderId))

    if (allOrders.length > 0) {
      const uniqueParentOrderIds = [...new Set(allOrders.map(o => o.orderId))]

      // Check 1: Which orders already exist in the DB?
      const existingOrders = await prisma.order.findMany({
        where: { parentOrderNumber: { in: uniqueParentOrderIds } },
        select: { parentOrderNumber: true },
        distinct: ['parentOrderNumber']
      })
      const existingParentIds = new Set(existingOrders.map(o => o.parentOrderNumber))

      // Check 2: Which orders have we already counted (but may not be in DB)?
      countedOrderIds = await getCountedOrderIds(prisma)

      // An order is new only if it's NOT in the DB AND NOT already counted
      for (const order of allOrders) {
        if (!existingParentIds.has(order.orderId) && !countedOrderIds.has(order.orderId)) {
          const numItems = order.orderItems?.length || 1
          allNewOrderCount += numItems
          // Mark as counted so we don't recount on next import
          countedOrderIds.add(order.orderId)
        }
      }

      if (allNewOrderCount > 0) {
        log(`[processOrders] 📊 Found ${allNewOrderCount} total new order line items across all statuses (for customers served counter)`)
      }
    }

    // Separate actionable orders from completed ones
    const actionableOrders = allOrders.filter(order =>
      ACTIONABLE_STATUSES.includes(order.status)
    )
    const completedOrders = allOrders.filter(order =>
      !ACTIONABLE_STATUSES.includes(order.status)
    )

    results.total = actionableOrders.length
    log(`[processOrders] Found ${actionableOrders.length} actionable orders, ${completedOrders.length} completed/fulfilled`)

    // 2a. First, check completed orders to mark any as fulfilled in our DB
    for (const order of completedOrders) {
      try {
        // Find all line items for this parent order
        const existingItems = await prisma.order.findMany({
          where: { parentOrderNumber: order.orderId }
        })

        // Mark all line items as completed
        for (const existing of existingItems) {
          if (existing.status !== 'completed') {
            log(`[processOrders] Marking order ${existing.orderNumber} as completed (fulfilled in Artelo)`)
            await prisma.order.update({
              where: { id: existing.id },
              data: {
                status: 'completed',
                researchedAt: new Date()
              }
            })
            results.updated++
          }
        }
      } catch (error) {
        log(`[processOrders] Error updating completed order ${order.orderId}: ${error.message}`)
      }
    }

    // 2b. Mark any DB orders as completed if they no longer appear in Artelo at all
    // (Artelo stops returning orders once they're fully fulfilled and aged out of the 100-order window)
    // Safety guard: only check orders older than 3 days, since brand-new orders may not appear
    // in the 100-order window yet if there's a backlog of newer orders ahead of them.
    if (allOrders.length > 0) {
      const allArteloOrderIds = new Set(allOrders.map(o => o.orderId))
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      const pendingDbOrders = await prisma.order.findMany({
        where: {
          status: { notIn: ['completed'] },
          createdAt: { lt: threeDaysAgo }
        },
        select: { id: true, orderNumber: true, parentOrderNumber: true }
      })
      for (const dbOrder of pendingDbOrders) {
        if (!allArteloOrderIds.has(dbOrder.parentOrderNumber)) {
          log(`[processOrders] Order ${dbOrder.orderNumber} not in Artelo and >3 days old — marking completed`)
          await prisma.order.update({
            where: { id: dbOrder.id },
            data: { status: 'completed', researchedAt: new Date() }
          })
          results.updated++
        }
      }
    }

    // 2c. Process actionable orders (new or needing updates)
    for (const order of actionableOrders) {
      try {
        const orderSource = determineOrderSource(order)
        const isShopify = orderSource === 'shopify'

        // Determine number of line items
        const numItems = order.orderItems?.length || 1

        const isEtsy = orderSource === 'etsy'

        // Fetch Shopify data once for the entire order (if Shopify)
        let shopifyData = null
        if (isShopify) {
          shopifyData = await fetchShopifyOrderData(order.orderId)
        }

        // Fetch Etsy receipt data once for the entire order (if Etsy)
        let etsyReceipt = null
        if (isEtsy) {
          etsyReceipt = await fetchEtsyReceiptData(order.orderId)
        }

        // Process each line item separately
        for (let lineItemIndex = 0; lineItemIndex < numItems; lineItemIndex++) {
          const orderResult = {
            orderNumber: `${order.orderId}-${lineItemIndex}`,
            action: null,
            raceName: null,
            runnerName: null,
            researchStatus: null
          }

          try {
            // Check if this line item exists
            const existing = await prisma.order.findUnique({
              where: {
                parentOrderNumber_lineItemIndex: {
                  parentOrderNumber: order.orderId,
                  lineItemIndex: lineItemIndex
                }
              }
            })

            // Get line item data from Artelo
            const arteloItem = order.orderItems?.[lineItemIndex]
            const rawSize = arteloItem?.product?.size || 'Unknown'
            const productSize = rawSize.startsWith('x') ? rawSize.slice(1) : rawSize
            const frameType = arteloItem?.product?.frameColor || 'Unknown'

            // If order exists, check for updates
            if (existing) {
              let needsUpdate = false
              const updateData = {}

              // Check if order has been fulfilled (status changed from actionable to non-actionable)
              const wasActionable = existing.status !== 'completed'
              const isNowFulfilled = !ACTIONABLE_STATUSES.includes(order.status)

              if (wasActionable && isNowFulfilled) {
                updateData.status = 'completed'
                updateData.researchedAt = new Date()
                needsUpdate = true
                log(`[processOrders] Marking order ${existing.orderNumber} as completed (fulfilled in Artelo)`)
              }

              // If missing Shopify data, fetch and update
              if (isShopify && !existing.shopifyOrderData && shopifyData) {
                log(`[processOrders] Updating order ${existing.orderNumber} with Shopify data...`)

                // Extract customer email and name
                updateData.customerEmail = shopifyData.shopifyOrderData?.email ||
                                           shopifyData.shopifyOrderData?.customer?.email || existing.customerEmail
                updateData.customerName = shopifyData.shopifyOrderData?.customer?.first_name || existing.customerName

                // Extract personalization for this specific line item
                const lineItem = shopifyData.shopifyOrderData?.line_items?.[lineItemIndex]
                if (lineItem) {
                  const extracted = extractShopifyPersonalization(lineItem)

                  updateData.raceName = extracted.raceName || existing.raceName
                  updateData.runnerName = extracted.runnerName || existing.runnerName
                  updateData.raceYear = extracted.raceYear || existing.raceYear
                  updateData.hadNoTime = extracted.hadNoTime || false
                  updateData.shopifyOrderData = shopifyData.shopifyOrderData
                  updateData.notes = shopifyData.notes || existing.notes

                  // Classify and extract custom order fields
                  // Check product title for custom order detection, not the extracted raceName
                  if (isCustomOrder(extracted.productTitle)) {
                    updateData.trackstarOrderType = 'custom'
                    updateData.bibNumberCustomer = extracted.bibNumberCustomer
                    updateData.timeCustomer = extracted.timeCustomer
                    updateData.creativeDirection = extracted.creativeDirection
                    updateData.isGift = extracted.isGift

                    // Compute due date from Shopify order created_at + 14 days
                    const orderCreatedAt = shopifyData.shopifyOrderData?.created_at
                    if (orderCreatedAt && !existing.dueDate) {
                      updateData.dueDate = new Date(new Date(orderCreatedAt).getTime() + 14 * 24 * 60 * 60 * 1000)
                    }
                  }

                  if (extracted.needsAttention && existing.status === 'pending' && !isCustomOrder(extracted.productTitle)) {
                    updateData.status = 'missing_year'
                    results.needsAttention++
                  }

                  needsUpdate = true
                  results.enriched++
                }
              }

              // If missing Etsy data, fetch and update
              if (isEtsy && !existing.etsyOrderData && etsyReceipt) {
                log(`[processOrders] Updating order ${existing.orderNumber} with Etsy data...`)

                // Extract customer email from receipt
                updateData.customerEmail = etsyReceipt.buyer_email || existing.customerEmail

                // Extract personalization for this specific line item
                const transaction = etsyReceipt.transactions?.[lineItemIndex]
                if (transaction) {
                  const extracted = extractEtsyPersonalization(transaction)

                  updateData.raceName = extracted.raceName || existing.raceName
                  updateData.runnerName = extracted.runnerName || existing.runnerName
                  updateData.raceYear = extracted.raceYear || existing.raceYear
                  updateData.etsyOrderData = etsyReceipt

                  // Classify custom orders (e.g. "Any Race - Custom Trackstar Print")
                  if (isCustomOrder(extracted.raceName)) {
                    updateData.trackstarOrderType = 'custom'
                  }

                  if (extracted.needsAttention && existing.status === 'pending' && !isCustomOrder(extracted.raceName)) {
                    updateData.status = 'missing_year'
                    results.needsAttention++
                  }

                  needsUpdate = true
                  results.enriched++
                }
              }

              if (needsUpdate) {
                await prisma.order.update({
                  where: { id: existing.id },
                  data: updateData
                })

                results.updated++
                orderResult.action = 'updated'
                orderResult.raceName = updateData.raceName || existing.raceName
                orderResult.runnerName = updateData.runnerName || existing.runnerName
              } else {
                results.skipped++
                orderResult.action = 'skipped'
                orderResult.raceName = existing.raceName
                orderResult.runnerName = existing.runnerName
              }
            } else {
              // Create new order for this line item
              let raceName = 'Unknown Race'
              let raceYear = new Date().getFullYear()
              let runnerName = order.customerAddress?.name || 'Unknown Runner'
              let status = 'pending'
              let lineItemShopifyData = null
              let lineItemEtsyData = null
              let notes = null
              let hadNoTime = false
              // Custom order fields
              let trackstarOrderType = 'standard'
              let bibNumberCustomer = null
              let timeCustomer = null
              let creativeDirection = null
              let isGiftOrder = false
              let customerEmail = null
              let customerName = null
              let dueDate = null

              if (isShopify && shopifyData) {
                log(`[processOrders] Processing Shopify line item ${lineItemIndex} for order ${order.orderId}...`)

                // Extract customer email and name from Shopify order data
                customerEmail = shopifyData.shopifyOrderData?.email ||
                                shopifyData.shopifyOrderData?.customer?.email || null
                customerName = shopifyData.shopifyOrderData?.customer?.first_name || null

                // Extract personalization for this specific line item
                const lineItem = shopifyData.shopifyOrderData?.line_items?.[lineItemIndex]
                if (lineItem) {
                  const extracted = extractShopifyPersonalization(lineItem)

                  raceName = extracted.raceName || raceName
                  runnerName = extracted.runnerName || runnerName
                  raceYear = extracted.raceYear || raceYear
                  hadNoTime = extracted.hadNoTime || false
                  lineItemShopifyData = shopifyData.shopifyOrderData
                  notes = shopifyData.notes

                  // Custom order classification — check product title, not extracted raceName
                  // (for custom orders, raceName is the customer-provided race, e.g. "Jfk 50",
                  //  but the product title is "Custom Trackstar Print (Any Race)")
                  if (isCustomOrder(extracted.productTitle)) {
                    trackstarOrderType = 'custom'
                    bibNumberCustomer = extracted.bibNumberCustomer
                    timeCustomer = extracted.timeCustomer
                    creativeDirection = extracted.creativeDirection
                    isGiftOrder = extracted.isGift

                    // Compute due date: order created_at + 14 days
                    const orderCreatedAt = shopifyData.shopifyOrderData?.created_at
                    if (orderCreatedAt) {
                      dueDate = new Date(new Date(orderCreatedAt).getTime() + 14 * 24 * 60 * 60 * 1000)
                    }

                    log(`[processOrders] 🎨 Custom order detected: ${order.orderId}-${lineItemIndex}`)
                  }

                  if (extracted.needsAttention && trackstarOrderType !== 'custom') {
                    status = 'missing_year'
                    results.needsAttention++
                  }
                  results.enriched++
                }
              }

              // Etsy enrichment
              if (isEtsy && etsyReceipt) {
                log(`[processOrders] Processing Etsy line item ${lineItemIndex} for order ${order.orderId}...`)

                // Extract customer email from receipt
                customerEmail = etsyReceipt.buyer_email || null

                // Extract personalization for this specific line item
                const transaction = etsyReceipt.transactions?.[lineItemIndex]
                if (transaction) {
                  const extracted = extractEtsyPersonalization(transaction)

                  raceName = extracted.raceName || raceName
                  runnerName = extracted.runnerName || runnerName
                  raceYear = extracted.raceYear || raceYear
                  lineItemEtsyData = etsyReceipt

                  // Classify custom orders (e.g. "Any Race - Custom Trackstar Print")
                  if (isCustomOrder(extracted.raceName)) {
                    trackstarOrderType = 'custom'
                    log(`[processOrders] 🎨 Custom Etsy order detected: ${order.orderId}-${lineItemIndex}`)
                  }

                  if (extracted.needsAttention && trackstarOrderType !== 'custom') {
                    status = 'missing_year'
                    results.needsAttention++
                  }
                  results.enriched++
                }
              }

              await prisma.order.create({
                data: {
                  orderNumber: `${order.orderId}-${lineItemIndex}`,
                  parentOrderNumber: order.orderId,
                  lineItemIndex: lineItemIndex,
                  source: orderSource,
                  arteloOrderData: order,
                  shopifyOrderData: lineItemShopifyData,
                  etsyOrderData: lineItemEtsyData,
                  raceName,
                  raceYear,
                  runnerName,
                  hadNoTime,
                  productSize,
                  frameType,
                  notes,
                  status,
                  // Custom order fields
                  trackstarOrderType,
                  designStatus: trackstarOrderType === 'custom' ? 'not_started' : 'not_started',
                  dueDate,
                  customerEmail,
                  customerName,
                  bibNumberCustomer,
                  timeCustomer,
                  creativeDirection,
                  isGift: isGiftOrder
                }
              })

              results.imported++
              orderResult.action = 'imported'
              orderResult.raceName = raceName
              orderResult.runnerName = runnerName

              log(`[processOrders] ✅ Imported: ${order.orderId}-${lineItemIndex} (${orderSource}${trackstarOrderType === 'custom' ? ', CUSTOM' : ''}) - ${raceName} - ${runnerName}`)
            }

            // 3. Run research if enabled and we have a scraper for this race
            //    Skip research for custom orders (no race to scrape)
            if (runResearch && orderResult.action !== 'skipped') {
              const dbOrder = await prisma.order.findUnique({
                where: {
                  parentOrderNumber_lineItemIndex: {
                    parentOrderNumber: order.orderId,
                    lineItemIndex: lineItemIndex
                  }
                }
              })

              if (dbOrder && dbOrder.trackstarOrderType !== 'custom' && hasScraperForRace(dbOrder.raceName)) {
                log(`[processOrders] Running research for ${dbOrder.orderNumber}...`)
                try {
                  const research = await researchService.researchOrder(dbOrder.orderNumber)
                  if (research.runnerResearch.researchStatus === 'found') {
                    results.researched++
                    orderResult.researchStatus = 'found'
                    log(`[processOrders] ✅ Research found: ${research.runnerResearch.bibNumber}`)
                  } else {
                    orderResult.researchStatus = research.runnerResearch.researchStatus
                  }
                } catch (researchError) {
                  results.researchFailed++
                  orderResult.researchStatus = 'error'
                  log(`[processOrders] ❌ Research failed: ${researchError.message}`)
                }
              }
            }

            results.orders.push(orderResult)

          } catch (lineItemError) {
            results.errors.push({
              orderNumber: `${order.orderId}-${lineItemIndex}`,
              error: lineItemError.message
            })
            log(`[processOrders] ❌ Error processing line item ${order.orderId}-${lineItemIndex}: ${lineItemError.message}`)
          }
        }

      } catch (orderError) {
        results.errors.push({
          orderNumber: order.orderId,
          error: orderError.message
        })
        log(`[processOrders] ❌ Error processing ${order.orderId}: ${orderError.message}`)
      }
    }

    // 4. Update "customers served" counter for ALL new Artelo orders (any status)
    //    This uses allNewOrderCount (computed before the actionable/completed split)
    //    so manual orders that skip the actionable path still get counted.
    //    Also persists the "counted IDs" set to prevent double-counting on next run.
    if (allNewOrderCount > 0) {
      try {
        const newCount = await incrementCustomersServed(prisma, allNewOrderCount)
        log(`[processOrders] 📊 Customers served: ${newCount.toLocaleString('en-US')} (+${allNewOrderCount} from all new orders)`)

        // Save counted IDs (pruned to current Artelo window) to prevent double-counting
        await saveCountedOrderIds(prisma, countedOrderIds, allArteloIds)

        // Push updated count to Shopify metaobject
        const synced = await syncCustomersServedToShopify(prisma)
        if (synced) {
          log('[processOrders] ✅ Shopify metaobject updated')
        }
      } catch (counterError) {
        // Don't fail the import if counter update fails
        console.error('[processOrders] ⚠️ Counter update failed (non-fatal):', counterError.message)
      }
    } else if (allArteloIds.size > 0 && countedOrderIds.size > 0) {
      // Even if no new orders, prune the counted IDs set on each run
      try {
        await saveCountedOrderIds(prisma, countedOrderIds, allArteloIds)
      } catch (err) {
        // Non-fatal
      }
    }

    // 5. Summary
    log('\n[processOrders] === SUMMARY ===')
    log(`  Total orders: ${results.total}`)
    log(`  Imported: ${results.imported}`)
    log(`  Updated: ${results.updated}`)
    log(`  Skipped: ${results.skipped}`)
    log(`  Enriched with Shopify: ${results.enriched}`)
    log(`  Needs attention: ${results.needsAttention}`)
    if (runResearch) {
      log(`  Researched: ${results.researched}`)
      log(`  Research failed: ${results.researchFailed}`)
    }
    if (results.errors.length > 0) {
      log(`  Errors: ${results.errors.length}`)
    }

    return results

  } catch (error) {
    results.success = false
    results.errors.push({ error: error.message })
    console.error('[processOrders] Fatal error:', error)
    throw error
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect()
    }
    // Also disconnect research service if we used it
    if (runResearch) {
      await researchService.disconnect()
    }
  }
}

export default processOrders
