/**
 * customersServed.js - Track and sync "customers served" count
 *
 * Stores a counter in SystemConfig DB table, increments when new orders
 * are imported, and pushes the formatted count to a Shopify shop-level
 * metafield (namespace: trackstar, key: customers_served) via REST Admin API.
 *
 * The count is stored as a raw integer in the DB and formatted with
 * commas (e.g., "1,333") when synced to Shopify for display.
 *
 * Theme reference: {{ shop.metafields.trackstar.customers_served.value }}
 */

import { shopifyFetch } from './shopifyAuth.js'

const SYSTEM_CONFIG_KEY = 'customers_served_count'
const SHOPIFY_METAFIELD_NAMESPACE = 'trackstar'
const SHOPIFY_METAFIELD_KEY = 'customers_served'
const INITIAL_COUNT = 1333

/**
 * Format a number with commas (e.g., 1333 → "1,333")
 */
function formatWithCommas(num) {
  return num.toLocaleString('en-US')
}

/**
 * Get the current customers served count from the database.
 * If no entry exists, seeds it with the initial count.
 */
export async function getCustomersServedCount(prisma) {
  const config = await prisma.systemConfig.findUnique({
    where: { key: SYSTEM_CONFIG_KEY }
  })

  if (!config) {
    // Seed with initial count
    await prisma.systemConfig.create({
      data: {
        key: SYSTEM_CONFIG_KEY,
        value: String(INITIAL_COUNT)
      }
    })
    return INITIAL_COUNT
  }

  return parseInt(config.value, 10)
}

/**
 * Increment the customers served count by the given amount.
 * Returns the new count.
 */
export async function incrementCustomersServed(prisma, incrementBy) {
  if (incrementBy <= 0) return await getCustomersServedCount(prisma)

  const currentCount = await getCustomersServedCount(prisma)
  const newCount = currentCount + incrementBy

  await prisma.systemConfig.upsert({
    where: { key: SYSTEM_CONFIG_KEY },
    update: { value: String(newCount) },
    create: { key: SYSTEM_CONFIG_KEY, value: String(newCount) }
  })

  console.log(`[customersServed] Updated count: ${formatWithCommas(currentCount)} → ${formatWithCommas(newCount)} (+${incrementBy})`)
  return newCount
}

/**
 * Push the current customers served count to Shopify as a shop-level metafield.
 *
 * Uses POST /metafields.json which creates or updates (upsert behavior when
 * namespace+key already exists on the same owner).
 *
 * The metafield is accessible in Liquid as:
 *   {{ shop.metafields.trackstar.customers_served.value }}
 */
export async function syncCustomersServedToShopify(prisma) {
  try {
    const count = await getCustomersServedCount(prisma)
    const formattedCount = formatWithCommas(count)

    // Upsert the shop-level metafield
    const result = await shopifyFetch('/metafields.json', {
      method: 'POST',
      body: JSON.stringify({
        metafield: {
          namespace: SHOPIFY_METAFIELD_NAMESPACE,
          key: SHOPIFY_METAFIELD_KEY,
          value: formattedCount,
          type: 'single_line_text_field'
        }
      })
    })

    console.log(`[customersServed] ✅ Synced to Shopify metafield: ${formattedCount} (id: ${result.metafield?.id})`)
    return true
  } catch (error) {
    // Don't let Shopify sync failure break the import flow
    console.error('[customersServed] ❌ Failed to sync to Shopify:', error.message)
    return false
  }
}

/**
 * Get the current count and formatted value (for API responses)
 */
export async function getCustomersServedInfo(prisma) {
  const count = await getCustomersServedCount(prisma)
  return {
    count,
    formatted: formatWithCommas(count)
  }
}

/**
 * Manually set the count (for corrections/verification)
 */
export async function setCustomersServedCount(prisma, newCount) {
  await prisma.systemConfig.upsert({
    where: { key: SYSTEM_CONFIG_KEY },
    update: { value: String(newCount) },
    create: { key: SYSTEM_CONFIG_KEY, value: String(newCount) }
  })

  console.log(`[customersServed] Manually set count to: ${formatWithCommas(newCount)}`)
  return newCount
}
