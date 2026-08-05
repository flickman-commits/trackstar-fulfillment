/**
 * shopifyProducts.js - Catalog reads and bulk variant writes for the /products
 * bulk editor.
 *
 * Needs the `write_products` scope for anything that mutates. Reads work with
 * `read_products` alone, which is deliberate: the editor can load, filter and
 * preview a change on a store that has never granted write access.
 */

import { getShopifyToken } from './shopifyAuth.js'
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js'

const API_VERSION = '2024-10'

async function shopifyGraphql(query, variables) {
  const store = process.env.SHOPIFY_STORE
  if (!store) throw new Error('Missing SHOPIFY_STORE')
  const token = await getShopifyToken()

  const res = await fetchWithTimeout(
    `https://${store}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    },
    20000
  )

  if (!res.ok) {
    throw new Error(`Shopify GraphQL HTTP ${res.status}: ${await res.text()}`)
  }
  const json = await res.json()
  if (json.errors?.length) {
    // A missing write scope surfaces here rather than as an HTTP error.
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`)
  }
  return json.data
}

const CATALOG_QUERY = `
  query Catalog($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        status
        tags
        featuredImage { url }
        variants(first: 100) {
          nodes {
            id
            sku
            price
            selectedOptions { name value }
          }
        }
      }
    }
  }
`

/**
 * Every variant in the store, flattened into rows the editor can filter.
 *
 * Size and Frame are real Shopify product options here, so they are read off
 * selectedOptions rather than parsed out of the SKU. The SKU encodes them too
 * (e.g. "mesa-s1p-8x10-bl-oak-am") but as display-adjacent text it drifts —
 * one product uses a bare "chi" for every variant.
 */
export async function fetchVariantCatalog() {
  const rows = []
  let cursor = null

  while (true) {
    const data = await shopifyGraphql(CATALOG_QUERY, { cursor })
    for (const product of data.products.nodes) {
      const isCustom = product.tags.some(t => t.toLowerCase() === 'custom')
      for (const variant of product.variants.nodes) {
        const opt = name => variant.selectedOptions.find(o => o.name === name)?.value || null
        rows.push({
          variantId: variant.id,
          productId: product.id,
          productTitle: product.title,
          productHandle: product.handle,
          productStatus: product.status,
          imageUrl: product.featuredImage?.url || null,
          tags: product.tags,
          isCustom,
          sku: variant.sku || null,
          price: variant.price,
          size: opt('Size'),
          frame: opt('Frame'),
        })
      }
    }
    if (!data.products.pageInfo.hasNextPage) break
    cursor = data.products.pageInfo.endCursor
  }

  return rows
}

const BULK_UPDATE = `
  mutation BulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id price }
      userErrors { field message }
    }
  }
`

/**
 * Apply new prices to specific variants.
 *
 * `updates` is [{ variantId, productId, price }]. Shopify's bulk mutation is
 * scoped to one product, so updates are grouped by product and sent as one
 * call each. Products are processed sequentially — the catalog is small (58
 * products for a full 8x10 sweep) and serial calls stay well inside the API
 * rate limit without needing backoff.
 *
 * Returns { updated, failures } rather than throwing on a partial failure, so
 * the caller can still record the variants that did land. A batch that only
 * half-applied still needs its successful half to be undoable.
 */
export async function applyVariantPrices(updates) {
  const byProduct = new Map()
  for (const u of updates) {
    if (!byProduct.has(u.productId)) byProduct.set(u.productId, [])
    byProduct.get(u.productId).push(u)
  }

  const updated = []
  const failures = []

  for (const [productId, group] of byProduct) {
    try {
      const data = await shopifyGraphql(BULK_UPDATE, {
        productId,
        variants: group.map(u => ({ id: u.variantId, price: String(u.price) })),
      })
      const result = data.productVariantsBulkUpdate
      if (result.userErrors?.length) {
        failures.push({ productId, message: result.userErrors.map(e => e.message).join('; ') })
        continue
      }
      const priceById = new Map(result.productVariants.map(v => [v.id, v.price]))
      for (const u of group) {
        if (priceById.has(u.variantId)) {
          updated.push({ ...u, price: priceById.get(u.variantId) })
        } else {
          failures.push({ productId, message: `Variant ${u.variantId} missing from response` })
        }
      }
    } catch (error) {
      failures.push({ productId, message: error.message })
    }
  }

  return { updated, failures }
}
