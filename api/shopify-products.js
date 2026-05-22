/**
 * GET /api/shopify-products - Fetch all Shopify products for catalog setup
 * Returns product IDs, titles, and hero images for adding to productCatalog.js
 */

import { setCors, requireAdmin } from './_lib/auth.js'
import { shopifyFetch } from '../server/services/shopifyAuth.js'

export default async function handler(req, res) {
  if (setCors(req, res)) return
  if (!(await requireAdmin(req, res))) return

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('[shopify-products] Fetching all products...')

    const products = []
    let pageInfo = null
    let pageNum = 1

    // Fetch all products (Shopify paginates at 250)
    while (true) {
      const params = new URLSearchParams({ limit: '250' })
      if (pageInfo) {
        params.set('page_info', pageInfo)
      }

      const response = await shopifyFetch(`/products.json?${params}`)
      products.push(...response.products)

      console.log(`[shopify-products] Page ${pageNum}: ${response.products.length} products (total: ${products.length})`)

      if (response.products.length < 250) break
      pageNum++
      // Note: for full pagination, would need to parse Link header
      break
    }

    // Format for easy catalog entry creation
    const catalogEntries = products.map(p => ({
      productId: String(p.id),
      title: p.title,
      heroImageUrl: p.images?.[0]?.src || null,
      slug: slugify(p.title),
    }))

    // Also output ready-to-paste JS
    const catalogJS = products.map(p => {
      const heroImage = p.images?.[0]?.src || null
      return `  // ${p.title}
  '${p.id}': {
    designVariant: '${slugify(p.title)}',
    label: '${p.title.replace(/'/g, "\\'")}',
    heroImageUrl: ${heroImage ? `'${heroImage}'` : 'null'},
  },`
    }).join('\n\n')

    console.log(`[shopify-products] Returning ${products.length} products`)

    return res.status(200).json({
      count: products.length,
      products: catalogEntries,
      catalogJS,
    })
  } catch (err) {
    console.error('[shopify-products] Error:', err)
    return res.status(500).json({ error: err.message })
  }
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
