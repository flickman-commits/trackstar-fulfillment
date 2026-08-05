/**
 * Reads the Marathon Monopoly sales data out of the Winning Moves master
 * content sheet and shapes it for /monopoly and /monopoly/model.
 *
 * The spreadsheet is the licensor's production template — its "Game board",
 * "Title Deeds" and "Rules" tabs belong to Winning Moves and are never written
 * or restructured by us. The sales layer lives in tabs prefixed "WEB —" (plus
 * one "INTERNAL —" tab), which the licensor can ignore.
 *
 * This module deliberately knows nothing about board geometry. The 40-space
 * layout — positions, types, colour groups, rent ladders — lives once, in
 * src/lib/monopolyBoardLayout.ts, and the client merges this sales layer onto
 * it by spaceKey. Duplicating the layout here in a second language would mean
 * two copies drifting apart the first time a space gets renamed.
 *
 * Three payloads come out, and the split between them is a security boundary,
 * not a convenience:
 *
 *   public   — statuses, partner names, copy. No money.
 *   gated    — partnership fees and unit allocations. Released only after the
 *              visitor unlocks, or arrives on a personalised link.
 *   internal — cost and margin. Served ONLY by the admin endpoint;
 *              getInternalEconomics() must never be reachable from api/public/.
 *
 * If Sheets is unreachable the public payload falls back to a committed
 * snapshot. A sales page that renders blank mid-pitch is worse than one showing
 * data an hour stale.
 */
import { readRanges } from './googleSheets.js'
import { FALLBACK } from '../data/monopolyFallback.js'

// Not sensitive — it's the file Matt already shares by link. It must also be
// shared with GOOGLE_SERVICE_ACCOUNT_EMAIL as Viewer for this to work.
const SHEET_ID = process.env.MONOPOLY_SHEET_ID || '12EZc3RaxkY0Ye_nfeQzAya-5eCO764TVe3SBbNd1Ma8'

const TAB_BOARD = 'WEB — Board'
const TAB_PACKAGES = 'WEB — Packages'
const TAB_TOKENS = 'WEB — Tokens'
const TAB_SETTINGS = 'WEB — Settings'
const TAB_INTERNAL = 'INTERNAL — Economics'

const CACHE_TTL_MS = 5 * 60 * 1000

let cache = null // { at: number, value: { publicPayload, gatedPayload } }

// ── Cell parsing ────────────────────────────────────────────────────────────

function str(cell) {
  return cell == null ? '' : String(cell).trim()
}

