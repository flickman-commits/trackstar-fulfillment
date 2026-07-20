/**
 * In-memory rate limiting + result caching for the public results-lookup endpoint.
 *
 * NOTE: State lives in a single serverless instance's memory, so limits/cache are
 * per-instance and reset on cold starts. That's an acceptable tradeoff for the
 * initial gated launch — it still stops the obvious abuse (one client hammering
 * one instance). The two functions below are the only touch points, so swapping
 * to a shared DB-backed store later is an isolated change.
 */

const RATE_LIMIT_MAX = 20 // lookups allowed per window, per IP
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

// ---------------------------------------------------------------------------
// Durable rate limiting
// ---------------------------------------------------------------------------

/**
 * DB-backed rate limit. Use this for anything where the in-memory limiter above
 * is not good enough — i.e. where being bypassed actually costs us something
 * (writes, storage, spend) rather than just a wasted read.
 *
 * WHY THIS EXISTS
 *   Vercel runs each API route as a separate serverless instance, and instances
 *   come and go. A Map in one process is invisible to every other one, so an
 *   attacker who simply keeps issuing requests lands on fresh counters and the
 *   in-memory limit never trips. We learned this the hard way with the lookup
 *   ring buffer, which was silently empty for the same reason.
 *
 * Two queries per call (count, then insert). That's fine for upload-minting;
 * do not put it on a hot read path.
 *
 * FAILS CLOSED. If the DB is unreachable we deny rather than allow, because the
 * whole point is to protect a resource that costs us money to give away.
 *
 * @param {string} ip
 * @param {Object} [opts]
 * @param {string} [opts.bucket='default'] - namespace, so limits don't collide
 * @param {number} [opts.max]
 * @param {number} [opts.windowMs]
 * @returns {Promise<{ allowed: boolean, remaining: number, retryAfterMs: number }>}
 */
export async function checkRateLimitDurable(ip, { bucket = 'default', max = RATE_LIMIT_MAX, windowMs = RATE_LIMIT_WINDOW_MS } = {}) {
  const { default: prisma } = await import('../../api/_lib/prisma.js')
  const key = `${bucket}:${ip}`
  const now = Date.now()
  const since = new Date(now - windowMs)

  try {
    const used = await prisma.rateLimitHit.count({ where: { key, createdAt: { gte: since } } })

    if (used >= max) {
      // Oldest hit still inside the window determines when a slot frees up.
      const oldest = await prisma.rateLimitHit.findFirst({
        where: { key, createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      })
      const retryAfterMs = oldest
        ? Math.max(0, oldest.createdAt.getTime() + windowMs - now)
        : windowMs
      return { allowed: false, remaining: 0, retryAfterMs }
    }

    await prisma.rateLimitHit.create({ data: { key } })

    // Opportunistic sweep (~2% of allowed calls) so the table can't grow without
    // bound. Cheap, indexed, and avoids needing a dedicated cron for this.
    if (Math.random() < 0.02) {
      prisma.rateLimitHit
        .deleteMany({ where: { createdAt: { lt: new Date(now - windowMs * 2) } } })
        .catch(err => console.warn('[publicRateLimit] sweep failed:', err.message))
    }

    return { allowed: true, remaining: max - used - 1, retryAfterMs: 0 }
  } catch (err) {
    console.error('[publicRateLimit] durable check failed, denying:', err.message)
    return { allowed: false, remaining: 0, retryAfterMs: windowMs }
  }
}
