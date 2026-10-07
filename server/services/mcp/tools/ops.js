/**
 * Operations tools: who am I, the nightly sweep's report, scraper coverage,
 * race dates. All read.
 */
import { z } from 'zod'
import prisma from '../../../../api/_lib/prisma.js'
import { buildCatalogCoverage, coveredYears } from '../../../lib/scraperHealth.js'
import { getSupportedRaces, getVerifiedRaceDates, getRaceConfigSummaries } from '../../../scrapers/index.js'
import { NIGHTLY_REPORT_KEY } from '../../nightlySweep.js'

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
]
