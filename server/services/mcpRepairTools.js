/**
 * The repair half of Trackstar MCP: the tools the nightly agent needs to
 * actually fix things, rather than only report on them.
 *
 * These are gated behind a SECOND credential (MCP_WRITE_TOKEN). The read tools
 * sit behind MCP_TOKEN and are meant to be on a phone; these change production
 * and are meant for one scheduled routine. Same server, two doors, because a
 * connector is reachable from every session that enables it and "my phone can
 * capture a fixture against a timing site" is not a thing anyone asked for.
 *
 * Even here, nothing destructive is exposed. There is no clearing research, no
 * merging races, no pricing, no messaging a customer. The worst these can do is
 * make some requests to timing sites and write a scraper-health row.
 *
 * ─── The sweep pair ───
 *
 * run_sweep / finish_sweep exist as a pair so the agent never has to carry a
 * sweep report through tool arguments. A full report is ~47KB of JSON and 200
 * findings; asking a model to hold that and hand it back verbatim is a way to
 * lose data and burn context for nothing. Instead run_sweep parks the "before"
 * server-side and finish_sweep picks it up, re-sweeps, and works out what
 * changed. The agent carries a summary and its own notes, which is all it
 * actually reasons about.
 */

import prisma from '../../api/_lib/prisma.js'
import { runNightlySweep, combineSweepPasses, NIGHTLY_REPORT_KEY } from './nightlySweep.js'
import { formatSweepAsMarkdown } from './nightlySweepReport.js'
import { runProbe, coveredYears } from '../lib/scraperHealth.js'
import { proposeEventIds, saveOverride, captureFixture } from '../lib/scraperRepair.js'
import { syncProductCatalog } from './shopifyProducts.js'

/** Where run_sweep parks the pass-1 report for finish_sweep to collect. */
const PENDING_SWEEP_KEY = 'nightly_sweep_pending'

/**
 * Hard cap on finish_sweep notes. Three sentences of plain prose land around
 * 350; the 2026-09-09 report was 2,400 and unreadable on a phone. Generous
 * enough that an honest note never trips it, tight enough that a bulleted
 * per-race inventory always does.
 */
const NOTES_LIMIT = 700

export const REPAIR_TOOLS = [
  {
    name: 'run_sweep',
    description:
      'Start a nightly run: sweeps the fulfillment tool and returns what it found, ' +
      'keeping the full report server-side as the "before" state. Call finish_sweep ' +
      'when the repairs are done. Returns a summary plus the findings worth acting on.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'finish_sweep',
    description:
      'End a nightly run: re-sweeps, compares against the before state from run_sweep, ' +
      'and files the report that Matt reads in his morning email. Call this even if you ' +
      'fixed nothing. Be aware of what the comparison does NOT cover: it checks scrapers, ' +
      'lookups, orders and event ids, but it never looks at race dates. Committing 56 dates ' +
      'still returns fixed:0, and a date you got wrong will not show up here as anything. ' +
      'Nothing verifies date work except you, so claim only what you actually sourced.',
    inputSchema: {
      type: 'object',
      properties: {
        notes: {
          type: 'string',
          maxLength: 700,
          description:
            'THREE SENTENCES, plain prose. No headings, no bullets, no per-race lists - this ' +
            'lands on a phone under the revenue numbers, where length buries the one line ' +
            'that mattered. Give counts, never enumerations: "verified 21 race dates across ' +
            '5 races" and stop. Races, dates and sources belong in the commit message, which ' +
            'is where git blame sends the next person. Cover what shipped, what you ' +
            'deliberately left alone, and anything you were unsure about.',
        },
      },
      required: ['notes'],
    },
  },
  {
    name: 'probe_scrapers',
    description:
      'Test scrapers against their known-finisher fixtures and update their health status. ' +
      'This is what turns a captured fixture into a live/drifted verdict - capturing alone ' +
      'changes nothing. Hits third-party timing sites, so scope it to the races you care about.',
    inputSchema: {
      type: 'object',
      properties: {
        races: { type: 'array', items: { type: 'string' }, description: 'Race names to probe. Omit to probe everything, which is slow and impolite.' },
      },
    },
  },
  {
    name: 'capture_fixture',
    description:
      'Find a real finisher for a race-year and store them as the test fixture, so the ' +
      'scraper can be verified against a person who actually ran. Follow with probe_scrapers ' +
      'to get a verdict.',
    inputSchema: {
      type: 'object',
      properties: {
        race: { type: 'string' },
        year: { type: 'number' },
        searchName: { type: 'string', description: 'Optional surname to search for.' },
      },
      required: ['race', 'year'],
    },
  },
  {
    name: 'discover_event_ids',
    description:
      'Look up missing event ids on the timing platform for a race. Set apply=true to save ' +
      'what it finds. Only works where the platform has a listing we can query (Athlinks); ' +
      'elsewhere the id has to come from a human.',
    inputSchema: {
      type: 'object',
      properties: {
        race: { type: 'string' },
        years: { type: 'array', items: { type: 'number' } },
        apply: { type: 'boolean', description: 'false previews, true saves.' },
      },
      required: ['race'],
    },
  },
  {
    name: 'sync_catalog',
    description: 'Re-read the Shopify product catalog so coverage reflects what is on sale right now.',
    inputSchema: { type: 'object', properties: {} },
  },
]

const text = value => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
})

