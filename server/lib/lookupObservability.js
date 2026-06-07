/**
 * Observability for the public Instant Lookup endpoint.
 *
 * Three knobs:
 *   1) logLookup()  — structured one-line `[LOOKUP] …` console log per request.
 *                     Grep it in Vercel logs to see every lookup attempt.
 *   2) maybeAlertLookupError() — throttled Slack alert on upstream errors.
 *                     De-duplicated per (race+errorType) for 10 minutes so a
 *                     dead timing site doesn't spam your DMs.
 *   3) recordLookup() / getRecentLookups() — persists each lookup to Postgres
 *                     (LookupLog table) and exposes the last 200 via
 *                     /api/admin/lookups-recent. Persists because Vercel runs
 *                     /api/public/results-lookup and /api/admin/lookups-recent
 *                     as SEPARATE serverless functions — an in-memory ring
 *                     buffer in one is invisible to the other.
 */
import prisma from '../../api/_lib/prisma.js'

const ALERT_DEDUPE_MS = 10 * 60 * 1000 // 10 minutes per race+errorType
const lastAlertAt = new Map() // key `race::errorType` -> ms timestamp

/** IPs are anonymized — useful to spot a single source spamming, but we never
 * need the raw value. Names are NOT anonymized: this is an internal dashboard
 * and the full name is what makes the log line actually debuggable.
 */
function anonIp(ip) {
  if (!ip) return ''
  // IPv4: keep first 2 octets. IPv6: keep first 2 groups. Privacy + still useful for spotting one source spamming.
  if (ip.includes('.')) return ip.split('.').slice(0, 2).join('.') + '.x.x'
  if (ip.includes(':')) return ip.split(':').slice(0, 2).join(':') + ':…'
  return ip
}

/**
 * Emit one structured log line. Always call this at the END of every lookup
 * request, success or failure.
 *
 * Outcomes:
 *   found              - returned a single confirmed match
 *   suggestions        - returned candidates (ambiguous-style)
 *   not_found          - lookup ran cleanly, runner not in results
 *   off                - PUBLIC_LOOKUP_ENABLED=false OR race not in allowlist
 *   no_scraper         - race lookup unsupported / not public-safe
 *   rate_limited       - 429 from rate limiter
 *   bad_request        - 400 (validation)
 *   upstream_error     - the scraper threw / 5xx'd
 *   cached             - served from in-process cache
 */
export function logLookup({ race, year, name, outcome, ms, status, ip, cached }) {
  const line =
    `[LOOKUP] race="${race || ''}" year=${year ?? ''} name="${name || ''}" ` +
    `outcome=${outcome || 'unknown'} status=${status ?? ''} ms=${ms ?? ''} ` +
    `ip=${anonIp(ip)}${cached ? ' cached=true' : ''}`
  // Plain console.log so it lands in Vercel's request logs and is easy to grep.
  console.log(line)
}

/**
 * Persist the lookup attempt to Postgres. Awaited so Vercel doesn't freeze
 * the serverless function with the write still in flight — fire-and-forget
 * Promises are silently dropped when the handler returns.
 *
 * Caller should `await` this before responding to the request. Returns the
 * created row's id on success, null on failure (we still log the error but
 * never throw — the user's request must not fail because observability did).
 */
export async function recordLookup({ race, year, name, outcome, ms, status, ip, cached }) {
  try {
    const row = await prisma.lookupLog.create({
      data: {
        race: race || null,
        year: year ?? null,
        // Store the actual search query — names are not anonymized so the
        // admin "Recent Lookups" panel is useful for real debugging.
        name: (name || '').slice(0, 80),
        outcome: outcome || 'unknown',
        status: status ?? null,
        ms: ms ?? null,
        ip: anonIp(ip),
        cached: !!cached,
      }
    })
    return row.id
  } catch (err) {
    console.warn('[lookupObservability] recordLookup write failed:', err.message)
    return null
  }
}

/**
 * Returns most-recent-first list of the last N lookups from the DB.
 * @param {number} limit
 * @param {string} [race] - optional canonical race filter
 */
export async function getRecentLookups(limit = 200, race = null) {
  const rows = await prisma.lookupLog.findMany({
    where: race ? { race } : undefined,
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(500, limit)),
  })
  // Shape matches the legacy in-memory ring buffer so the admin UI doesn't
  // need to change.
  return rows.map(r => ({
    at: r.createdAt.getTime(),
    race: r.race,
    year: r.year,
    name: r.name,
    outcome: r.outcome,
    status: r.status,
    ms: r.ms,
    ip: r.ip,
    cached: r.cached,
  }))
}

/**
 * Best-effort Slack alert for lookup errors. Throttled per (race+errorType).
 * Fires when the upstream timing site is down or the scraper threw — not for
 * ordinary not-founds (those are expected when shoppers typo their name).
 *
 * @param {Object} opts
 * @param {string} opts.race        - canonical race name
 * @param {number} opts.year
 * @param {string} opts.errorType   - 'upstream_error' | 'exception' | etc.
 * @param {string} [opts.detail]    - free-text detail
 */
export async function maybeAlertLookupError({ race, year, errorType, detail }) {
  const key = `${race}::${errorType}`
  const now = Date.now()
  const last = lastAlertAt.get(key) || 0
  if (now - last < ALERT_DEDUPE_MS) return
  lastAlertAt.set(key, now)

  // Prefer a dedicated webhook if you want lookup alerts in their own channel,
  // otherwise fall back to the same chain the research-service alerts use.
  const slackUrl =
    process.env.SLACK_LOOKUP_WEBHOOK_URL ||
    process.env.SLACK_DM_WEBHOOK_URL ||
    process.env.SLACK_PROOF_WEBHOOK_URL
  if (!slackUrl) return

  const text = [
    `⚠️ *Instant Lookup error:* \`${race}\` ${year}`,
    `Type: \`${errorType}\``,
    detail ? `Detail: ${detail}` : null,
    `_Throttled to one alert per race+type per 10 min._`,
  ].filter(Boolean).join('\n')

  try {
    await fetch(slackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch (err) {
    console.warn('[lookupObservability] Slack alert failed:', err.message)
  }
}
