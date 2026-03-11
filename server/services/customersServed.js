/**
 * customersServed.js - Track and sync "customers served" count
 *
 * Stores a counter in SystemConfig DB table, increments when new orders
 * are imported, and pushes the formatted count to a Shopify metaobject
 * (type: business_stats, field: total_customers_served) via GraphQL Admin API.
 *
 * The count is stored as a raw integer in the DB and formatted with
 * commas (e.g., "1,333") when synced to Shopify for display.
 */

import { getShopifyToken } from './shopifyAuth.js'

const SYSTEM_CONFIG_KEY = 'customers_served_count'
const INITIAL_COUNT = 1333

/**
 * Format a number with commas (e.g., 1333 → "1,333")
 */
function formatWithCommas(num) {
  return num.toLocaleString('en-US')
}

/**
 * Make a GraphQL request to Shopify Admin API
 * (Metaobjects are only available via GraphQL, not REST)
 */
async function shopifyGraphQL(query, variables = {}) {
  const token = await getShopifyToken()
  const store = process.env.SHOPIFY_STORE

  const response = await fetch(`https://${store}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token
    },
    body: JSON.stringify({ query, variables })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Shopify GraphQL error (${response.status}): ${errorText}`)
  }

  const result = await response.json()

  if (result.errors?.length > 0) {
    throw new Error(`Shopify GraphQL error: ${result.errors.map(e => e.message).join(', ')}`)
  }

  return result.data
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
 * Push the current customers served count to the Shopify metaobject.
 *
 * Uses GraphQL Admin API:
 * 1. Query metaobjects of type "business_stats" to find the entry GID
 * 2. Discover the field key for "total customers served"
 * 3. Mutate to update that field with the formatted count
 */
export async function syncCustomersServedToShopify(prisma) {
  try {
    const count = await getCustomersServedCount(prisma)
    const formattedCount = formatWithCommas(count)

    // Step 1: Find the business_stats metaobject entry
    const queryResult = await shopifyGraphQL(`
      {
        metaobjects(type: "business_stats", first: 1) {
          edges {
            node {
              id
              fields {
                key
                value
              }
            }
          }
        }
      }
    `)

    const edges = queryResult.metaobjects?.edges || []
    if (edges.length === 0) {
      console.error('[customersServed] No business_stats metaobject entries found in Shopify')
      return false
    }

    const entry = edges[0].node
    const metaobjectGid = entry.id

    // Step 2: Discover the field key (find whichever field has "customer" in the key)
    let fieldKey = 'total_customers_served'
    if (entry.fields && Array.isArray(entry.fields)) {
      const matchingField = entry.fields.find(f =>
        f.key === 'total_customers_served' ||
        f.key === 'total customers served' ||
        f.key?.toLowerCase().includes('customer')
      )
      if (matchingField) {
        fieldKey = matchingField.key
      }
    }

    console.log(`[customersServed] Found metaobject ${metaobjectGid}, field key: "${fieldKey}", updating to: ${formattedCount}`)

    // Step 3: Update the metaobject
    const mutationResult = await shopifyGraphQL(`
      mutation metaobjectUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
        metaobjectUpdate(id: $id, metaobject: $metaobject) {
          metaobject {
            id
            fields {
              key
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      id: metaobjectGid,
      metaobject: {
        fields: [
          {
            key: fieldKey,
            value: formattedCount
          }
        ]
      }
    })

    const userErrors = mutationResult.metaobjectUpdate?.userErrors || []
    if (userErrors.length > 0) {
      console.error('[customersServed] Shopify mutation errors:', userErrors)
      return false
    }

    console.log(`[customersServed] ✅ Synced to Shopify metaobject: ${formattedCount}`)
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
