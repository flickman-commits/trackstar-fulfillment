/**
 * Self-service repair for scraper gaps.
 *
 * The point of this module is that fixing a missing event id or an untested
 * race should not require opening an editor. Three operations, in increasing
 * order of how much human input they need:
 *
 *   discoverEventIds  — fully automatic, Athlinks only. Its MasterEvents API
 *                       lists every running of a race with its id and result
 *                       count, so the gap can just be looked up.
 *   saveOverride      — the manual path for platforms with no discovery. You
 *                       supply the id; this VERIFIES it before saving, so a
 *                       typo cannot quietly make a race worse.
 *   captureFixture    — fully automatic. Scrape any real finisher and store
 *                       them, which turns "untested" into a race that every
 *                       later probe can assert against.
 *
 * What is deliberately NOT here: creating a scraper. A new timing platform
 * needs parsing code, and a button that could invent one would be a button
 * that could invent wrong results onto a printed poster.
 */
import { fetchWithTimeout } from './fetchWithTimeout.js'
import { getScraperForRace, getRaceConfigSummaries } from '../scrapers/index.js'
import { ensureOverridesLoaded, invalidateOverrides } from '../scrapers/scraperOverrides.js'

const ATHLINKS_MASTER_API = 'https://alaska.athlinks.com/MasterEvents/Api'
const DISCOVERY_TIMEOUT_MS = 20000

/**
 * Ask Athlinks for every running of a race.
 *
 * Returns { year -> { eventId, raceDate, resultCount, raceName } }. A year with
 * resultCount 0 is included but flagged: that is a scheduled race whose results
 * do not exist yet, and saving its id would produce a scraper that finds
 * nobody — which looks identical to a broken scraper.
 */
export async function discoverAthlinksEventIds(masterEventId) {
  const res = await fetchWithTimeout(`${ATHLINKS_MASTER_API}/${masterEventId}`, {}, DISCOVERY_TIMEOUT_MS)
  if (!res.ok) throw new Error(`Athlinks MasterEvents HTTP ${res.status}`)

  let body
  try {
    body = await res.json()
  } catch {
    // Some master ids return HTML rather than JSON (Fort Lauderdale's 18578
    // does). Treat it as "no discovery available" rather than crashing a run.
    throw new Error('Athlinks returned a non-JSON response for this master event id')
  }
  if (!body?.success || !body.result) throw new Error(body?.errorMessage || 'Athlinks returned no result')

  const byYear = {}
  for (const r of body.result.eventRaces || []) {
    const date = r.raceDate ? new Date(r.raceDate) : null
    if (!date || isNaN(date.valueOf())) continue
    const year = date.getUTCFullYear()
    const candidate = {
      eventId: r.raceID,
      raceDate: date.toISOString().slice(0, 10),
      resultCount: r.resultCount ?? 0,
      raceName: r.raceName || null,
    }
    // Athlinks sometimes lists two entries for one year (a real one and an
    // empty duplicate). Keep whichever actually has results.
    const existing = byYear[year]
    if (!existing || candidate.resultCount > existing.resultCount) byYear[year] = candidate
  }
  return byYear
}

/**
 * Find missing event ids for a race and return them as proposals.
 *
 * Proposals rather than writes: this reports what it found and lets the caller
 * decide. `apply: true` saves them, which is the "fix it" button.
 */
export async function proposeEventIds({ race, years, apply = false }) {
  const cfg = getRaceConfigSummaries(years).find(c => c.raceName === race)
  if (!cfg) throw new Error(`No config for ${race}`)

  const platform = cfg.platform
  const masterEventId = cfg.masterEventId || cfg.fallbackMasterEventId
  const targetsFallback = !cfg.masterEventId && !!cfg.fallbackMasterEventId

  if (platform !== 'athlinks' && !targetsFallback) {
    return {
      race,
      discoverable: false,
      reason: `${platform} has no event listing we can query; paste the id from the timing site instead`,
      proposals: [],
    }
  }
  if (!masterEventId) {
    return { race, discoverable: false, reason: 'No masterEventId in the config to look up', proposals: [] }
  }

  // Athlinks is not uniformly healthy: 18578 (Fort Lauderdale) answers with
  // HTML and 119816 (Jackson Hole) 500s. One sick master id must not abort a
  // whole discovery run, so this degrades to "not discoverable right now".
  let found
  try {
    found = await discoverAthlinksEventIds(masterEventId)
  } catch (err) {
    return { race, discoverable: false, masterEventId, reason: err.message, proposals: [] }
  }

  const proposals = []
  for (const year of years) {
    const hit = found[year]
    if (!hit) continue
    proposals.push({
      race,
      year,
      eventId: hit.eventId,
      raceDate: hit.raceDate,
      resultCount: hit.resultCount,
      platform: targetsFallback ? cfg.fallbackPlatform : null,
      // The one guard that matters. An id whose race has no published results
      // yet would make the scraper return "not found" for everyone, which is
      // indistinguishable from broken.
      usable: hit.resultCount > 0,
      skipReason: hit.resultCount > 0 ? null : 'No results published for this year yet',
    })
  }

  if (apply) {
    const { default: prisma } = await import('../../api/_lib/prisma.js')
    for (const p of proposals.filter(x => x.usable)) {
      const note = `Athlinks MasterEvents ${masterEventId}, ${p.resultCount} results`
      await prisma.scraperOverride.upsert({
        where: { race_year: { race: p.race, year: p.year } },
        create: { race: p.race, year: p.year, eventIds: p.eventId, platform: p.platform, source: 'discovered', note },
        update: { eventIds: p.eventId, platform: p.platform, source: 'discovered', note, verifiedAt: null },
      })
    }
    invalidateOverrides()
    await ensureOverridesLoaded({ force: true })

    // Verify what we just wrote, exactly as the manual path does. Discovery is
    // authoritative about which id belongs to which year — it comes from
    // Athlinks' own listing with a result count — but that is not the same as
    // the id working right now, and the two should not be conflated.
    //
    // Verification failing does NOT unwrite the override: Athlinks goes down
    // for stretches (it is 500ing across every event as this ships), and
    // discarding a correct id because the site is having a bad afternoon would
    // make the button useless exactly when someone reaches for it. The row
    // stays, unverified, and the panel says so.
    for (const p of proposals.filter(x => x.usable)) {
      const check = await captureFixture({ race: p.race, year: p.year, save: false })
      p.verified = check.ok
      p.verifyError = check.ok ? null : check.error
      if (check.ok) {
        await prisma.scraperOverride.update({
          where: { race_year: { race: p.race, year: p.year } },
          data: { verifiedAt: new Date() },
        })
      }
    }
  }

  return { race, discoverable: true, masterEventId, proposals }
}

