/**
 * The nightly sweep: everything about the fulfillment tool's health that can
 * be established by code alone.
 *
 * This file deliberately contains NO judgment. It gathers facts and returns
 * them. Deciding what to do about a fact - look a race date up, write a
 * config, wake Matt - is the agent's job, and it reads this report over the
 * admin API. The split matters: this half runs with production credentials on
 * Vercel, the agent half never sees them and can only write code.
 *
 * Everything here is READ-ONLY except the catalog sync, which is idempotent
 * and already runs on its own staleness timer.
 *
 * Two rules that shape the whole file:
 *
 *   1. No invented problems. Every finding is a concrete fact with an order
 *      number or a race attached. "Looks unusual" is not a finding. A sweep
 *      that cries wolf gets ignored, and then the real one is missed too.
 *
 *   2. Failure is a finding. If a check throws, that is reported as a broken
 *      check rather than silently omitted. A clean report must mean "we
 *      looked", never "we could not look". The stale catalog sat unnoticed for
 *      eighteen days precisely because nothing said it had stopped moving.
 */

import prisma from '../../api/_lib/prisma.js'
import { buildCatalogCoverage, coveredYears, NEEDS_HELP, STATUS } from '../lib/scraperHealth.js'
import { repairPlan } from '../lib/scraperRepair.js'
import { syncProductCatalog } from './shopifyProducts.js'
import { getRaceConfigSummaries, getSupportedRaces, getVerifiedRaceDates } from '../scrapers/index.js'

/** Run a check so that a thrown error becomes a reported fact, not a gap. */
async function check(name, fn) {
  const started = Date.now()
  try {
    const data = await fn()
    return { name, ok: true, ms: Date.now() - started, ...data }
  } catch (error) {
    console.error(`[nightlySweep] check "${name}" failed:`, error.message)
    return { name, ok: false, ms: Date.now() - started, error: error.message, findings: [] }
  }
}

const DAY = 24 * 60 * 60 * 1000
const days = n => n * DAY

/* ────────────────────────────────────────────────────────────────────────
   1. What we sell
   ──────────────────────────────────────────────────────────────────────── */

async function catalogCheck() {
  // Idempotent, and the only write in the sweep. Without it every downstream
  // count is measured against whenever someone last pressed the button.
  let synced = null
  try {
    synced = await syncProductCatalog()
  } catch (error) {
    console.warn('[nightlySweep] catalog sync failed, using stored snapshot:', error.message)
  }

  const catalog = await buildCatalogCoverage()
  return {
    synced,
    activeProducts: catalog.products,
    racesSold: catalog.racesSold.length,
    // Races on sale today with no scraper at all. This is the worst category:
    // a shopper on that page gets manual entry and we never see it.
    findings: catalog.needsScraper.map(p => ({
      severity: 'high',
      kind: 'selling_without_scraper',
      subject: p.title,
      detail: `On sale (${p.handle}) with no scraper. Shoppers get manual entry only.`,
      action: 'tier2_flag',
    })),
  }
}

/* ────────────────────────────────────────────────────────────────────────
   2. Scraper coverage and health
   ──────────────────────────────────────────────────────────────────────── */

async function scraperCheck() {
  const years = coveredYears()
  const plan = await repairPlan(years)
  const health = await prisma.scraperHealth.findMany()

  const tally = {}
  for (const h of health) tally[h.status] = (tally[h.status] || 0) + 1

  const findings = []
  for (const race of plan) {
    for (const y of race.years) {
      const drifted = y.status === STATUS.DRIFTED
      findings.push({
        severity: drifted ? 'high' : 'medium',
        kind: drifted ? 'scraper_drifted' : y.status,
        subject: `${race.race} ${y.year}`,
        detail: drifted
          // Drift is the dangerous one: the site answers, so nothing errors,
          // but the runner coming back is not the one we asked for.
          ? 'Site responds but returns the wrong runner. Needs diagnosis, never an automatic fix.'
          : `${y.status} on ${race.platform}`,
        // Only an id we can look up is safe to fix unattended. Drift means the
        // page changed shape and a person has to work out how.
        action: drifted ? 'tier2_flag' : (y.route === 'discover' || y.route === 'capture-fixture' ? 'tier1_fixable' : 'tier2_flag'),
        route: y.route,
        platform: race.platform,
      })
    }
  }

  return { years, statusTally: tally, racesConfigured: getSupportedRaces().length, findings }
}

