/**
 * Scraper health: the supply side of Instant Lookup visibility.
 *
 * WHY THIS EXISTS
 *   Everything we had was demand-driven. LookupLog records what shoppers
 *   actually searched, and maybeAlertLookupError only fires when a shopper
 *   walks into a broken race. So a race nobody visited and a race that works
 *   look identical: blank. That was survivable at four live races. It is not
 *   survivable now that every HTTP-safe race is live, because traffic
 *   concentrates on a handful of products and the rest go dark.
 *
 *   The old /api/orders/test-scrapers was the closest thing to this, and it
 *   got two things right: it checked more than liveness, and it pulled a
 *   known-good runner rather than guessing a name. It also had four problems
 *   this module fixes:
 *     1. it only ever tested new Date().getFullYear(), against configs that in
 *        several cases have no event ids for the current year;
 *     2. it selected the known runner's bib and then never compared it, so a
 *        scrape that returns the WRONG person passed green;
 *     3. it ran races sequentially, which cannot finish inside a function when
 *        a sick timing site eats 40s per race;
 *     4. it kept nothing, so there was no history and nothing to alert on.
 *
 * THE TWO TIERS
 *   Static coverage costs nothing: eventIds is a per-year map, so "is 2024
 *   wired up" is a key lookup, not a scrape. That fills most of the grid
 *   instantly and produces a concrete to-do list of missing event ids.
 *
 *   Live probes cost a scrape each, so we only run them where they can tell us
 *   something: a race+year that is configured AND has a known finisher to
 *   assert against. Probing a year nobody has ever ordered proves little and
 *   costs the same as probing one that matters.
 */
import prisma from '../../api/_lib/prisma.js'
import { getRaceConfigSummaries, getScraperForRace, getCanonicalRaceName } from '../scrapers/index.js'

// How far back the grid looks. Shoppers buy posters for the race they ran, and
// that is overwhelmingly recent; going back further mostly adds dead cells.
export const YEAR_WINDOW = 5

// A single probe's ceiling. Generous compared to the 9s public-endpoint cap
// because nobody is waiting on this one, but bounded so one dead timing site
// cannot stall the whole run.
const PROBE_TIMEOUT_MS = 30000

// Probes run concurrently. Tuned to stay well inside a function's budget while
// not hammering any single timing platform.
const PROBE_CONCURRENCY = 6

export const STATUS = {
  LIVE: 'live',
  DRIFTED: 'drifted',
  BROKEN: 'broken',
  NO_YEAR: 'no_year',
  NO_PROBE: 'no_probe',
  INELIGIBLE: 'ineligible',
}

/** Years the grid covers, newest first. */
export function coveredYears(now = new Date()) {
  const current = now.getFullYear()
  return Array.from({ length: YEAR_WINDOW }, (_, i) => current - i)
}

/**
 * Static, network-free coverage grid: every race x every covered year, with
 * whether that combination is even wired up.
 *
 * Returns cells with status NO_YEAR / INELIGIBLE resolved, and everything else
 * left as null — meaning "configured, needs a live probe to say more".
 */
export function buildCoverageGrid(now = new Date()) {
  const years = coveredYears(now)
  const configs = getRaceConfigSummaries()

  return configs.map(cfg => {
    const cells = years.map(year => {
      if (!cfg.publicSafe) {
        return {
          year,
          status: STATUS.INELIGIBLE,
          // Puppeteer scrapers can't run on the public endpoint, so this race
          // is manual-entry-only by design. Not a fault, and it should never
          // show up in a "needs help" count.
          detail: `${cfg.platform} requires a browser; not available to the storefront`,
        }
      }
      const viaPrimary = cfg.hasYearPattern || cfg.explicitYears.includes(year)
      const viaFallback = cfg.fallbackYears.includes(year)
      if (!viaPrimary && !viaFallback) {
        return {
          year,
          status: STATUS.NO_YEAR,
          detail: 'No event id configured for this year',
        }
      }
      return {
        year,
        status: null, // needs a probe
        via: viaPrimary ? cfg.platform : cfg.fallbackPlatform,
      }
    })

    return { ...cfg, cells }
  })
}

/**
 * Known finishers to assert against, keyed `${race}::${year}`.
 *
 * Sourced from real research history rather than hand-curated fixtures: every
 * order we have ever successfully researched is a runner we KNOW appears in
 * that race's results with that bib. Race is unique on (raceName, year), so
 * this is already per-race-per-year, which is exactly the grain we need.
 *
 * Only rows with a bib are useful — without one there is nothing to assert and
 * the probe degrades to a liveness check, which is what we are trying to move
 * past.
 */
