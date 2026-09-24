/**
 * The tools Trackstar exposes over MCP.
 *
 * Why this exists at all: Claude Code's cloud sandbox refuses direct HTTPS to
 * this domain (the egress proxy 403s the CONNECT), but MCP traffic leaves via
 * mcp-proxy.anthropic.com, which is allowed. Proven in one sandbox seconds
 * apart - a curl here was rejected while an MCP call succeeded. So the nightly
 * agent reaches us through here instead.
 *
 * That was the prompt, but it is not the reason to keep it. These tools work
 * from every Claude surface: a phone asking "what's the status of order 3858",
 * the morning digest, a future payouts routine. The fulfillment tool stops
 * being a site you visit and becomes something you can ask.
 *
 * ─── Read-only, deliberately ───
 *
 * A connector is reachable from ANY session that has it enabled, including a
 * phone in a pocket. That is a much wider door than the nightly agent's scoped
 * token, so version one only reads. The repair tools the agent needs come next,
 * once the transport is proven and we have thought properly about who can
 * reach them.
 *
 * Nothing here writes. No tool clears research, edits a price, messages a
 * customer, or touches an order.
 */

import prisma from '../../api/_lib/prisma.js'
import { buildCatalogCoverage, coveredYears } from '../lib/scraperHealth.js'
import { getSupportedRaces, getVerifiedRaceDates, getRaceConfigSummaries } from '../scrapers/index.js'
import { NIGHTLY_REPORT_KEY } from './nightlySweep.js'
import { REPAIR_TOOLS, REPAIR_HANDLERS, REPAIR_TOOL_NAMES } from './mcpRepairTools.js'

/** Tool definitions, in the shape MCP's tools/list expects. */
export const TOOLS = [
  {
    name: 'connection_check',
    description:
      'Diagnostic. Reports what credential material this server actually received on ' +
      'the request, without echoing any secret. Use when other tools return "Not Found" ' +
      'to find out whether the token is reaching the server and by which channel.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'nightly_report',
    description:
      'The most recent overnight health sweep of the fulfillment tool: what was found, ' +
      'what was fixed, and what still needs a person. Use this to answer "is anything ' +
      'wrong with fulfillment" or "what did the nightly sweep find".',
    inputSchema: {
      type: 'object',
      properties: {
        full: {
          type: 'boolean',
          description: 'Return every finding rather than just the summary and high-severity ones.',
        },
      },
    },
  },
  {
    name: 'find_order',
    description:
      'Look up a fulfillment order by its Shopify order number (e.g. "3858") and return ' +
      'the runner, race, research status, and what would go on the poster.',
    inputSchema: {
      type: 'object',
      properties: {
        orderNumber: { type: 'string', description: 'Shopify order number, with or without the # prefix.' },
      },
      required: ['orderNumber'],
    },
  },
  {
    name: 'scraper_coverage',
    description:
      'Which races we sell, which have a working results scraper, and which do not. ' +
      'Use for "what races are we selling without a scraper" or "how is our coverage".',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'race_dates',
    description:
      'Race dates we hold, and whether each is VERIFIED (looked up from a source) or ' +
      'COMPUTED (guessed from a rule like "third Sunday of August"). Computed dates are ' +
      'the ones that print wrong weather on a poster when a race moves.',
    inputSchema: {
      type: 'object',
      properties: {
        race: { type: 'string', description: 'Optional: a single race name to check.' },
      },
    },
  },
]

/** MCP wants tool results as content blocks; everything here returns text. */
const text = value => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
})

/**
 * What arrived, and through which door.
 *
 * Every other tool answering "Not Found" tells you only that the token did not
 * match - not whether one was sent at all, nor whether it came by header or by
 * path. Guessing between those is what this replaces.
 *
 * Deliberately echoes NO secret: presence, length and channel are enough to
 * tell "nothing arrived" from "something arrived and is wrong", which is the
 * whole question.
 */
function connectionCheck(context = {}) {
  const { presented, headerNames = [], viaPath } = context
  const expected = process.env.MCP_TOKEN
  return text({
    tokenReachedServer: Boolean(presented),
    channel: presented ? (viaPath ? 'url path' : 'header') : 'none',
    presentedLength: presented ? String(presented).length : 0,
    expectedLength: expected ? String(expected).length : 0,
    matches: Boolean(expected && presented && String(presented) === String(expected)),
    serverHasTokenConfigured: Boolean(expected),
    // Names only. A value here would put a secret in a transcript.
    headersSeen: headerNames,
    hint: presented
      ? 'A token arrived. If matches is false, the value is wrong or truncated.'
      : 'No token arrived. The connector is not sending one - check the URL has the token in its path, or that the header saved.',
  })
}

const HANDLERS = {
  async nightly_report({ full = false } = {}) {
    const row = await prisma.systemConfig.findUnique({ where: { key: NIGHTLY_REPORT_KEY } })
    if (!row?.value) return text('No nightly sweep has been stored yet.')
    const r = JSON.parse(row.value)

    const base = {
      storedAt: r.storedAt,
      healthy: r.healthy,
      counts: r.counts,
      notes: r.notes || null,
      needsAttention: (r.remaining || [])
        .filter(f => f.severity === 'high')
        .map(f => ({ kind: f.kind, subject: f.subject, detail: f.detail })),
    }
    return text(full ? { ...base, allFindings: r.remaining } : base)
  },

  async find_order({ orderNumber }) {
    const wanted = String(orderNumber || '').replace(/^#/, '').trim()
    if (!wanted) return text('Give me an order number.')

    // The number a human quotes is the Shopify DISPLAY name ("3858"), which
    // lives in shopifyOrderData.name. The internal orderNumber is a long id
    // like 7423650758939-0.
    //
    // Substring matching across those ids is actively wrong, not merely loose:
    // asking for 3858 matched 7060385857819 because the digits appear inside
    // it, and missed the real order 3858 entirely because its display name is
    // in JSON. Exact matches only, across all three places the number can be.
    const orders = await prisma.order.findMany({
      where: {
        OR: [
          { shopifyOrderData: { path: ['name'], equals: wanted } },
          { shopifyOrderData: { path: ['name'], equals: `#${wanted}` } },
          { parentOrderNumber: wanted },
          { orderNumber: wanted },
          // A whole Shopify order can be several line items, each stored as
          // "<parent>-<index>"; anchoring keeps this from matching mid-number.
          { orderNumber: { startsWith: `${wanted}-` } },
        ],
      },
      include: { runnerResearch: { orderBy: { id: 'desc' }, take: 1 } },
      take: 10,
    })
    if (!orders.length) return text(`No order matching "${wanted}".`)

    return text(orders.map(o => {
      const r = o.runnerResearch[0]
      return {
        orderNumber: o.orderNumber,
        shopifyName: o.shopifyOrderData?.name ?? null,
        type: o.trackstarOrderType,
        status: o.status,
        designStatus: o.designStatus,
        runner: o.runnerName,
        race: `${o.raceName} ${o.raceYear}`,
        // What would actually print: research first, the customer's own
        // numbers second. Same precedence the dashboard uses.
        bib: r?.bibNumber || o.customerBib || null,
        time: r?.officialTime || o.customerFinishTime || null,
        pace: r?.officialPace || o.customerPace || null,
        researchStatus: r?.researchStatus ?? '(never researched)',
        researchSource: r?.source ?? null,
        lookupOutcome: o.lookupOutcome,
      }
    }))
  },

  async scraper_coverage() {
    const catalog = await buildCatalogCoverage()
    return text({
      activeProducts: catalog.products,
      racesSoldWithAScraper: catalog.racesSold.length,
      scrapersConfigured: getSupportedRaces().length,
      sellingWithNoScraper: catalog.needsScraper.map(p => p.title),
      note:
        'A race here with no scraper means shoppers on that product page only get ' +
        'manual entry, and fulfillment has to research every order by hand.',
    })
  },

  async race_dates({ race } = {}) {
    const years = coveredYears()
    const verified = getVerifiedRaceDates()
    const configs = getRaceConfigSummaries(years)
      .filter(c => !race || c.raceName.toLowerCase().includes(String(race).toLowerCase()))

    if (!configs.length) return text(`No race config matching "${race}".`)

    return text(configs.map(c => {
      const pinned = verified[c.raceName] || {}
      return {
        race: c.raceName,
        platform: c.platform,
        verified: Object.fromEntries(Object.entries(pinned).filter(([y]) => years.includes(Number(y)))),
        computed: years.filter(y => !pinned[y]),
      }
    }))
  },
}

/** Run a tool by name. Throws on an unknown name so the caller can answer -32602. */
export async function callTool(name, args = {}, context = {}) {
  if (name === 'connection_check') return connectionCheck(context)
  const handler = HANDLERS[name] || REPAIR_HANDLERS[name]
  if (!handler) throw new Error(`Unknown tool: ${name}`)
  return await handler(args || {})
}

/** Tools that answer without a token. Only the diagnostic; never any data. */
export const OPEN_TOOLS = new Set(['connection_check'])

/**
 * Which credential a tool needs.
 *
 * Reads are meant to be on a phone. Repairs change production and are meant for
 * one scheduled routine, so they want their own token - a connector is
 * reachable from every session that enables it, and "my phone can hit a timing
 * site" is not a thing anyone asked for.
 */
export function toolTier(name) {
  if (OPEN_TOOLS.has(name)) return 'open'
  return REPAIR_TOOL_NAMES.has(name) ? 'repair' : 'read'
}

/** The tool list a caller may see, given what they presented. */
export function toolsFor(tier) {
  return tier === 'repair' ? [...TOOLS, ...REPAIR_TOOLS] : TOOLS
}