/* ────────────────────────────────────────────────────────────────────────
   3. Race dates
   ──────────────────────────────────────────────────────────────────────── */

async function raceDateCheck() {
  const years = coveredYears()
  const configs = getRaceConfigSummaries(years)
  const findings = []

  // Which races still lean on a computed date. calculateDate encodes a rule
  // like "third Sunday of August" and races move: Sydney shifted to late
  // August in 2025 and its rule was three weeks wrong for years, silently,
  // with the wrong weather printed on every poster.
  const verified = getVerifiedRaceDates()
  for (const cfg of configs) {
    const pinned = verified[cfg.raceName] || {}
    const missing = years.filter(y => !pinned[y])
    if (missing.length) {
      findings.push({
        severity: 'medium',
        kind: 'race_date_computed',
        subject: cfg.raceName,
        detail: `No verified date for ${missing.join(', ')} - falling back to a computed one.`,
        action: 'tier1_fixable',
        years: missing,
      })
    }
  }

  // A race whose date has passed while its orders still say "not run yet".
  // Nothing re-researches these on its own, so they sit forever.
  const staleFuture = await prisma.runnerResearch.findMany({
    where: { researchStatus: 'race_not_run' },
    include: { race: { select: { raceName: true, year: true, raceDate: true } },
               order: { select: { orderNumber: true, status: true } } },
  })
  for (const r of staleFuture) {
    if (!r.race?.raceDate || r.order?.status === 'completed') continue
    if (r.race.raceDate.getTime() < Date.now() - days(2)) {
      findings.push({
        severity: 'high',
        kind: 'race_run_but_not_researched',
        subject: `${r.race.raceName} ${r.race.year}`,
        detail: `Order ${r.order.orderNumber} still says "race not run yet" but the race was ${r.race.raceDate.toISOString().slice(0, 10)}.`,
        action: 'tier0_auto',
      })
    }
  }

  // Past races with no weather. The poster needs it and nothing retries.
  const noWeather = await prisma.race.findMany({
    where: { weatherTemp: null, raceDate: { lt: new Date() } },
    select: { raceName: true, year: true, raceDate: true, location: true, _count: { select: { runnerResearch: true } } },
  })
  for (const race of noWeather.filter(r => r._count.runnerResearch > 0)) {
    findings.push({
      severity: 'medium',
      kind: 'missing_weather',
      subject: `${race.raceName} ${race.year}`,
      detail: `${race._count.runnerResearch} order(s) reference this race and it has no weather.`,
      action: 'tier0_auto',
    })
  }

  return { racesChecked: configs.length, findings }
}

/* ────────────────────────────────────────────────────────────────────────
   4. Order red flags - concrete only
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Order red flags, restricted to things that are OUR system misbehaving.
 *
 * Not a workload report. A custom order running late is a real problem and it
 * belongs on a different screen - putting it here buries the technical
 * findings under things Dan already knows about. Everything below is a fact
 * about our data or our pipeline being wrong, and each one has an order number
 * attached. No heuristics, no "this looks unusual".
 */

/** Overall pace implied by a finish time over a distance, as "M:SS". */
function pacePerMile(timeStr, distanceMiles) {
  const parts = String(timeStr || '').split(':').map(Number)
  if (parts.some(Number.isNaN) || parts.length < 2 || !distanceMiles) return null
  const secs = parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1]
  if (!secs) return null
  const perMile = secs / distanceMiles
  return `${Math.floor(perMile / 60)}:${String(Math.round(perMile % 60)).padStart(2, '0')}`
}

/** Seconds between two "M:SS" paces, for tolerance comparison. */
function paceGapSeconds(a, b) {
  const toSecs = p => { const [m, s] = String(p).split(':').map(Number); return (m * 60) + (s || 0) }
  if (!a || !b) return null
  return Math.abs(toSecs(a) - toSecs(b))
}

