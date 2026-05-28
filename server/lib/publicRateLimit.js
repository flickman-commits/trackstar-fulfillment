/**
 * In-memory rate limiting + result caching for the public results-lookup endpoint.
 *
 * NOTE: State lives in a single serverless instance's memory, so limits/cache are
 * per-instance and reset on cold starts. That's an acceptable tradeoff for the
 * initial gated launch — it still stops the obvious abuse (one client hammering
 * one instance). The two functions below are the only touch points, so swapping
 * to a shared DB-backed store later is an isolated change.
 */

const RATE_LIMIT_MAX = 10 // lookups allowed per window, per IP
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour — same name+race+year is stable

// ip -> array of request timestamps (ms) within the current window
const requestLog = new Map()
// cacheKey -> { value, expiresAt }
const cache = new Map()

// Bound memory: drop the oldest entries if either map grows unexpectedly large
// (e.g. a distributed scrape rotating IPs). Cheap insurance, not a real LRU.
const MAX_ENTRIES = 10000

function pruneIfNeeded(map) {
  if (map.size <= MAX_ENTRIES) return
  const overflow = map.size - MAX_ENTRIES
  let i = 0
  for (const key of map.keys()) {
    map.delete(key)
    if (++i >= overflow) break
  }
}

/**
 * Record a request from an IP and report whether it's allowed.
 * @param {string} ip
 * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
 */
export function checkRateLimit(ip) {
  const now = Date.now()
  const cutoff = now - RATE_LIMIT_WINDOW_MS

  const timestamps = (requestLog.get(ip) || []).filter(t => t > cutoff)

  if (timestamps.length >= RATE_LIMIT_MAX) {
    const oldest = timestamps[0]
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, oldest + RATE_LIMIT_WINDOW_MS - now),
    }
  }

  timestamps.push(now)
  requestLog.set(ip, timestamps)
  pruneIfNeeded(requestLog)

  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX - timestamps.length,
    retryAfterMs: 0,
  }
}

/**
 * Build a stable cache key from lookup params (case/space-insensitive).
 */
export function buildCacheKey({ race, year, name }) {
  const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
  return `${norm(race)}::${norm(year)}::${norm(name)}`
}

/**
 * Read a cached lookup result, or null if missing/expired.
 */
export function getCached(key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    cache.delete(key)
    return null
  }
  return entry.value
}

/**
 * Store a lookup result under a cache key.
 */
export function setCached(key, value) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  pruneIfNeeded(cache)
}

export const RATE_LIMIT = { max: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS }
