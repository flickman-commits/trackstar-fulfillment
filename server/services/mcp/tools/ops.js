/**
 * Operations tools: who am I, the nightly sweep's report, scraper coverage,
 * race dates. All read.
 */
import { z } from 'zod'
import prisma from '../../../../api/_lib/prisma.js'
import { ToolError } from '../server.js'
import { buildCatalogCoverage, coveredYears } from '../../../lib/scraperHealth.js'
import { getSupportedRaces, getVerifiedRaceDates, getRaceConfigSummaries } from '../../../scrapers/index.js'
import { NIGHTLY_REPORT_KEY } from '../../nightlySweep.js'
import { verificationOverview, setRaceDate, computeRaceWeather } from '../../../domain/races/verification.js'

export const opsTools = [
  {
    name: 'connection_check',
    title: 'Connection check',
    description: 'Who this key is and what it may do: its name, the person it acts as, its scopes. Use first if another tool refuses.',
    scope: 'read',
    readOnly: true,
    input: {},
    async handler(_args, { principal }) {
      return {
        key: principal.name,
        actsAs: principal.user ? `${principal.user.firstName} ${principal.user.lastName || ''}`.trim() : 'a service key (no person)',
        role: principal.role,
        scopes: [...principal.scopes],
        legacyToken: principal.legacy,
        hint: principal.legacy ? 'This is one of the old env tokens. Mint a real key in Settings > Admin > API Keys and retire it.' : undefined,
      }
    },
  },
  {
    name: 'nightly_report',
    title: 'Nightly report',
    description: 'The most recent overnight health sweep: what was found, fixed, and still needs a person. Answers "is anything wrong with fulfillment".',
    scope: 'read',
    readOnly: true,
    input: { full: z.boolean().optional().describe('Every finding, not just the summary and the high-severity ones.') },
    async handler({ full = false }) {
      const row = await prisma.systemConfig.findUnique({ where: { key: NIGHTLY_REPORT_KEY } })
      if (!row?.value) return { stored: false, message: 'No nightly sweep has been stored yet.' }
      const r = JSON.parse(row.value)
      const base = {
        storedAt: r.storedAt,
        healthy: r.healthy,
        counts: r.counts,
        notes: r.notes || null,
        needsAttention: (r.remaining || []).filter(f => f.severity === 'high').map(f => ({ kind: f.kind, subject: f.subject, detail: f.detail })),
      }
      return full ? { ...base, allFindings: (r.remaining || []).slice(0, 200) } : base
    },
  },
  {
    name: 'scraper_coverage',
    title: 'Scraper coverage',
    description: 'Which races we sell, which have a working results scraper, and which do not.',
    scope: 'read',
    readOnly: true,
    input: {},
    async handler() {
      const catalog = await buildCatalogCoverage()
      return {
        activeProducts: catalog.products,
        racesSoldWithAScraper: catalog.racesSold.length,
        scrapersConfigured: getSupportedRaces().length,
        sellingWithNoScraper: catalog.needsScraper.map(p => p.title),
      }
    },
  },
  {
    name: 'race_dates',
    title: 'Race dates',
    description: 'Race dates we hold, and whether each is verified (looked up) or computed (guessed from a rule). Computed dates print wrong weather when a race moves.',
    scope: 'read',
    readOnly: true,
    input: { race: z.string().max(80).optional().describe('A race name to narrow to.') },
    async handler({ race } = {}) {
      const years = coveredYears()
      const verified = getVerifiedRaceDates()
      const configs = getRaceConfigSummaries(years)
        .filter(c => !race || c.raceName.toLowerCase().includes(String(race).toLowerCase()))
      return {
        races: configs.map(c => {
          const pinned = verified[c.raceName] || {}
          return {
            race: c.raceName,
            platform: c.platform,
            verified: Object.fromEntries(Object.entries(pinned).filter(([y]) => years.includes(Number(y)))),
            computed: years.filter(y => !pinned[y]),
          }
        }),
      }
    },
  },
  {
    name: 'race_data_blockers',
    title: 'Race data blockers',
    description: 'Race years with open orders whose date or weather is not fit to print: no date, a date with no source on file, no location, or weather not yet computed. Automated prints wait on these. Fix dates with verify_race_date.',
    scope: 'read',
    readOnly: true,
    input: {},
    async handler() {
      const { races, missingRaceRows } = await verificationOverview()
      const blocked = races.filter(r => r.openOrders > 0 && r.blockers.length).sort((a, b) => b.openOrders - a.openOrders)
      return {
        blocked: blocked.map(r => ({ raceId: r.id, race: r.raceName, year: r.year, openOrders: r.openOrders, date: r.raceDate ? r.raceDate.toISOString().slice(0, 10) : null, dateSource: r.raceDateSource, location: r.location, blockers: r.blockers })),
        noRaceRow: missingRaceRows,
      }
    },
  },
  {
    name: 'verify_race_date',
    title: 'Verify a race date',
    description: 'Record a race year\'s date with the evidence it was confirmed against: the official site, the results page, or a race-day report. Never a date worked out from a pattern. Also sets the location if the race has none and computes the weather for the date. Changing a date that has already been printed needs a reason.',
    scope: 'write',
    adminOnly: true,
    readOnly: false,
    input: {
      raceId: z.number().int().describe('The Race row id, from race_data_blockers'),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD, the day the event named by the race was run'),
      sourceUrl: z.string().url().describe('Where it was confirmed'),
      evidence: z.string().min(5).max(500).describe('What the source says, in a sentence'),
      location: z.string().max(80).optional().describe('City, ST for the weather, if the race has none'),
      reason: z.string().max(300).optional().describe('Required when changing a date that has already been printed'),
    },
    async handler({ raceId, date, sourceUrl, evidence, location, reason }, { principal }) {
      // Dates are printed on every order for the race, so recording one is an admin call.
      if (principal?.role !== 'admin' || !principal?.user) throw new ToolError('Only an admin can verify a race date.')
      const by = principal?.user ? principal.user.id : (principal?.name || 'nightly')
      const race = await setRaceDate({ raceId, date, source: 'researched', sourceUrl, evidence, by, reason, actor: principal?.user || null })
      if (location && !race.location) await prisma.race.update({ where: { id: race.id }, data: { location: String(location).slice(0, 80) } })
      let weather = null, weatherError = null
      try { const w = await computeRaceWeather(race.id, { by, reason, actor: principal?.user || null }); weather = `${w.weatherCondition} ${w.weatherTemp}` }
      catch (e) {
        console.error(`[mcp] verify_race_date: weather for race ${race.id} failed:`, e)
        weatherError = 'The date is saved, but the weather could not be computed. Check the race has a location, then try confirm_weather or ask Matt to check the logs.'
      }
      return { summary: `Verified ${race.raceName} ${race.year} as ${date} (${sourceUrl})${weather ? `; weather ${weather}` : ''}`, raceId: race.id, date, source: 'researched', weather, weatherError }
    },
  },
]

