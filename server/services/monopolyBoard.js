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
 * layout — positions, types, color groups, rent ladders — lives once, in
 * src/lib/monopolyBoardLayout.ts, and the client merges this sales layer onto
 * it by spaceKey. Duplicating the layout here in a second language would mean
 * two copies drifting apart the first time a space gets renamed.
 *
 * What this module owns is narrow, and shrinking it was deliberate. The sheet
 * used to carry tier fees and token prices too, which meant a repricing in the
 * repo sat invisible behind a tab nobody had updated: the page read $10,000
 * from src/lib/monopolyCopy.ts while this endpoint served $35,000 to anyone
 * with devtools open, and the deal model quoted the same stale figure back at
 * Matt. The ladder is a strategic decision that ships with a deploy, so it
 * lives in code and this module no longer has an opinion about it.
 *
 * So the split is:
 *
 *   here     — the sales layer only: which spaces are sold, held or open, and
 *              who holds them. The one thing that genuinely moves week to week.
 *   code     — the offer itself. Tiers and tokens in src/lib/monopolyCopy.ts.
 *   internal — cost and margin. Served ONLY by the admin endpoint;
 *              getInternalEconomics() must never be reachable from api/public/.
 *
 * If Sheets is unreachable the public payload falls back to a committed
 * snapshot. A sales page that renders blank mid-pitch is worse than one showing
 * data an hour stale.
 */
import { readRanges, listTabTitles } from './googleSheets.js'
import { FALLBACK } from '../data/monopolyFallback.js'
import { ECONOMICS } from '../data/monopolyEconomics.js'

// Not sensitive — it's the file Matt already shares by link. It must also be
// shared with GOOGLE_SERVICE_ACCOUNT_EMAIL as Viewer for this to work.
const SHEET_ID = process.env.MONOPOLY_SHEET_ID || '12EZc3RaxkY0Ye_nfeQzAya-5eCO764TVe3SBbNd1Ma8'

// Plain hyphens. Google names an imported sheet after the file, and a filename
// cannot reasonably carry an em dash, so hyphens are what actually end up in the
// spreadsheet. resolveTab() below accepts either style regardless.
const TAB_BOARD = 'WEB - Board'

const CACHE_TTL_MS = 5 * 60 * 1000

/**
 * Match a tab regardless of which dash it was typed with.
 *
 * "WEB - Board" and "WEB — Board" are indistinguishable at a glance and trivial
 * to mix, and getting it wrong reads as an empty tab rather than an error. An
 * exact title always wins, so a deliberate duplicate is never shadowed by a
 * fuzzy match.
 */
function normaliseTitle(title) {
  return String(title).toLowerCase().replace(/[\u2010-\u2015-]+/g, '-').replace(/\s+/g, ' ').trim()
}

function resolveTab(wanted, actualTitles) {
  if (actualTitles.includes(wanted)) return wanted
  const target = normaliseTitle(wanted)
  return actualTitles.find((t) => normaliseTitle(t) === target) || wanted
}

let cache = null // { at: number, value: { publicPayload } }

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
 * Header row + data rows → objects keyed by normalized header, so reordering
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

function lines(value) {
  return str(value)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

// ── Mapping ─────────────────────────────────────────────────────────────────

/**
 * Color group → tier key. This is a pricing concern, not board geometry, so it
 * legitimately lives on both sides: the client mirrors it for the tier view,
 * and the server needs it to attribute committed deals to a tier without
 * knowing anything about board positions.
 *
 * Derived from the spaceKey's color prefix ("DARK BLUE 1" → darkblue), which
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

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Read the sales layer and build the public payload.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.refresh] - bypass the 5-minute cache.
 * @returns {Promise<{ publicPayload: object, staleReason?: object }>}
 */
export async function getBoardData({ refresh = false } = {}) {
  if (!refresh && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value

  let built
  try {
    const titles = await listTabTitles(SHEET_ID)
    const [boardRows] = await readRanges([`'${resolveTab(TAB_BOARD, titles)}'!A1:Z60`], {
      spreadsheetId: SHEET_ID,
    })

    // A tab that exists but is empty reads as a *successful* API call returning
    // zero rows, so an unfilled sheet would otherwise serve an all-available
    // board and report itself as fresh. Fall back to the snapshot and say so.
    const sheetSpaceSales = mapSpaceSales(boardRows)
    const isEmpty = Object.keys(sheetSpaceSales).length === 0

    built = assemble({
      spaceSales: isEmpty ? FALLBACK.spaceSales : sheetSpaceSales,
      stale: isEmpty,
    })

    if (isEmpty) {
      built.staleReason = {
        cause: 'empty_tabs',
        fix: `The sheet is readable but '${TAB_BOARD}' has no rows, so the snapshot is filling in.`,
        detail: `Empty: ${TAB_BOARD}`,
      }
      console.warn('[monopoly] empty board tab, using snapshot')
    }
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
    return { cause: 'missing_tab', fix: `The sheet is readable but a tab is missing. Expected: '${TAB_BOARD}'.`, detail: message }
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
 * Wrap the sales layer in the shape the endpoint returns.
 *
 * There is no gated half any more. Fees are not read here, so there is no fee
 * to strip and no way for one to leak — the strongest version of the boundary
 * the two-payload split was trying to enforce.
 */
function assemble({ spaceSales, stale }) {
  return {
    publicPayload: {
      spaceSales,
      unlocked: true,
      stale: Boolean(stale),
    },
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
 * These lived in an "INTERNAL — Economics" sheet tab. They now live in
 * server/data/monopolyEconomics.js, because a manufacturing quote changes about
 * as often as the offer itself and keeping it next to the arithmetic means the
 * model cannot disagree with the quote it is based on.
 *
 * Still async so the admin endpoint's Promise.all keeps working unchanged.
 */
export async function getInternalEconomics() {
  return ECONOMICS
}
