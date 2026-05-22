#!/usr/bin/env node
/**
 * Fetch all Shopify products and output catalog entries
 * Run with: node scripts/fetch-shopify-products.js
 */

import dotenv from 'dotenv'
dotenv.config()

import { shopifyFetch } from '../server/services/shopifyAuth.js'

async function fetchAllProducts() {
  const products = []
  let pageInfo = null

  console.log('Fetching Shopify products...\n')

  while (true) {
    const params = new URLSearchParams({ limit: '250' })
    if (pageInfo) {
      params.set('page_info', pageInfo)
    }

    const response = await shopifyFetch(`/products.json?${params}`)
    products.push(...response.products)

    console.log(`Fetched ${products.length} products so far...`)

    // Check for pagination (Shopify uses Link header, but we'll just check if we got a full page)
    if (response.products.length < 250) break

    // For cursor-based pagination, we'd need to parse Link header
    // For now, assume we got all products if less than 250 returned
    break
  }

  console.log(`\nTotal: ${products.length} products\n`)
  console.log('='.repeat(80))
  console.log('CATALOG ENTRIES (copy to server/lib/productCatalog.js)')
  console.log('='.repeat(80))
  console.log('')

  for (const product of products) {
    const heroImage = product.images?.[0]?.src || null
    const productId = String(product.id)

    console.log(`  // ${product.title}`)
    console.log(`  '${productId}': {`)
    console.log(`    designVariant: '${slugify(product.title)}',`)
    console.log(`    label: '${product.title.replace(/'/g, "\\'")}',`)
    console.log(`    heroImageUrl: ${heroImage ? `'${heroImage}'` : 'null'},`)
    console.log(`  },`)
    console.log('')
  }
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

fetchAllProducts().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
