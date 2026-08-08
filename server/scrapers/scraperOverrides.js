/**
 * DB-backed event-id overrides, layered on top of the file configs.
 *
 * WHY A CACHE RATHER THAN AN AWAIT
 *   getScraperForRace/createScraper are synchronous and called from a dozen
 *   places (ResearchService, the public endpoint, the probe, test scripts).
 *   Making them async to fit a database read would ripple through all of it
 *   for no benefit. Instead overrides live in a module-level cache that a
 *   caller refreshes once, up front — cheap in serverless, where each function
 *   instance loads it once and reuses it across warm invocations.
 *
 *   The contract: call `await ensureOverridesLoaded()` before you build
 *   scrapers. Forget it and you get the file config, which is the old behaviour
 *   rather than a wrong one — a safe failure mode, deliberately.
 */
const TTL_MS = 60 * 1000

let cache = new Map() // `${race}::${year}` -> { eventIds, platform, verifiedAt }
let loadedAt = 0
let inFlight = null

/** Load overrides into the cache. Safe to call repeatedly. */
export async function ensureOverridesLoaded({ force = false } = {}) {
  if (!force && loadedAt && Date.now() - loadedAt < TTL_MS) return cache
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const { default: prisma } = await import('../../api/_lib/prisma.js')
      const rows = await prisma.scraperOverride.findMany()
      const next = new Map()
      for (const r of rows) {
        next.set(`${r.race}::${r.year}`, {
          eventIds: r.eventIds,
          platform: r.platform || null,
          verifiedAt: r.verifiedAt,
        })
      }
      cache = next
      loadedAt = Date.now()
    } catch (err) {
      // A database hiccup must not take instant lookup down with it. Keep
      // whatever we had; the file configs still work on their own.
      console.warn('[scraperOverrides] load failed, keeping cached values:', err.message)
    } finally {
      inFlight = null
    }
    return cache
  })()

  return inFlight
}

/** Synchronous read. Returns null when there is no override. */
export function getOverride(race, year) {
  return cache.get(`${race}::${year}`) || null
}

/**
 * Merge any override for this race+year into a config.
 *
 * Returns the config untouched when there is nothing to apply, so callers can
 * use it unconditionally.
 */
export function applyOverride(config, year) {
  const ov = getOverride(config.raceName, year)
  if (!ov) return config

  // Targeting the fallback scraper rather than the primary. This matters for
  // races like SF that are ChronoTrack-timed and Athlinks-mirrored: the two
  // have completely different id spaces for the same race.
  if (ov.platform && config.fallback?.platform === ov.platform) {
    return {
      ...config,
      fallback: {
        ...config.fallback,
        eventIds: { ...(config.fallback.eventIds || {}), [year]: ov.eventIds },
      },
    }
  }

  return {
    ...config,
    eventIds: { ...(config.eventIds || {}), [year]: ov.eventIds },
  }
}

/** Every override, for the dashboard. */
export function listOverrides() {
  return [...cache.entries()].map(([key, v]) => {
    const [race, year] = key.split('::')
    return { race, year: Number(year), ...v }
  })
}

/** Drop the cache so the next read hits the DB. Call after a write. */
export function invalidateOverrides() {
  loadedAt = 0
}
