/**
 * Google Sheets service — reads Matt's Daily Financial Tracker
 * (https://docs.google.com/spreadsheets/d/1yKe9O8XAHXRxBPlOFKN4pMNlH-eYTsdsLNJsw6Tctwg)
 *
 * Auth: a Google Cloud service account. Two env vars are required:
 *   - GOOGLE_SERVICE_ACCOUNT_EMAIL — the service account's email
 *   - GOOGLE_SERVICE_ACCOUNT_KEY   — the private key (full PEM block, with newlines)
 *
 * The sheet itself must be shared with that service account email (Viewer access).
 *
 * The financial tracker has these tabs (relevant to the weekly debrief):
 *   - "Daily Scoreboard NEW" — top-level P&L per day
 *   - "The Levers NEW"       — full funnel + per-channel breakdown per day
 *   - "Weekly Roll-Up NEW"   — pre-aggregated weekly columns (not used; the
 *                              cron always pulls a rolling 7-day window from
 *                              the daily tabs to respect the actual Friday→
 *                              Friday cadence)
 */
import { google } from 'googleapis'

// Hardcoded — the sheet ID isn't sensitive and only one tracker exists.
// If Matt ever creates a new tracker file, change this one constant.
const FINANCIAL_TRACKER_SHEET_ID = '1yKe9O8XAHXRxBPlOFKN4pMNlH-eYTsdsLNJsw6Tctwg'

// Tab names — must match the actual sheet exactly. The "NEW" suffix is Matt's
// — he kept the originals as a backup and built new versions alongside.
const TAB_DAILY_SCOREBOARD = 'Daily Scoreboard NEW'
const TAB_LEVERS = 'The Levers NEW'

let cachedClient = null

/**
 * Build (or reuse) an authenticated Sheets API client.
 * The JWT is cached for the lifetime of the lambda — Sheets tokens last 1h
 * by default and we re-auth on cold start, so we never need to refresh.
 */
function getSheetsClient() {
  if (cachedClient) return cachedClient

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!email || !rawKey) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_KEY')
  }

  // Vercel stores env vars as single-line strings — the PEM private key has
  // literal \n sequences that need to be turned back into actual newlines.
  const privateKey = rawKey.replace(/\\n/g, '\n')

  const jwt = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })

  cachedClient = google.sheets({ version: 'v4', auth: jwt })
  return cachedClient
}

/**
 * Read a contiguous range from the financial tracker.
 * @param {string} a1 - e.g. "'Daily Scoreboard NEW'!A1:Z50"
 * @returns {Promise<any[][]>} 2D array of cell values
 */
async function readRange(a1) {
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FINANCIAL_TRACKER_SHEET_ID,
    range: a1,
    // FORMATTED_VALUE keeps "$1,234" as a string — easier for the prompt to
    // read than raw numbers. The cron passes strings directly into Claude's
    // context anyway.
    valueRenderOption: 'FORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  })
  return res.data.values || []
}

/**
 * Pull the last N days from the Daily Scoreboard + Levers tabs.
 *
 * The daily tabs start at row 4 (rows 1-3 are titles/headers in Matt's sheet).
 * We pull a generous range and let the consumer slice down to the days they
 * care about, matching on the date column (column A).
 *
 * @param {string[]} dateStrings - "YYYY-MM-DD" dates to pull (typically the
 *   last 7 days). The function returns whatever it finds for those dates.
 * @returns {Promise<{
 *   scoreboard: { headers: string[], rows: object[] },
 *   levers: { headers: string[], rows: object[] }
 * }>}
 */
export async function readWeekFromTracker(dateStrings) {
  // Read a wide-enough range to cover all columns in each tab. The actual
  // column counts are ~20 (Scoreboard) and ~35 (Levers); reading A:AZ is safe.
  const SCOREBOARD_RANGE = `'${TAB_DAILY_SCOREBOARD}'!A1:AZ400`
  const LEVERS_RANGE = `'${TAB_LEVERS}'!A1:AZ400`

  const [scoreboardRaw, leversRaw] = await Promise.all([
    readRange(SCOREBOARD_RANGE),
    readRange(LEVERS_RANGE),
  ])

  return {
    scoreboard: extractDateRows(scoreboardRaw, dateStrings, 'Daily Scoreboard'),
    levers: extractDateRows(leversRaw, dateStrings, 'The Levers'),
  }
}

