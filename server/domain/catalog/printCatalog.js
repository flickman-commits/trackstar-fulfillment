/**
 * The store's race prints, the one list every picker reads: Tools > Samples,
 * a creator's Send a sample, and the creator application ("Which product do
 * you want?"). Live from Shopify, cached for ten minutes per instance so a
 * page load is not a full catalog read.
 *
 * Each print: { productId, title, label, race, edition, image, variants:
 * [{ variantId, size, frame, price }] }. label is the short name shown in
 * the picker ("Berlin World Major Race Poster"); edition is "World Majors"
 * for those prints, else null.
 */
import { fetchVariantCatalog } from '../../services/shopifyProducts.js'
import { parseRaceNameFromTitle } from '../../scrapers/raceNameNormalization.js'
import { getCanonicalRaceName } from '../../scrapers/index.js'

const TTL = 10 * 60 * 1000
let cache = null

export const shortTitle = t => String(t || '').replace(/\s*Personalized Race Print\s*$/i, '').replace(/^Personalized\s+/i, '').trim()

export async function printCatalog({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < TTL) return cache.products
  const rows = await fetchVariantCatalog()
  const byProduct = new Map()
  for (const r of rows) {
    if (r.productStatus !== 'ACTIVE' || r.isCustom || /gift card/i.test(r.productTitle) || !r.size) continue
    if (!byProduct.has(r.productId)) {
      const parsed = parseRaceNameFromTitle(r.productTitle) || shortTitle(r.productTitle)
      byProduct.set(r.productId, {
        productId: r.productId, title: r.productTitle, label: shortTitle(r.productTitle),
        race: getCanonicalRaceName(parsed) || parsed,
        edition: /world\s*major/i.test(r.productTitle) ? 'World Majors' : null,
        image: r.imageUrl, variants: [],
      })
    }
    byProduct.get(r.productId).variants.push({ variantId: r.variantId, size: r.size, frame: r.frame, price: Number(r.price) })
  }
  const products = [...byProduct.values()].sort((a, b) => a.label.localeCompare(b.label))
  cache = { at: Date.now(), products }
  return products
}

/** What a public page may see: names, pictures, sizes and frames. No ids or prices. */
export async function publicPrintCatalog() {
  return (await printCatalog()).map(p => ({
    title: p.title, label: p.label, race: p.race, edition: p.edition, image: p.image,
    sizes: [...new Set(p.variants.map(v => v.size))], frames: [...new Set(p.variants.map(v => v.frame).filter(Boolean))],
  }))
}
