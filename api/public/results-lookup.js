/**
 * Public, unauthenticated results lookup for the Shopify storefront.
 *
 *   GET /api/public/results-lookup?race=boston&year=2024&name=John+Smith
 *
 * Lets a shopper verify their race result before buying. Read-only — never
 * writes to the DB. Gated behind PUBLIC_LOOKUP_ENABLED so it stays dark until
 * we explicitly turn it on. Rate-limited per IP and cached per name+race+year.
 *
 * Only races backed by HTTP scrapers (and in the optional PUBLIC_LOOKUP_RACES
 * rollout allowlist) are searched live. Everything else — unsupported race,
 * no match, or any error — returns fallbackRequired:true so the widget shows a
 * manual-entry form. No dead ends.
 *
 * Shares the search core (researchService.findRunner) with admin order
 * research, so both paths get the same matching + last-name fallback quality.
 */
import { setCors } from '../_lib/auth.js'
import { researchService } from '../../server/services/ResearchService.js'
import { isRacePublicSafe, getCanonicalRaceName } from '../../server/scrapers/index.js'
import { parseRaceNameFromTitle } from '../../server/scrapers/raceNameNormalization.js'
import {
  checkRateLimit,
  buildCacheKey,
  getCached,
  setCached,
} from '../../server/lib/publicRateLimit.js'
import {
  logLookup,
  recordLookup,
  maybeAlertLookupError,
} from '../../server/lib/lookupObservability.js'

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  if (fwd) return String(fwd).split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}

// Manual-entry fallback response — always a valid, dead-end-free path.
function fallback(extra = {}) {
  return { found: false, fallbackRequired: true, instant: false, ...extra }
}