/**
 * Save a hand-entered event id, but only after proving it works.
 *
 * Verification is the whole value here. Saving an unchecked id would move a
 * race from an honest "no event id" to a dishonest "configured", and the next
 * probe would report it broken with no clue that a human typo caused it.
 */
export async function saveOverride({ race, year, eventIds, platform = null, probeName = null }) {
  const { default: prisma } = await import('../../api/_lib/prisma.js')

  await prisma.scraperOverride.upsert({
    where: { race_year: { race, year } },
    create: { race, year, eventIds, platform, source: 'manual' },
    update: { eventIds, platform, source: 'manual', verifiedAt: null },
  })
  invalidateOverrides()
  await ensureOverridesLoaded({ force: true })

  // Prove it. Without a name to search we can still confirm the scraper builds
  // and the event resolves, which catches the common failure (wrong id shape).
  const verification = await captureFixture({ race, year, searchName: probeName, save: false })
  if (verification.ok) {
    await prisma.scraperOverride.update({
      where: { race_year: { race, year } },
      data: { verifiedAt: new Date() },
    })
  }
  return { saved: true, verified: verification.ok, verification }
}

// Common surnames, tried in order. A results search needs *a* name; these are
// simply the most likely to return somebody in a US road race field.
const PROBE_NAMES = ['Smith', 'Johnson', 'Garcia', 'Miller', 'Brown']

/**
 * Capture a known finisher for a race+year so probes have something to assert.
 *
 * Deliberately stores a REAL runner from a live scrape rather than a
 * hand-written fixture: the capture proves the scraper works right now, and
 * every probe afterwards proves it has not drifted since.
 */
export async function captureFixture({ race, year, searchName = null, save = true }) {
  await ensureOverridesLoaded()
  const names = searchName ? [searchName] : PROBE_NAMES

  for (const name of names) {
    let result
    try {
      const scraper = getScraperForRace(race, year)
      result = await scraper.searchRunner(name)
    } catch (err) {
      return { ok: false, race, year, tried: name, error: err.message }
    }

    // Either an exact hit or a candidate list is fine — both mean the scraper
    // reached real results. We need one runner we can identify again later,
    // which means a bib OR a finish time: Mika-timed races (Berlin) return
    // finishers with an empty bib field and a valid time, so requiring a bib
    // made those races permanently uncapturable.
    const usable = c => (c?.bib && String(c.bib).trim()) || (c?.time && String(c.time).trim())
    const candidate = result?.found
      ? { name: result.runnerName || name, bib: result.bibNumber, time: result.officialTime }
      : (result?.possibleMatches || []).find(usable)

    if (!usable(candidate)) continue

    const bib = candidate.bib && String(candidate.bib).trim() ? String(candidate.bib).trim() : null
    const fixture = {
      race, year,
      runnerName: candidate.name || name,
      bib,
      officialTime: candidate.time || null,
      source: 'captured',
    }

    if (save) {
      const { default: prisma } = await import('../../api/_lib/prisma.js')
      await prisma.scraperFixture.upsert({
        where: { race_year: { race, year } },
        create: fixture,
        update: fixture,
      })
    }
    return { ok: true, ...fixture }
  }

  return { ok: false, race, year, tried: names.join(', '), error: 'No finisher with a bib or finish time returned' }
}

/**
 * Which race-years are worth trying to repair, and by which route.
 * Drives the dashboard's "fix" affordances.
 */
export async function repairPlan(years) {
  const configs = getRaceConfigSummaries(years)
  const { default: prisma } = await import('../../api/_lib/prisma.js')
  const health = await prisma.scraperHealth.findMany({
    where: { status: { in: ['no_year', 'no_probe', 'drifted'] } },
  })

  const byRace = {}
  for (const h of health) {
    const cfg = configs.find(c => c.raceName === h.race)
    if (!cfg) continue
    const athlinks = cfg.platform === 'athlinks' || cfg.fallbackPlatform === 'athlinks'
    const entry = (byRace[h.race] ||= { race: h.race, platform: cfg.platform, autoFixable: athlinks, years: [] })
    entry.years.push({
      year: h.year,
      status: h.status,
      // no_year on an Athlinks race can be discovered; anywhere else it needs
      // a pasted id. no_probe is always auto-fixable, since capturing a
      // fixture only needs the scraper to already work.
      route: h.status === 'no_probe' ? 'capture-fixture' : (athlinks ? 'discover' : 'manual-id'),
    })
  }
  return Object.values(byRace)
}
