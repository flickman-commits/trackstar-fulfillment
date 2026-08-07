/**
 * GET  /api/admin/lookup-health[?days=7&limit=500]
 * POST /api/admin/lookup-health   → run the probe now
 *
 * One endpoint behind one dashboard card. It replaces the pair that used to
 * split this picture in half:
 *
 *   /api/admin/lookups-recent  — what shoppers searched (demand side)
 *   /api/orders/test-scrapers  — whether scrapers work  (supply side)
 *
 * Neither could answer "which races need help", because each was blind exactly
 * where the other could see. Traffic data says nothing about a race nobody
 * visited; the scraper test said nothing about real-world outcomes and only
 * ever tested the current year.
 *
 * Shape is deliberately per-race, with years and individual inquiries nested
 * underneath, because the decision being made here is "which race do I go fix",
 * not "what happened at 09:32".
 */
import { setCors, requireAdmin } from '../_lib/auth.js'
import prisma from '../_lib/prisma.js'
import {
  buildCoverageGrid,
  buildCatalogCoverage,
  coveredYears,
  runProbe,
  STATUS,
  NEEDS_HELP,
} from '../../server/lib/scraperHealth.js'
import { syncProductCatalog } from '../../server/services/shopifyProducts.js'

const ERROR_OUTCOMES = new Set(['upstream_error', 'rate_limited', 'bad_request'])
const SUCCESS_OUTCOMES = new Set(['found', 'cached'])

/** Median is the headline because a handful of 25-60s timeouts drag the mean
 *  somewhere no real shopper ever experienced. p95 rides alongside it, since
 *  the median tells you what is typical and p95 tells you how bad the tail is,
 *  and the 10s widget cap is only defensible with both in view. */
