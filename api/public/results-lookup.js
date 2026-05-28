/**
 * Public, unauthenticated results lookup for the storefront.
 *
 * GET /api/public/results-lookup?race=boston&year=2024&name=John+Smith
 *
 * Lets a shopper verify their race result before buying. Read-only: it never
 * writes to the DB. Gated behind PUBLIC_LOOKUP_ENABLED so it stays dark until
 * we explicitly turn it on. Rate-limited per IP and cached per name+race+year.
 *
 * Only races backed by HTTP scrapers are searched live (see isRacePublicSafe).
 * Everything else — unsupported race, no match, or any error — returns
 * fallbackRequired:true so the widget shows a manual-entry form. No dead ends.
 */
import { setCors } from '../_lib/auth.js'
import {
  getScraperForRace,
  isRacePublicSafe,
  getCanonicalRaceName,
} from '../../server/scrapers/index.js'
import {
  checkRateLimit,
  buildCacheKey,
  getCached,
  setCached,
} from '../../server/lib/publicRateLimit.js'

/**
 * Per-race rollout gate. PUBLIC_LOOKUP_RACES is a comma-separated list of race
 * names/aliases. When set, only those races get instant lookup (everything else
 * → manual fallback), so we can enable one validated race at a time. When unset,
 * all HTTP-safe races are allowed.
 */
function isRaceAllowed(race) {
  const raw = (process.env.PUBLIC_LOOKUP_RACES || '').trim()
  if (!raw) return true // no allowlist configured → all public-safe races

  const requested = getCanonicalRaceName(race)
  if (!requested) return false

  const allowed = raw
    .split(',')
    .map(r => getCanonicalRaceName(r.trim()))
    .filter(Boolean)

  return allowed.includes(requested)
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  if (fwd) return String(fwd).split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}

// Manual-entry fallback response — always a valid, dead-end-free path.
function fallback(extra = {}) {
  return { found: false, fallbackRequired: true, instant: false, ...extra }
}

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, OPTIONS', allowPublic: true })) return

  // Kill-switch: 404 until explicitly enabled so the dark endpoint is invisible.
  if (process.env.PUBLIC_LOOKUP_ENABLED !== 'true') {
    return res.status(404).json({ error: 'Not found' })
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const race = String(req.query.race || '').trim()
  const name = String(req.query.name || '').trim()
  const yearRaw = String(req.query.year || '').trim()
  const year = parseInt(yearRaw, 10)

  if (!race || !name || !yearRaw) {
    return res.status(400).json({ error: 'race, year, and name are required' })
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ error: 'year must be a valid 4-digit year' })
  }
  if (name.length > 80 || race.length > 80) {
    return res.status(400).json({ error: 'race and name must be under 80 characters' })
  }

  // Rate limit before doing any work.
  const ip = getClientIp(req)
  const limit = checkRateLimit(ip)
  if (!limit.allowed) {
    res.setHeader('Retry-After', Math.ceil(limit.retryAfterMs / 1000))
    return res.status(429).json({
      error: 'Too many lookups. Please try again later.',
      ...fallback(),
    })
  }

  // Races without an HTTP scraper, or not yet in the rollout allowlist, go
  // straight to manual entry — never block checkout.
  if (!isRacePublicSafe(race) || !isRaceAllowed(race)) {
    return res.status(200).json(fallback({ reason: 'no_instant_lookup' }))
  }

  const cacheKey = buildCacheKey({ race, year, name })
  const cached = getCached(cacheKey)
  if (cached) {
    return res.status(200).json({ ...cached, cached: true })
  }

  try {
    const scraper = getScraperForRace(race, year)
    const result = await scraper.searchRunner(name)

    let payload
    if (result.found) {
      payload = {
        found: true,
        instant: true,
        result: {
          name,
          bib: result.bibNumber,
          time: result.officialTime,
          pace: result.officialPace,
          eventType: result.eventType,
        },
      }
    } else if (result.ambiguous || (result.possibleMatches && result.possibleMatches.length > 0)) {
      payload = {
        found: false,
        instant: true,
        fallbackRequired: true,
        suggestions: (result.possibleMatches || []).map(m => ({
          name: m.name,
          bib: m.bib ?? null,
          time: m.time ?? null,
          pace: m.pace ?? null,
          eventType: m.eventType ?? null,
        })),
      }
    } else {
      // Searched but no match — offer manual entry.
      payload = fallback({ reason: 'not_found', instant: true })
    }

    setCached(cacheKey, payload)
    return res.status(200).json(payload)
  } catch (error) {
    console.error('[public/results-lookup] lookup failed:', error.message)
    // Any scraper/network failure must not block the shopper — fall back to manual.
    return res.status(200).json(fallback({ reason: 'lookup_error' }))
  }
}
