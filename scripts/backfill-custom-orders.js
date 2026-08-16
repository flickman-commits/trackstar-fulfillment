/**
 * backfill-custom-orders.js
 *
 * One-time script to classify existing orders as "custom" or "standard"
 * and extract custom order fields from stored shopifyOrderData.
 *
 * Custom order detection is based on the Shopify PRODUCT TITLE
 * (e.g. "Custom Trackstar Print (Any Race)"), NOT the extracted raceName
 * (which for custom orders is the customer-provided race like "Jfk 50").
 *
 * Run with: node --experimental-modules scripts/backfill-custom-orders.js
 * Or:       npx tsx scripts/backfill-custom-orders.js
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Must match the constant in processOrders.js
const CUSTOM_ORDER_RACE_NAMES = ['Custom Trackstar Print (Any Race)']

function isCustomOrder(productTitle) {
  if (!productTitle) return false
  return CUSTOM_ORDER_RACE_NAMES.some(keyword =>
    productTitle.toLowerCase().trim() === keyword.toLowerCase()
  )
}

/**
 * Get the product title for a given order from its stored Shopify data
 */
function getProductTitle(shopifyData, lineItemIndex) {
  if (!shopifyData) return null
  const lineItem = shopifyData.line_items?.[lineItemIndex]
  return lineItem?.title || lineItem?.name || null
}

async function backfill() {
  console.log('[Backfill] Starting custom order backfill...\n')

  const allOrders = await prisma.order.findMany({
    select: {
      id: true,
      orderNumber: true,
      lineItemIndex: true,
      raceName: true,
      trackstarOrderType: true,
      shopifyOrderData: true,
      dueDate: true,
      customerEmail: true,
      customerName: true,
      bibNumberCustomer: true,
      timeCustomer: true,
      creativeDirection: true,
      isGift: true,
      createdAt: true
    }
  })

  console.log(`[Backfill] Found ${allOrders.length} total orders`)

  let customCount = 0
  let standardCount = 0
  let updatedCount = 0
  let emailsExtracted = 0
  let reclassified = 0

  for (const order of allOrders) {
    const shopifyData = order.shopifyOrderData
    const lineItemIndex = order.lineItemIndex || 0

    // Detect custom orders from the product title, NOT the raceName
    const productTitle = getProductTitle(shopifyData, lineItemIndex)
    const isCustom = isCustomOrder(productTitle)

    const updateData = {}
    let needsUpdate = false

    // Classify order type
    if (isCustom && order.trackstarOrderType !== 'custom') {
      updateData.trackstarOrderType = 'custom'
      needsUpdate = true
      customCount++
      reclassified++
      console.log(`  ⚠️  Reclassifying ${order.orderNumber} as CUSTOM (product: "${productTitle}", raceName: "${order.raceName}")`)
    } else if (!isCustom && order.trackstarOrderType !== 'standard') {
      updateData.trackstarOrderType = 'standard'
      needsUpdate = true
      standardCount++
      reclassified++
      console.log(`  ⚠️  Reclassifying ${order.orderNumber} as STANDARD (product: "${productTitle}", raceName: "${order.raceName}")`)
    } else if (isCustom) {
      customCount++
    } else {
      standardCount++
    }

    // Extract customer email and name from stored Shopify data (for ALL orders)
    if (shopifyData && !order.customerEmail) {
      const email = shopifyData.email || shopifyData.customer?.email
      if (email) {
        updateData.customerEmail = email
        emailsExtracted++
        needsUpdate = true
      }
    }
    if (shopifyData && !order.customerName) {
      const firstName = shopifyData.customer?.first_name
      if (firstName) {
        updateData.customerName = firstName
        needsUpdate = true
      }
    }

    // For custom orders, extract additional fields from Shopify line item properties
    if (isCustom && shopifyData) {
      const lineItem = shopifyData.line_items?.[lineItemIndex]

      if (lineItem && lineItem.properties && Array.isArray(lineItem.properties)) {
        for (const prop of lineItem.properties) {
          const name = (prop.name || '').trim()
          const value = (prop.value || '').trim()

          // Extract the actual race name from properties (for display)
          if ((name === 'Race Name' || name === 'race name' || name === 'race_name') && value) {
            // Update raceName to the customer-provided race name
            if (order.raceName === 'Custom Trackstar Print (Any Race)' || order.raceName === 'Unknown Race') {
              updateData.raceName = value
              needsUpdate = true
            }
          }
          if ((name === 'Bib #' || name === 'Bib #:') && value && !order.bibNumberCustomer) {
            updateData.bibNumberCustomer = value
            needsUpdate = true
          }
          if ((name === 'Time' || name === 'Time:') && value && !order.timeCustomer) {
            updateData.timeCustomer = value
            needsUpdate = true
          }
          if ((name === 'Creative Direction' || name === 'Creative Direction:') && value && !order.creativeDirection) {
            updateData.creativeDirection = value
            needsUpdate = true
          }
          if ((name === 'Gift' || name === 'Gift:') && value) {
            const isGift = value.toLowerCase() === 'yes' || value.toLowerCase() === 'true'
            if (isGift !== order.isGift) {
              updateData.isGift = isGift
              needsUpdate = true
            }
          }
        }
      }

      // Compute due date from Shopify order created_at + 14 days
      if (!order.dueDate) {
        const orderCreatedAt = shopifyData.created_at
        if (orderCreatedAt) {
          updateData.dueDate = new Date(new Date(orderCreatedAt).getTime() + 14 * 24 * 60 * 60 * 1000)
          needsUpdate = true
        }
      }
    }

    if (needsUpdate) {
      await prisma.order.update({
        where: { id: order.id },
        data: updateData
      })
      updatedCount++

      if (isCustom) {
        const displayRace = updateData.raceName || order.raceName
        console.log(`  🎨 Custom: ${order.orderNumber} - ${displayRace}`)
        if (updateData.bibNumberCustomer) console.log(`     Bib: ${updateData.bibNumberCustomer}`)
        if (updateData.timeCustomer) console.log(`     Time: ${updateData.timeCustomer}`)
        if (updateData.creativeDirection) console.log(`     Creative Direction: ${updateData.creativeDirection}`)
        if (updateData.dueDate) console.log(`     Due Date: ${updateData.dueDate.toISOString().split('T')[0]}`)
      }
    }
  }

  console.log('\n[Backfill] === SUMMARY ===')
  console.log(`  Total orders: ${allOrders.length}`)
  console.log(`  Custom orders: ${customCount}`)
  console.log(`  Standard orders: ${standardCount}`)
  console.log(`  Records updated: ${updatedCount}`)
  console.log(`  Reclassified: ${reclassified}`)
  console.log(`  Customer emails extracted: ${emailsExtracted}`)
  console.log('\n[Backfill] Done!')

  await prisma.$disconnect()
}

backfill().catch(err => {
  console.error('[Backfill] Fatal error:', err)
  process.exit(1)
})