export async function loadProbeFixtures() {
  const rows = await prisma.runnerResearch.findMany({
    where: {
      researchStatus: 'found',
      bibNumber: { not: null },
      // A customer-confirmed match was never verified by us against the timing
      // site, so it is not a safe assertion target.
      source: 'scraper',
    },
    select: {
      runnerName: true,
      bibNumber: true,
      officialTime: true,
      race: { select: { raceName: true, year: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const fixtures = {}
  for (const r of rows) {
    if (!r.race?.raceName || !r.race?.year) continue
    // The Race table stores whatever name an order came in under, which is not
    // always the config's primary name — orders exist under "New York City
    // Marathon" while the config calls it "NYC Marathon". Key on the canonical
    // name or the fixture silently never matches its grid cell, and the race
    // reports as untested forever.
    const canonical = getCanonicalRaceName(r.race.raceName)
    if (!canonical) continue
    const key = `${canonical}::${r.race.year}`
    if (fixtures[key]) continue // newest wins
    fixtures[key] = {
      name: r.runnerName,
      bib: r.bibNumber,
      time: r.officialTime || null,
    }
  }
  return fixtures
}

/** Normalize bibs before comparing: "0123" and "123" are the same bib. */
function sameBib(a, b) {
  const norm = v => String(v ?? '').trim().replace(/^0+/, '').toLowerCase()
  const na = norm(a)
  return na !== '' && na === norm(b)
}

/**
 * Probe one race+year against a known finisher.
 *
 * The assertion is the point. "Did the scrape return something" is a liveness
 * check and it passes even when a markup change has shifted a column and every
 * bib and time is now wrong — which is the failure that survives all the way
 * onto a printed poster, because ~67% of buyers are gifters who cannot tell
 * that their runner's time is off.
 */
export async function probeOne(race, year, fixture) {
  const started = Date.now()
  const base = { race, year, probeName: fixture.name, expectBib: fixture.bib }

  try {
    const scraper = getScraperForRace(race, year)
    const result = await Promise.race([
      scraper.searchRunner(fixture.name),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`probe exceeded ${PROBE_TIMEOUT_MS}ms`)), PROBE_TIMEOUT_MS)
      ),
    ])

    const ms = Date.now() - started

    if (result?.found) {
      const actualBib = result.bibNumber ?? null
      if (sameBib(fixture.bib, actualBib)) {
        return { ...base, status: STATUS.LIVE, actualBib, ms }
      }
      return {
        ...base,
        status: STATUS.DRIFTED,
        actualBib,
        ms,
        detail: `Found "${fixture.name}" but bib was ${actualBib ?? 'null'}, expected ${fixture.bib}`,
      }
    }

    // Ambiguous means the scraper is working and just cannot disambiguate a
    // common name. If our known bib is among the candidates, the data is fine.
    const candidates = result?.possibleMatches || []
    if (result?.ambiguous || candidates.length) {
      const hit = candidates.find(m => sameBib(fixture.bib, m.bib))
      if (hit) return { ...base, status: STATUS.LIVE, actualBib: hit.bib, ms }
      return {
        ...base,
        status: STATUS.DRIFTED,
        ms,
        detail: `${candidates.length} candidate(s) returned, none carrying bib ${fixture.bib}`,
      }
    }

    // A runner we previously found is now missing. The site answered, so it is
    // not down; something about the results or the parse changed.
    return {
      ...base,
      status: STATUS.DRIFTED,
      ms,
      detail: `"${fixture.name}" was found here before and is not found now`,
    }
  } catch (err) {
    return {
      ...base,
      status: STATUS.BROKEN,
      ms: Date.now() - started,
      detail: err.message,
    }
  }
}

/** Run thunks with a fixed concurrency ceiling. */
async function pool(items, limit, fn) {
  const out = []
  const queue = [...items.entries()]
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const [i, item] = queue.shift()
      out[i] = await fn(item)
    }
  })
  await Promise.all(workers)
  return out
}

/**
 * Full probe run: resolve the grid, probe every configured cell that has a
 * fixture, and persist one row per race+year.
 *
 * Cells that are configured but have no known finisher are recorded as
 * NO_PROBE rather than silently omitted. "We have not tested this" and "this
 * works" must not look the same — that conflation is the whole reason the old
 * panel could not be trusted.
 */
export async function runProbe({ races = null, now = new Date() } = {}) {
  const grid = buildCoverageGrid(now)
  const fixtures = await loadProbeFixtures()

  const targets = []
  const staticRows = []

  for (const row of grid) {
    if (races && !races.includes(row.raceName)) continue
    for (const cell of row.cells) {
      if (cell.status !== null) {
        staticRows.push({
          race: row.raceName,
          year: cell.year,
          status: cell.status,
          detail: cell.detail || null,
          platform: row.platform,
        })
        continue
      }
      const fixture = fixtures[`${row.raceName}::${cell.year}`]
      if (!fixture) {
        staticRows.push({
          race: row.raceName,
          year: cell.year,
          status: STATUS.NO_PROBE,
          detail: 'No confirmed finisher on record for this race and year',
          platform: cell.via || row.platform,
        })
        continue
      }
      targets.push({ race: row.raceName, year: cell.year, fixture, platform: cell.via || row.platform })
    }
  }

  const probed = await pool(targets, PROBE_CONCURRENCY, async t => {
    const r = await probeOne(t.race, t.year, t.fixture)
    return { ...r, platform: t.platform }
  })

  const all = [...staticRows, ...probed]

  // One row per race+year, overwritten each run. History lives in checkedAt
  // plus the alerting digest; we care about current state, not a time series.
  for (const row of all) {
    await prisma.scraperHealth.upsert({
      where: { race_year: { race: row.race, year: row.year } },
      create: {
        race: row.race,
        year: row.year,
        status: row.status,
        probeName: row.probeName ?? null,
        expectBib: row.expectBib ?? null,
        actualBib: row.actualBib ?? null,
        ms: row.ms ?? null,
        detail: row.detail ?? null,
        platform: row.platform ?? null,
      },
      update: {
        status: row.status,
        checkedAt: new Date(),
        probeName: row.probeName ?? null,
        expectBib: row.expectBib ?? null,
        actualBib: row.actualBib ?? null,
        ms: row.ms ?? null,
        detail: row.detail ?? null,
        platform: row.platform ?? null,
      },
    })
  }

  const tally = all.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, {})

  return { checked: all.length, probed: probed.length, tally, rows: all }
}

/** Statuses that mean a human should go do something. */
export const NEEDS_HELP = new Set([STATUS.BROKEN, STATUS.DRIFTED, STATUS.NO_YEAR])
