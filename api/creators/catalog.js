/**
 * GET /api/creators/catalog - the races we sell, read live from Shopify, for
 * picking a creator's sample. One entry per race and edition:
 * { race, edition, label, title, image }.
 */
import { setCors } from '../_lib/auth.js'
import { requireCapability } from '../_lib/users.js'
import { fetchProductCatalog } from '../../server/services/shopifyProducts.js'
import { parseRaceNameFromTitle } from '../../server/scrapers/raceNameNormalization.js'
import { getCanonicalRaceName } from '../../server/scrapers/index.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, OPTIONS' })) return
  const user = await requireCapability(req, res, 'creators')
  if (!user) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const products = await fetchProductCatalog()
    // One entry per race and edition: "Berlin Marathon" and "Berlin Marathon
    // (World Majors)" are different prints, so they are listed apart.
    const byKey = new Map()
    for (const p of products) {
      if (p.status && p.status !== 'ACTIVE') continue
      if (/gift card/i.test(p.title)) continue
      const parsed = parseRaceNameFromTitle(p.title) || p.title
      const race = getCanonicalRaceName(parsed) || parsed
      const edition = /world\s*major/i.test(p.title) ? 'World Majors' : null
      const key = `${race}|${edition || ''}`
      if (!byKey.has(key)) byKey.set(key, { race, edition, label: edition ? `${race} (${edition})` : race, title: p.title, image: p.featuredImage })
    }
    const races = [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label))
    return res.status(200).json({ races })
  } catch (error) {
    console.error('[API /creators/catalog]', error)
    return res.status(500).json({ error: 'Could not read the Shopify catalog' })
  }
}