// Per-race rollout gate. PUBLIC_LOOKUP_RACES = comma-separated allowlist.
// When set, only those races get instant lookup; everything else falls back to
// manual entry. When unset, all HTTP-safe races are allowed.
function isRaceAllowed(race) {
  const raw = (process.env.PUBLIC_LOOKUP_RACES || '').trim()
  if (!raw) return true

  const requested = getCanonicalRaceName(race)
  if (!requested) return false

  return raw
    .split(',')
    .map(r => getCanonicalRaceName(r.trim()))
    .filter(Boolean)
    .includes(requested)
}

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, OPTIONS', allowPublic: true })) return

  // Never cache lookup responses at the browser, CDN, or proxy layer. The
  // widget keeps its own UI state and the server has an in-process result
  // cache keyed by {race,year,name}; a separate HTTP-cached response could
  // otherwise serve a stale result when the shopper changes the year.
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')

  // Kill-switch: 404 until explicitly enabled so the endpoint stays invisible.
  if (process.env.PUBLIC_LOOKUP_ENABLED !== 'true') {
    return res.status(404).json({ error: 'Not found' })
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const startMs = Date.now()
  const ip = getClientIp(req)
  const race = String(req.query.race || '').trim()
  const name = String(req.query.name || '').trim()
  const yearRaw = String(req.query.year || '').trim()
  const year = parseInt(yearRaw, 10)

  // Observability shorthand — emit one structured `[LOOKUP]` log line + ring
  // buffer entry per request. Always call before returning.
  const observe = ({ outcome, status, cachedHit, raceForLog }) => {
    const ms = Date.now() - startMs
    const ent = { race: raceForLog || race, year, name, outcome, ms, status, ip, cached: !!cachedHit }
    logLookup(ent)
    recordLookup(ent)
  }

  if (!race || !name || !yearRaw) {
    observe({ outcome: 'bad_request', status: 400 })
    return res.status(400).json({ error: 'race, year, and name are required' })
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    observe({ outcome: 'bad_request', status: 400 })
    return res.status(400).json({ error: 'year must be a valid 4-digit year' })
  }
  if (name.length > 80 || race.length > 80) {
    observe({ outcome: 'bad_request', status: 400 })
    return res.status(400).json({ error: 'race and name must be under 80 characters' })
  }

  // The widget may send a raw product title/handle ("Personalized Vermont City
  // Marathon Poster") instead of a clean race name. Resolve it to the canonical
  // race so the scraper lookup matches. Idempotent on already-clean names.
  const resolvedRace = parseRaceNameFromTitle(race) || race
  // Canonical race name (e.g. "Personalized Boston Race Print" → "Boston
  // Marathon"). Used in logs so all observability rolls up by canonical name.
  const raceCanonical = getCanonicalRaceName(resolvedRace) || resolvedRace

  // Rate limit before doing any work.
  const limit = checkRateLimit(ip)
  if (!limit.allowed) {
    res.setHeader('Retry-After', Math.ceil(limit.retryAfterMs / 1000))
    observe({ outcome: 'rate_limited', status: 429, raceForLog: raceCanonical })
    return res.status(429).json({
      error: 'Too many lookups. Please try again later.',
      ...fallback(),
    })
  }

  // Races without an HTTP scraper / not in the rollout allowlist → manual fallback.
  if (!isRacePublicSafe(resolvedRace) || !isRaceAllowed(resolvedRace)) {
    observe({ outcome: 'off', status: 200, raceForLog: raceCanonical })
    return res.status(200).json(fallback({ reason: 'no_instant_lookup' }))
  }

  const cacheKey = buildCacheKey({ race: resolvedRace, year, name })
  const cached = getCached(cacheKey)
  if (cached) {
    observe({ outcome: 'cached', status: 200, cachedHit: true, raceForLog: raceCanonical })
    return res.status(200).json({ ...cached, cached: true })
  }

  try {
    const result = await researchService.findRunner(resolvedRace, year, name)

    let payload, outcome
    if (result.found) {
      outcome = 'found'
      payload = {
        found: true,
        instant: true,
        raceCanonical,
        result: {
          name,
          bib: result.bibNumber,
          time: result.officialTime,
          pace: result.officialPace,
          eventType: result.eventType,
        },
      }
    } else if (result.ambiguous || (result.possibleMatches && result.possibleMatches.length > 0)) {
      outcome = 'suggestions'
      payload = {
        found: false,
        instant: true,
        raceCanonical,
        fallbackRequired: true,
        // The candidate list was trimmed upstream — let the widget prompt the
        // shopper to refine their search rather than hiding matches silently.
        truncated: result.possibleMatchesTruncated === true,
        suggestions: (result.possibleMatches || []).map(m => ({
          name: m.name,
          bib: m.bib ?? null,
          time: m.time ?? null,
          pace: m.pace ?? null,
          eventType: m.eventType ?? null,
        })),
      }
    } else if (result.researchStatus === 'upstream_error') {
      // Scraper reached its retries and the timing site is still down. Surface
      // this as an alert (throttled) — same UX as not_found for the shopper,
      // but we want to KNOW about it.
      outcome = 'upstream_error'
      maybeAlertLookupError({
        race: raceCanonical, year,
        errorType: 'upstream_error',
        detail: result.researchNotes || null,
      }).catch(() => {})
      payload = fallback({ reason: 'upstream_error', instant: true, raceCanonical })
    } else {
      outcome = 'not_found'
      payload = fallback({ reason: 'not_found', instant: true, raceCanonical })
    }

    setCached(cacheKey, payload)
    observe({ outcome, status: 200, raceForLog: raceCanonical })
    return res.status(200).json(payload)
  } catch (error) {
    console.error('[public/results-lookup] lookup failed:', error.message)
    // Unhandled exception — alert (throttled).
    maybeAlertLookupError({
      race: raceCanonical, year,
      errorType: 'exception',
      detail: error.message,
    }).catch(() => {})
    observe({ outcome: 'upstream_error', status: 200, raceForLog: raceCanonical })
    return res.status(200).json(fallback({ reason: 'lookup_error' }))
  }
}