/** Trim a sweep to what an agent reasons about; the full thing stays server-side. */
function actionable(report) {
  return {
    healthy: report.healthy,
    failedChecks: report.failedChecks,
    totalFindings: report.findings.length,
    newTonight: (report.delta?.new || []).length,
    // The standing backlog is a number, not a to-do list. Handing over 200
    // findings invites an agent to try to clear them.
    highSeverity: report.findings
      .filter(f => f.severity === 'high')
      .map(f => ({ kind: f.kind, subject: f.subject, detail: f.detail, action: f.action })),
    fixableSample: report.findings
      .filter(f => f.action === 'tier1_fixable')
      .slice(0, 25)
      .map(f => ({ kind: f.kind, subject: f.subject, platform: f.platform })),
    // Deliberately no budget numbers here. This string used to carry its own
    // ("10 fixtures, 5 race dates, 3 PRs a night") and drifted out of step with
    // the skill, which by 2026-09 asked for 50 dates and called a quiet night a
    // failed one. The agent got both every run and had no way to tell which was
    // current. One place owns the quota, and it is not this file.
    reminder:
      'Quotas and budgets live in the nightly-sweep skill - follow it, not a number you ' +
      'remember from a previous run. Two things this summary cannot show you: capturing a ' +
      'fixture does NOT clear a finding on its own (probe_scrapers has to run afterwards), ' +
      'and one clean probe is not proof, because a race that flips between live and drifted ' +
      'is flaky rather than fixed.',
  }
}

export const REPAIR_HANDLERS = {
  async run_sweep() {
    // persistBaseline false: the delta baseline should move when the night is
    // finished, not when it starts, or finish_sweep compares against itself.
    const before = await runNightlySweep({ persistBaseline: false })
    await prisma.systemConfig.upsert({
      where: { key: PENDING_SWEEP_KEY },
      create: { key: PENDING_SWEEP_KEY, value: JSON.stringify(before) },
      update: { value: JSON.stringify(before) },
    })
    return text({ startedAt: before.startedAt, ...actionable(before) })
  },

  async finish_sweep({ notes }) {
    // Asking for brevity in the skill did not hold: the 2026-09-09 run filed
    // 2.4KB of headings and per-race bullet lists into a phone-sized email.
    // Enforced here because this is the last thing standing between an agent
    // and Matt's inbox, and because a limit that only lives in prose is a
    // suggestion. Checked before the re-sweep so a retry is cheap, and the
    // pending baseline is left in place so the retry still has its before state.
    if (typeof notes === 'string' && notes.length > NOTES_LIMIT) {
      return text(
        `Not filed. Notes are ${notes.length} characters; the limit is ${NOTES_LIMIT}. ` +
        `This is a three-sentence report in a morning email, not a document: no headings, ` +
        `no bullets, no per-race lists. Give counts ("verified 21 dates across 5 races") ` +
        `and put the races, dates and sources in the commit message instead. Nothing else ` +
        `has happened yet - call finish_sweep again with a shorter version.`
      )
    }

    const row = await prisma.systemConfig.findUnique({ where: { key: PENDING_SWEEP_KEY } })
    if (!row?.value) {
      return text('No run in progress. Call run_sweep first; finish_sweep needs a before state to compare against.')
    }
    const before = JSON.parse(row.value)
    const after = await runNightlySweep({ persistBaseline: true })

    const combined = combineSweepPasses(before, after)
    const stored = {
      ...combined,
      notes: notes || null,
      markdown: formatSweepAsMarkdown(combined),
      storedAt: new Date().toISOString(),
    }
    await prisma.systemConfig.upsert({
      where: { key: NIGHTLY_REPORT_KEY },
      create: { key: NIGHTLY_REPORT_KEY, value: JSON.stringify(stored) },
      update: { value: JSON.stringify(stored) },
    })
    await prisma.systemConfig.deleteMany({ where: { key: PENDING_SWEEP_KEY } })

    return text({
      filed: true,
      counts: combined.counts,
      fixed: combined.fixed.map(f => `${f.kind}: ${f.subject}`),
      introduced: combined.introduced.map(f => `${f.kind}: ${f.subject}`),
      note: 'Filed. This is what Matt reads at 7am.',
    })
  },

  async probe_scrapers({ races } = {}) {
    const result = await runProbe({ races: Array.isArray(races) && races.length ? races : null })
    return text({ ...result, note: 'A race that flips between live and drifted across probes is flaky. Flag it; do not re-probe until it passes.' })
  },

  async capture_fixture({ race, year, searchName }) {
    const result = await captureFixture({ race, year: Number(year), searchName: searchName || null })
    return text({
      ...result,
      next: result.ok
        ? 'Fixture stored. Run probe_scrapers on this race to turn it into a verdict - capturing alone clears nothing.'
        : 'No fixture captured, so this race-year stays untested. Do not retry repeatedly.',
    })
  },

  async discover_event_ids({ race, years, apply = false }) {
    const result = await proposeEventIds({
      race,
      years: Array.isArray(years) && years.length ? years.map(Number) : coveredYears(),
      apply: Boolean(apply),
    })
    return text(result)
  },

  async sync_catalog() {
    return text(await syncProductCatalog())
  },
}

/** Exposed so the router can gate by name without knowing the handlers. */
export const REPAIR_TOOL_NAMES = new Set(REPAIR_TOOLS.map(t => t.name))