/** "$35,000" / "35000" / "" → number. Blank and unparseable both give null. */
function money(cell) {
  const raw = str(cell).replace(/[$,\s]/g, '')
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function int(cell) {
  const n = money(cell)
  return n == null ? null : Math.round(n)
}

function bool(cell) {
  return /^(true|yes|y|1)$/i.test(str(cell))
}

/**
 * Only https images pass. A sheet cell is user-controlled text, and letting it
 * become an arbitrary <img src> invites data: and javascript: URLs plus silent
 * third-party tracking of everyone who opens the page.
 */
function safeImageUrl(cell) {
  const raw = str(cell)
  if (!raw) return undefined
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

const VALID_STATUSES = new Set(['available', 'reserved', 'sold', 'hold', 'not_for_sale'])

function statusOf(cell) {
  const raw = str(cell).toLowerCase().replace(/[\s-]+/g, '_')
  return VALID_STATUSES.has(raw) ? raw : undefined
}

/**
 * Header row + data rows → objects keyed by normalised header, so re-ordering
 * columns in the sheet doesn't silently shift every field by one.
 */
function toObjects(rows) {
  if (!rows || rows.length < 2) return []
  const headers = rows[0].map((h) => str(h).toLowerCase().replace(/[^a-z0-9]+/g, ''))
  return rows.slice(1).map((row) => {
    const obj = {}
    headers.forEach((h, i) => {
      if (h) obj[h] = row[i]
    })
    return obj
  })
}

/** Settings values holding lists use "a | b | c" per line. */
function parseRows(value, fields) {
  if (!value) return []
  return str(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((p) => p.trim())
      const obj = {}
      fields.forEach((f, i) => {
        obj[f] = parts[i] || ''
      })
      return obj
    })
}

function lines(value) {
  return str(value)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

// ── Mapping ─────────────────────────────────────────────────────────────────

/**
 * Colour group → tier key. This is a pricing concern, not board geometry, so it
 * legitimately lives on both sides: the client mirrors it for the tier view,
 * and the server needs it to attribute committed deals to a tier without
 * knowing anything about board positions.
 *
 * Derived from the spaceKey's colour prefix ("DARK BLUE 1" → darkblue), which
 * is the same label the licensor sheet uses for its rows.
 */
const COLOR_PREFIX_TO_TIER = [
  ['DARK BLUE', 'boardwalk'],
  ['LIGHT BLUE', 'bluebrown'],
  ['BROWN', 'bluebrown'],
  ['GREEN', 'green'],
  ['YELLOW', 'yellowred'],
  ['RED', 'yellowred'],
  ['ORANGE', 'orangepink'],
  ['PINK', 'orangepink'],
]

function tierKeyForSpaceKey(spaceKey) {
  const key = spaceKey.toUpperCase()
  // Longest prefixes first so "DARK BLUE 1" never matches the "BLUE"-less
  // "LIGHT BLUE" rule or vice versa.
  const match = COLOR_PREFIX_TO_TIER.find(([prefix]) => key.startsWith(prefix))
  return match ? match[1] : undefined
}

/**
 * Sales data per space, keyed by the same spaceKey the licensor sheet uses
 * ("GREEN 3", "STATION 2"). Fields left blank in the sheet are omitted rather
 * than sent as empty strings, so the client's layout defaults win.
 */
function mapSpaceSales(rows) {
  const out = {}
  for (const row of toObjects(rows)) {
    const key = str(row.spacekey).toUpperCase()
    if (!key) continue

    const entry = {}
    const displayName = str(row.displayname)
    // The licensor sheet marks unsold targets as "Chicago Marathon [HOLD]" —
    // strip the bracket tag so it doesn't render on the board.
    if (displayName) entry.displayName = displayName.replace(/\s*\[[^\]]*\]\s*$/, '').trim()

    const status = statusOf(row.status) ?? (/\[HOLD\]/i.test(displayName) ? 'hold' : undefined)
    if (status) entry.status = status

    const tierKey = str(row.tierkey) || tierKeyForSpaceKey(key)
    if (tierKey) entry.tierKey = tierKey

    const partnerName = str(row.partnername)
    if (partnerName) entry.partnerName = partnerName

    const logoUrl = safeImageUrl(row.logourl)
    if (logoUrl) entry.logoUrl = logoUrl

    const blurb = str(row.blurb)
    if (blurb) entry.blurb = blurb

    const raceSlug = str(row.raceslug).toLowerCase()
    if (raceSlug) entry.raceSlug = raceSlug

    out[key] = entry
  }
  return out
}

/**
 * Tier definitions. `slotsTotal` / `slotsRemaining` are deliberately NOT read
 * from the sheet — the client derives them from the merged board, so a tier
 * count can never disagree with the spaces it describes. Telling a race
 * director Boardwalk is open when it isn't is the worst error this page could
 * make, and derivation makes it impossible.
 */
function mapTiers(rows) {
  return toObjects(rows)
    .filter((row) => str(row.tierkey))
    .map((row) => ({
      tierKey: str(row.tierkey),
      label: str(row.label) || str(row.tierkey),
      colorGroups: str(row.colorgroups)
        .split(/[,;]/)
        .map((g) => g.trim().toLowerCase())
        .filter(Boolean),
      features: lines(row.features),
      sortOrder: int(row.sortorder) ?? 99,
      isFounding: bool(row.isfounding),
      // Gated — stripped before the public payload leaves the server.
      fee: money(row.fee),
      unitsIncluded: int(row.unitsincluded),
      resaleValue: money(row.resalevalue),
      netCost: money(row.netcost),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

function mapTokens(rows) {
  return toObjects(rows)
    .filter((row) => str(row.name))
    .map((row) => ({
      name: str(row.name),
      status: statusOf(row.status) ?? 'available',
      imageUrl: safeImageUrl(row.imageurl),
      description: str(row.description) || undefined,
      sortOrder: int(row.sortorder) ?? 99,
      price: money(row.price), // gated
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/** The settings tab is flat key/value pairs — copy, toggles, list content. */
function mapSettings(rows) {
  const out = {}
  for (const row of rows || []) {
    const key = str(row[0])
    if (key) out[key] = str(row[1])
  }
  return out
}

/**
 * Settings keys allowed into the public payload.
 *
 * An allowlist, not a blocklist, and deliberately so: the settings tab also
 * holds the raw source for terms, brand pricing and the wholesale/retail
 * prices, all of which are gated. Passing the object through wholesale shipped
 * every one of them to un-unlocked visitors — the gate looked fine because the
 * tier objects were correctly stripped, while the same numbers went out the
 * side door as strings.
 *
 * A new gated setting added to the sheet is invisible here by default. A new
 * public one has to be named. That's the right way round.
 */
const PUBLIC_SETTING_KEYS = new Set([
  'heroEyebrow',
  'heroHeadline',
  'heroSubhead',
  'editionLabel',
  'ctaEmail',
  'ctaLabel',
  'availabilityNote',
  'footerNote',
  'boardNote',
  'tokensNote',
])

function publicSettings(settings) {
  const out = {}
  for (const key of PUBLIC_SETTING_KEYS) {
    if (settings[key]) out[key] = settings[key]
  }
  return out
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Read the sales layer and build the public + gated payloads.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.refresh] - bypass the 5-minute cache.
 * @returns {Promise<{ publicPayload: object, gatedPayload: object }>}
 */
export async function getBoardData({ refresh = false } = {}) {
  if (!refresh && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value

  let built
  try {
    const [boardRows, packageRows, tokenRows, settingRows] = await readRanges(
      [
        `'${TAB_BOARD}'!A1:Z60`,
        `'${TAB_PACKAGES}'!A1:Z40`,
        `'${TAB_TOKENS}'!A1:Z40`,
        `'${TAB_SETTINGS}'!A1:B120`,
      ],
      { spreadsheetId: SHEET_ID },
    )

    built = assemble({
      spaceSales: mapSpaceSales(boardRows),
      tiers: mapTiers(packageRows),
      tokens: mapTokens(tokenRows),
      settings: mapSettings(settingRows),
      stale: false,
    })
  } catch (err) {
    // Any Sheets problem — auth, sharing, a renamed tab — degrades to the
    // snapshot rather than failing the request.
    const message = err?.message || String(err)
    console.warn('[monopoly] sheet read failed, serving snapshot:', message)
    built = assemble({ ...FALLBACK, stale: true })
    // Kept off the public payload; the admin endpoint surfaces it so a failure
    // can be diagnosed without shell access to production logs.
    built.staleReason = classifySheetError(message)
  }

  cache = { at: Date.now(), value: built }
  return built
}

/**
 * Turn a Sheets error into something actionable.
 *
 * "stale: true" only says the read failed. The three real causes need very
 * different fixes, and telling them apart from a raw Google error message is
 * not obvious, so do it once here.
 */
function classifySheetError(message) {
  const m = String(message).toLowerCase()
  if (m.includes('missing google_service_account')) {
    return { cause: 'no_credentials', fix: 'GOOGLE_SERVICE_ACCOUNT_EMAIL / _KEY are not set in this environment.', detail: message }
  }
  if (m.includes('unable to parse range') || m.includes('not found')) {
    return { cause: 'missing_tab', fix: `The sheet is readable but a tab is missing. Expected: '${TAB_BOARD}', '${TAB_PACKAGES}', '${TAB_TOKENS}', '${TAB_SETTINGS}'.`, detail: message }
  }
  if (m.includes('permission') || m.includes('403') || m.includes('caller does not have')) {
    return { cause: 'not_shared', fix: 'Share the sheet with the service-account email as Viewer.', detail: message }
  }
  if (m.includes('decoder') || m.includes('invalid_grant') || m.includes('unsupported') || m.includes('jwt')) {
    return { cause: 'bad_key', fix: 'The private key is malformed. Its newlines were probably mangled on paste.', detail: message }
  }
  return { cause: 'unknown', fix: 'See detail.', detail: message }
}

/**
 * Split the mapped data into the two payloads.
 *
 * Gated fields are *omitted* from publicPayload, not blanked — the ungated
 * response carries no `fee` key at all, so there is nothing to un-hide in
 * devtools and nothing to leak through a serialisation mistake.
 */
function assemble({ spaceSales, tiers, tokens, settings, stale }) {
  const publicTiers = tiers.map(({ fee, unitsIncluded, resaleValue, netCost, ...rest }) => rest)
  const publicTokens = tokens.map(({ price, ...rest }) => rest)

  const brandSlots = parseRows(settings.brandSlots, ['label', 'available', 'total']).map((r) => ({
    label: r.label,
    available: Number(r.available) || 0,
    total: Number(r.total) || 0,
  }))
  const timeline = parseRows(settings.timeline, ['phase', 'window', 'note'])
  const faq = parseRows(settings.faq, ['question', 'answer'])
  const salesPlan = parseRows(settings.salesPlan, ['title', 'body'])
  // How a partner commits, and the two ways they can settle it. Public on
  // purpose: the process is the reassurance, and it costs nothing to show.
  const commitSteps = parseRows(settings.commitSteps, ['title', 'body'])
  const paymentOptions = parseRows(settings.paymentOptions, ['label', 'summary', 'body'])

  const publicPayload = {
    spaceSales,
    tiers: publicTiers,
    tokens: publicTokens,
    brandSlots,
    timeline,
    faq,
    salesPlan,
    commitSteps,
    paymentOptions,
    settings: publicSettings(settings),
    unlocked: false,
    stale: Boolean(stale),
  }

  // Keyed so the endpoint can merge without re-deriving order or identity.
  const gatedPayload = {
    tiers: Object.fromEntries(
      tiers.map((t) => [
        t.tierKey,
        { fee: t.fee, unitsIncluded: t.unitsIncluded, resaleValue: t.resaleValue, netCost: t.netCost },
      ]),
    ),
    tokens: Object.fromEntries(tokens.map((t) => [t.name, { price: t.price }])),
    brandPricing: parseRows(settings.brandPricing, ['label', 'feeLow', 'feeHigh']).map((r) => ({
      label: r.label,
      feeLow: money(r.feeLow),
      feeHigh: money(r.feeHigh),
    })),
    terms: lines(settings.terms),
    wholesalePrice: money(settings.wholesalePrice) ?? 30,
    retailPrice: money(settings.retailPrice) ?? 65,
  }

  return { publicPayload, gatedPayload }
}

/**
 * Merge the gated fields onto a public payload.
 * Called only after the request has proven it holds a valid unlock cookie.
 */
export function mergeGated(publicPayload, gatedPayload) {
  return {
    ...publicPayload,
    unlocked: true,
    tiers: publicPayload.tiers.map((t) => ({ ...t, ...(gatedPayload.tiers[t.tierKey] || {}) })),
    tokens: publicPayload.tokens.map((t) => ({ ...t, ...(gatedPayload.tokens[t.name] || {}) })),
    brandPricing: gatedPayload.brandPricing,
    terms: gatedPayload.terms,
    wholesalePrice: gatedPayload.wholesalePrice,
    retailPrice: gatedPayload.retailPrice,
  }
}

/**
 * Resolve a ?p= slug against the board, for personalised links.
 * Returns null for an unknown slug so the page quietly shows its default hero
 * rather than greeting someone by the wrong name.
 */
export function resolvePersonalization(publicPayload, slug) {
  if (!slug) return null
  const wanted = String(slug).toLowerCase().slice(0, 40)

  for (const [spaceKey, sale] of Object.entries(publicPayload.spaceSales)) {
    if (sale.raceSlug === wanted) {
      return { raceSlug: wanted, displayName: sale.displayName || spaceKey, spaceKey }
    }
  }
  return null
}

/**
 * Cost and margin assumptions for the internal deal model.
 *
 * ⚠️ Admin endpoints only. These are true unit costs — the numbers that would
 * undercut every partnership negotiation if they appeared on the partner page.
 * There is no code path from api/public/* to this function, and there must not
 * be one.
 */
export async function getInternalEconomics() {
  let internalRows = []
  try {
    ;[internalRows] = await readRanges([`'${TAB_INTERNAL}'!A1:Z60`], { spreadsheetId: SHEET_ID })
  } catch (err) {
    // The INTERNAL tab may simply not exist yet. Fall through to the quoted
    // defaults rather than failing — the model is most useful *before* the
    // sheet is filled in, when Matt is still deciding a print run.
    console.warn('[monopoly] internal tab unreadable, using defaults:', err?.message || err)
  }

  // The tab holds a print-run table (headed by a "units" column) and a set of
  // loose key/value assumptions below it. Read both off the same rows.
  const printRuns = toObjects(internalRows)
    .filter((r) => int(r.units))
    .map((r) => ({
      units: int(r.units),
      unitCost: money(r.unitcost) ?? 0,
      freight: money(r.freight) ?? undefined,
    }))
    .sort((a, b) => a.units - b.units)

  const settings = {}
  for (const row of internalRows || []) {
    const key = str(row[0])
    if (key) settings[key] = row[1]
  }

  return {
    printRuns: printRuns.length ? printRuns : DEFAULT_PRINT_RUNS,
    fixedCosts: {
      legal: money(settings.legal) ?? 10000,
      freightPerThousand: money(settings.freightPerThousand) ?? 2000,
      // Custom playing pieces are quoted per unit, not as one-off tooling, so
      // they scale with the run and change the wholesale break-even directly.
      customPiecePerUnit: money(settings.customPiecePerUnit) ?? 5,
    },
    channels: [
      { channel: 'Race expo / race store', price: 65, shippingCost: 0 },
      { channel: 'Trackstar DTC', price: 59.99, shippingCost: 10 },
      { channel: 'Amazon', price: 54.99, shippingCost: 10 },
    ],
    wholesalePrice: money(settings.wholesalePrice) ?? 30,
  }
}

/**
 * Quoted manufacturing costs by run size.
 *
 * These are the real numbers from the manufacturer, including their odd run
 * sizes (2004, 5004, 10002) which come from case-pack quantities rather than
 * round numbers. `unitCost` is the base board only; custom playing pieces add
 * a further $5.00/unit and are applied separately so the model can show what
 * that decision actually costs.
 */
const DEFAULT_PRINT_RUNS = [
  { units: 2004, unitCost: 22.5, freight: 4000 },
  { units: 3000, unitCost: 21.8, freight: 6000 },
  { units: 5004, unitCost: 19.45, freight: 9000 },
  { units: 10002, unitCost: 18.22, freight: 16000 },
]