function percentile(sorted, p) {
  if (!sorted.length) return null
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

// Outcomes where the endpoint short-circuited and never went out to a timing
// site. They log ms: 0, which is not a fast lookup — it is the absence of one.
const NO_WORK_OUTCOMES = new Set(['cached', 'off', 'rate_limited', 'bad_request'])

/**
 * Timing over lookups that actually did work.
 *
 * Including the zero-cost rows made a race with one real 557ms scrape and two
 * short-circuited requests report a "0 ms median", which reads as broken
 * instrumentation rather than as what it is. Filter them and the number answers
 * the question it claims to: when we genuinely go and fetch, how long does it
 * take. Everything excluded here is still counted in the outcome tallies, so
 * nothing disappears — it just stops pretending to be a measurement.
 */
function timingStats(entries) {
  const sorted = entries
    .filter(e => !e.cached && !NO_WORK_OUTCOMES.has(e.outcome) && typeof e.ms === 'number' && e.ms > 0)
    .map(e => e.ms)
    .sort((a, b) => a - b)
  return {
    medianMs: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    samples: sorted.length,
  }
}

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS' })) return
  if (!requireAdmin(req, res)) return

  res.setHeader('Cache-Control', 'private, no-store, max-age=0')

  if (req.method === 'POST') {
    // Two jobs behind one endpoint. Syncing the catalog is what makes a newly
    // added Shopify product show up as "needs a scraper" without anyone
    // remembering to tell the dashboard about it.
    if (req.body?.action === 'sync-catalog') {
      const result = await syncProductCatalog()
      return res.status(200).json({ success: true, ...result })
    }
    const races = Array.isArray(req.body?.races) ? req.body.races : null
    const result = await runProbe({ races })
    return res.status(200).json({ success: true, ...result })
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const days = req.query.days !== undefined ? parseInt(req.query.days, 10) : 7
  const limit = Math.max(1, Math.min(2000, parseInt(req.query.limit, 10) || 1000))
  const since = Number.isFinite(days) && days > 0
    ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    : undefined

  const [entries, health, catalog] = await Promise.all([
    prisma.lookupLog.findMany({
      where: since ? { createdAt: { gte: since } } : {},
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.scraperHealth.findMany({ orderBy: [{ race: 'asc' }, { year: 'desc' }] }),
    buildCatalogCoverage(),
  ])

  const grid = buildCoverageGrid()
  const years = coveredYears()

  // health rows keyed for lookup
  const healthByRace = {}
  for (const h of health) {
    ;(healthByRace[h.race] ||= {})[h.year] = h
  }

  // traffic rolled up per race
  const trafficByRace = {}
  for (const e of entries) {
    const key = e.race || '(unknown)'
    const t = (trafficByRace[key] ||= { total: 0, byOutcome: {}, entries: [] })
    t.total += 1
    t.byOutcome[e.outcome] = (t.byOutcome[e.outcome] || 0) + 1
    t.entries.push(e)
  }

  const races = grid.map(cfg => {
    const yearRows = cfg.cells.map(cell => {
      const h = healthByRace[cfg.raceName]?.[cell.year]
      // A stored probe result wins; otherwise fall back to what the static
      // grid already knows (ineligible / no_year), and NO_PROBE when the cell
      // is configured but has never been probed. Never report an unprobed cell
      // as healthy — "untested" and "working" looking alike is precisely the
      // failure mode this whole panel exists to remove.
      const status = h?.status ?? cell.status ?? STATUS.NO_PROBE
      return {
        year: cell.year,
        status,
        detail: h?.detail ?? cell.detail ?? null,
        ms: h?.ms ?? null,
        probeName: h?.probeName ?? null,
        expectBib: h?.expectBib ?? null,
        actualBib: h?.actualBib ?? null,
        platform: h?.platform ?? cell.via ?? cfg.platform,
        checkedAt: h?.checkedAt ?? null,
      }
    })

    const traffic = trafficByRace[cfg.raceName] || { total: 0, byOutcome: {}, entries: [] }
    const errors = Object.entries(traffic.byOutcome)
      .filter(([o]) => ERROR_OUTCOMES.has(o))
      .reduce((n, [, c]) => n + c, 0)

    const healthTally = yearRows.reduce((acc, y) => {
      acc[y.status] = (acc[y.status] || 0) + 1
      return acc
    }, {})

    return {
      race: cfg.raceName,
      platform: cfg.platform,
      fallbackPlatform: cfg.fallbackPlatform,
      publicSafe: cfg.publicSafe,
      hasYearPattern: cfg.hasYearPattern,
      years: yearRows,
      healthTally,
      needsHelp: yearRows.filter(y => NEEDS_HELP.has(y.status)).length,
      traffic: {
        total: traffic.total,
        byOutcome: traffic.byOutcome,
        errors,
        ...timingStats(traffic.entries),
      },
      entries: traffic.entries,
    }
  })

  // ---- headline stats -------------------------------------------------
  const byOutcome = entries.reduce((acc, e) => {
    acc[e.outcome] = (acc[e.outcome] || 0) + 1
    return acc
  }, {})
  const found = Object.entries(byOutcome)
    .filter(([o]) => SUCCESS_OUTCOMES.has(o))
    .reduce((n, [, c]) => n + c, 0)
  const off = byOutcome.off || 0
  const attempts = Math.max(0, entries.length - off)

  // The action list. Deliberately built from PROBE results, not from traffic
  // errors: a traffic-driven count only ever surfaces races somebody happened
  // to shop, which is the blind spot we are removing. Grouped by cause because
  // the three causes need completely different work.
  const needsHelp = []
  for (const r of races) {
    for (const y of r.years) {
      if (!NEEDS_HELP.has(y.status)) continue
      needsHelp.push({
        race: r.race, year: y.year, status: y.status,
        detail: y.detail, platform: y.platform,
        expectBib: y.expectBib, actualBib: y.actualBib, probeName: y.probeName,
      })
    }
  }
  const needsHelpByCause = needsHelp.reduce((acc, n) => {
    ;(acc[n.status] ||= []).push(n)
    return acc
  }, {})
  const racesNeedingHelp = new Set(needsHelp.map(n => n.race)).size

  const eligible = races.filter(r => r.publicSafe)

  // Coverage is measured against what we SELL, not what we have configs for.
  // The old denominator (configs) could not see a race we sell and never wrote
  // a scraper for, which is the worst category and the one worth surfacing.
  const soldSet = new Set(catalog.racesSold)
  const soldRaces = races.filter(r => soldSet.has(r.race))
  const soldLive = soldRaces.filter(r => (r.healthTally[STATUS.LIVE] || 0) > 0).length
  const racesLive = eligible.filter(r => (r.healthTally[STATUS.LIVE] || 0) > 0).length

  return res.status(200).json({
    windowDays: since ? days : null,
    years,
    stats: {
      totalLookups: entries.length,
      attempts,
      found,
      successRate: attempts > 0 ? Math.round((found / attempts) * 100) : 0,
      byOutcome,
      ...timingStats(entries),
      racesNeedingHelp,
      cellsNeedingHelp: needsHelp.length,
      racesLive,
      racesEligible: eligible.length,
      racesTotal: races.length,
      // Headline coverage numbers, catalog-based.
      soldLive,
      soldTotal: soldRaces.length,
      needsScraper: catalog.needsScraper.length,
      activeProducts: catalog.products,
      onWizardTemplate: catalog.onWizardTemplate,
      lastProbeAt: health.length
        ? health.reduce((max, h) => (h.checkedAt > max ? h.checkedAt : max), health[0].checkedAt)
        : null,
    },
    needsHelp,
    needsHelpByCause,
    // Products we sell that resolve to no scraper at all. These never appear
    // in `races` because that list is built from configs.
    needsScraper: catalog.needsScraper,
    notARace: catalog.notARace,
    races,
  })
}