async function orderCheck() {
  const findings = []
  const open = await prisma.order.findMany({
    where: { status: { not: 'completed' } },
    include: {
      runnerResearch: { orderBy: { id: 'desc' }, take: 1 },
      approvalToken: true,
    },
  })

  const summaries = getRaceConfigSummaries([])
  const distanceFor = name => summaries.find(c => c.raceName === name)?.distanceMiles || 26.2

  for (const o of open) {
    const research = o.runnerResearch[0]
    const customerSupplied = Boolean(o.customerFinishTime || o.customerBib)

    // We scraped over data the customer already gave us. Wasted work at best,
    // and on a common surname it returns strangers and parks the order in the
    // queue looking unresolved when nothing was missing.
    if (customerSupplied && research && !['found'].includes(research.researchStatus)) {
      findings.push({ severity: 'high', kind: 'researched_over_customer_data', subject: o.orderNumber,
        detail: `Customer gave bib ${o.customerBib || '-'} / time ${o.customerFinishTime || '-'}, but research is "${research.researchStatus}". Their numbers should have been used as-is.`,
        action: 'tier0_auto' })
    }

    // Candidates offered under a "pick one" banner where none is actually this
    // runner. Accepting one prints a stranger's time on the poster.
    const matches = Array.isArray(research?.possibleMatches) ? research.possibleMatches : []
    if (matches.length) {
      const want = String(o.runnerName || '').toLowerCase().split(/\s+/).filter(Boolean)
      const anyReal = matches.some(m => {
        const got = String(m?.name || '').toLowerCase()
        return want.length > 1 && want.every(t => got.includes(t))
      })
      if (!anyReal) {
        findings.push({ severity: 'high', kind: 'suggestions_presented_as_matches', subject: o.orderNumber,
          detail: `${matches.length} candidate(s) offered for "${o.runnerName}" and none carries that name. These are near-name suggestions, not matches.`,
          action: 'tier2_flag' })
      }
    }

    // Stored pace that does not equal time over distance. This is the Army
    // Ten-Miler bug: a split distance in feet read as metres produced a
    // 2:54/mi pace on a ten-mile race. It looked like a number, so nothing
    // complained.
    if (research?.officialTime && research?.officialPace) {
      const expected = pacePerMile(research.officialTime, distanceFor(o.raceName))
      const gap = paceGapSeconds(expected, research.officialPace)
      if (gap !== null && gap > 20) {
        findings.push({ severity: 'high', kind: 'pace_inconsistent_with_time', subject: o.orderNumber,
          detail: `${o.raceName}: stored ${research.officialTime} @ ${research.officialPace}/mi, but that time over the configured distance is ${expected}/mi.`,
          action: 'tier2_flag' })
      }
    }

    // The link we asked them to approve through is dead.
    if (o.approvalToken && o.approvalToken.expiresAt < new Date()) {
      findings.push({ severity: 'high', kind: 'approval_link_expired', subject: o.orderNumber,
        detail: `Approval link expired ${o.approvalToken.expiresAt.toISOString().slice(0, 10)} on an order still in ${o.designStatus || o.status}.`,
        action: 'tier0_auto' })
    }

    // A photo order reaching production without the photo confirmed placed
    // means the completion gate was bypassed. Reprint and refund territory.
    if (o.photoPath && !o.photoPlacedAt && o.designStatus === 'sent_to_production') {
      findings.push({ severity: 'high', kind: 'photo_gate_bypassed', subject: o.orderNumber,
        detail: 'Sent to production carrying a customer photo that was never confirmed as placed.', action: 'tier2_flag' })
    }

    // Nothing will ever produce data for this order on its own.
    if (!research && !customerSupplied && o.trackstarOrderType === 'standard') {
      findings.push({ severity: 'medium', kind: 'no_runner_data', subject: o.orderNumber,
        detail: `${o.raceName} ${o.raceYear}: no research record and no customer-entered time or bib.`, action: 'tier2_flag' })
    }
  }

  return { openOrders: open.length, findings }
}

/* ────────────────────────────────────────────────────────────────────────
   5. Commercial signals
   ──────────────────────────────────────────────────────────────────────── */

async function commerceCheck() {
  const findings = []

  // A discount code we have not seen before is usually a new charity or race
  // partner, which usually means a co-branded design nobody has been told
  // about yet.
  // Codes ride inside shopifyOrderData rather than a column, so this reads the
  // JSON the same way the orders endpoint does.
  const codesOf = o => (o?.shopifyOrderData?.discount_codes || [])
    .map(c => (typeof c?.code === 'string' ? c.code.trim() : ''))
    .filter(Boolean)

  const since = new Date(Date.now() - days(2))
  const recent = await prisma.order.findMany({
    where: { createdAt: { gte: since } },
    select: { orderNumber: true, shopifyOrderData: true },
  })
  const older = await prisma.order.findMany({
    where: { createdAt: { lt: since } },
    select: { shopifyOrderData: true },
  })
  const known = new Set(older.flatMap(codesOf))
  const seen = new Set()
  for (const o of recent) {
    for (const code of codesOf(o)) {
      if (known.has(code) || seen.has(code)) continue
      seen.add(code)
      findings.push({ severity: 'medium', kind: 'new_discount_code', subject: code,
        detail: `First seen on order ${o.orderNumber}. If this is a partner, the print may need a co-branded version.`,
        action: 'tier2_flag' })
    }
  }

  return { newCodes: seen.size, findings }
}