/**
 * Find the header row + extract rows matching the requested dates.
 *
 * Matt's tabs have the structure:
 *   Row 1: Title ("TRACKSTAR — DAILY SCOREBOARD")
 *   Row 2: Subtitle
 *   Row 3: Headers ("Date", "Fees", "Etsy Fees", ...)
 *   Row 4+: Data (one row per day, Date in column A)
 *
 * We scan column A for cells matching one of `dateStrings`. Date strings in
 * the sheet are typically formatted as "Mon 5/19" or "Tue 5/20" (Matt uses
 * day-of-week + M/D format). We have to convert both sides to a comparable
 * shape: turn the input "YYYY-MM-DD" → "M/D" and look for that as a
 * substring of the cell.
 */
function extractDateRows(values, dateStrings, label) {
  if (!values || values.length < 4) {
    return { headers: [], rows: [], warning: `${label}: tab has fewer than 4 rows` }
  }
  const headers = (values[2] || []).map(h => String(h || '').trim())
  if (headers.length === 0 || headers[0].toLowerCase() !== 'date') {
    // Headers might be on a different row. Search rows 0-5 for one starting with "Date".
    for (let r = 0; r < Math.min(6, values.length); r++) {
      const row = values[r] || []
      if (String(row[0] || '').trim().toLowerCase() === 'date') {
        return extractWithHeaderRow(values, dateStrings, label, r)
      }
    }
    return { headers: [], rows: [], warning: `${label}: could not find header row` }
  }
  return extractWithHeaderRow(values, dateStrings, label, 2)
}

function extractWithHeaderRow(values, dateStrings, label, headerRowIdx) {
  const headers = (values[headerRowIdx] || []).map(h => String(h || '').trim())
  const wantedKeys = new Set(dateStrings.map(toShortDateKey))

  const rows = []
  for (let r = headerRowIdx + 1; r < values.length; r++) {
    const row = values[r] || []
    const dateCell = String(row[0] || '').trim()
    if (!dateCell) continue
    const key = toShortDateKey(dateCell)
    if (!wantedKeys.has(key)) continue

    // Convert row array to keyed object using the headers
    const obj = { _rawDate: dateCell }
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c] || `col_${c}`
      obj[key] = row[c] !== undefined ? row[c] : ''
    }
    rows.push(obj)
  }

  return { headers, rows, ...(rows.length === 0 && { warning: `${label}: no matching dates found in ${dateStrings.length}-day window` }) }
}

/**
 * Normalize a date representation to a "M/D" comparable key.
 * Accepts:
 *   "YYYY-MM-DD"           → "5/19"
 *   "Mon 5/19"             → "5/19"
 *   "5/19/2026"            → "5/19"
 *   "5/19"                 → "5/19"
 *   "Tue 05/19"            → "5/19"  (strips leading zeros)
 */
function toShortDateKey(s) {
  if (!s) return ''
  const str = String(s).trim()

  // ISO format: YYYY-MM-DD
  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) return `${parseInt(iso[2], 10)}/${parseInt(iso[3], 10)}`

  // Look for M/D anywhere in the string (handles "Mon 5/19", "5/19/26", etc.)
  const md = str.match(/(\d{1,2})\/(\d{1,2})/)
  if (md) return `${parseInt(md[1], 10)}/${parseInt(md[2], 10)}`

  return str.toLowerCase()
}

/**
 * Compute the last-N-days date strings (YYYY-MM-DD) anchored at "today" in ET.
 * For the Friday 4pm cron, "today" is Friday, so this returns Sat..Fri or
 * Fri..Thu depending on whether we include today. Default: exclude today
 * (last 7 *completed* days = previous Fri through current Thu).
 */
export function lastNDaysEastern(n, { includeToday = false } = {}) {
  const TZ = 'America/New_York'
  // Get "now" in NY-time as a date string
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
  const todayStr = fmt.format(now) // "YYYY-MM-DD"
  const [y, m, d] = todayStr.split('-').map(s => parseInt(s, 10))

  // Build dates by stepping back day-by-day in UTC (we just need date arithmetic,
  // and constructing from y/m/d in UTC avoids local-tz drift)
  const startOffset = includeToday ? 0 : 1
  const result = []
  for (let i = startOffset; i < startOffset + n; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d - i, 12, 0, 0))
    const yy = dt.getUTCFullYear()
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(dt.getUTCDate()).padStart(2, '0')
    result.push(`${yy}-${mm}-${dd}`)
  }
  // Return in chronological order (oldest → newest)
  return result.reverse()
}