/* ────────────────────────────────────────────────────────────────────────
   Report
   ──────────────────────────────────────────────────────────────────────── */

/**
 * A stable identity for a finding, so tonight's report can be compared with
 * last night's. Deliberately excludes the detail text: the same problem should
 * not read as "new" because a day count inside the sentence moved.
 */
function fingerprint(f) {
  return `${f.kind}::${f.subject}`
}

const LAST_REPORT_KEY = 'nightly_sweep_last'

/**
 * What changed since last night.
 *
 * A nightly report of 200 standing findings is a report nobody reads by the
 * third night. Almost all of that is backlog - 123 race-years that have never
 * been probed do not become news by being counted again. What deserves
 * attention is what appeared today and what disappeared today, so the report
 * leads with those and keeps the standing total as a number.
 */
async function withDelta(report, { persist = true } = {}) {
  let previous = null
  try {
    const row = await prisma.systemConfig.findUnique({ where: { key: LAST_REPORT_KEY } })
    previous = row?.value ? JSON.parse(row.value) : null
  } catch (error) {
    console.warn('[nightlySweep] could not read the previous report:', error.message)
  }

  const now = new Set(report.findings.map(fingerprint))
  const before = new Set(previous?.fingerprints || [])

  report.delta = {
    hasBaseline: Boolean(previous),
    previousAt: previous?.finishedAt || null,
    new: report.findings.filter(f => !before.has(fingerprint(f))),
    // Gone since last night. Usually something got fixed, which is worth
    // saying out loud - a report that only ever grows teaches you to ignore it.
    resolved: [...before].filter(fp => !now.has(fp)),
    unchanged: report.findings.filter(f => before.has(fingerprint(f))).length,
  }

  if (!persist) return report

  try {
    const snapshot = JSON.stringify({
      finishedAt: report.finishedAt,
      fingerprints: [...now],
    })
    await prisma.systemConfig.upsert({
      where: { key: LAST_REPORT_KEY },
      create: { key: LAST_REPORT_KEY, value: snapshot },
      update: { value: snapshot },
    })
  } catch (error) {
    // Losing the snapshot costs tomorrow's delta, not tonight's report.
    console.warn('[nightlySweep] could not store tonight\'s snapshot:', error.message)
  }

  return report
}

/**
 * @param {Object} [opts]
 * @param {boolean} [opts.persistBaseline=true] - false for a dry run: the
 *   delta is still COMPUTED against last night, it just does not become the
 *   new baseline. Skipping the computation instead made a dry run report
 *   "0 new" alongside "first run", which is two contradictory things at once.
 */
export async function runNightlySweep({ persistBaseline = true } = {}) {
  const startedAt = new Date()

  const checks = [
    await check('catalog', catalogCheck),
    await check('scrapers', scraperCheck),
    await check('race_dates', raceDateCheck),
    await check('orders', orderCheck),
    await check('commerce', commerceCheck),
  ]

  const findings = checks.flatMap(c => (c.findings || []).map(f => ({ ...f, check: c.name })))
  const failed = checks.filter(c => !c.ok)

  const bySeverity = { high: 0, medium: 0, low: 0 }
  for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1

  const byAction = {}
  for (const f of findings) byAction[f.action] = (byAction[f.action] || 0) + 1

  const report = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    // A sweep that could not complete every check is NOT a clean sweep, and
    // says so loudly rather than reporting the subset it managed.
    healthy: failed.length === 0,
    failedChecks: failed.map(c => ({ name: c.name, error: c.error })),
    summary: {
      findings: findings.length,
      bySeverity,
      byAction,
      ...Object.fromEntries(checks.map(c => [c.name, { ok: c.ok, ms: c.ms }])),
    },
    stats: Object.fromEntries(
      checks.map(c => {
        const { name, ok, ms, findings: _f, error: _e, ...rest } = c
        return [name, rest]
      })
    ),
    findings,
  }

  return await withDelta(report, { persist: persistBaseline })
}
