/**
 * Observability for the public Instant Lookup endpoint.
 *
 * Three knobs:
 *   1) logLookup()  — structured one-line `[LOOKUP] …` console log per request.
 *                     Grep it in Vercel logs to see every lookup attempt.
 *   2) maybeAlertLookupError() — throttled Slack alert on upstream errors.
 *                     De-duplicated per (race+errorType) for 10 minutes so a
 *                     dead timing site doesn't spam your DMs.
 *   3) recordLookup() / getRecentLookups() — in-memory ring buffer of the
 *                     last 200 lookups. Exposed via /api/admin/lookups-recent
 *                     so you can eyeball every search at a glance without
 *                     crawling Vercel logs.
 *
 * NOTE: like the rate limiter, the ring buffer + Slack dedupe live in a
 * serverless instance's memory — they're per-instance, not global. That's
 * fine for "watch a race during launch" — different instances will each have
 * their own recent list, and the Slack throttle worst-case sends one alert
 * per instance per 10 min, which is still bounded.
 */

const RING_SIZE = 200
const ALERT_DEDUPE_MS = 10 * 60 * 1000 // 10 minutes per race+errorType

const ring = []  // newest entries pushed at the end; capped at RING_SIZE
const lastAlertAt = new Map() // key `race::errorType` -> ms timestamp

/**
 * Anonymize a name for logging — keep just first initial + last initial + length.
 * Avoids putting raw customer names in logs while still leaving enough to
 * group/sort. "Matt Hickman" -> "M.H.(11)"
 */
function anonName(name) {
  if (!name) return ''
  const parts = String(name).trim().split(/\s+/)
  const initials = parts.map(p => (p[0] || '').toUpperCase()).join('.')
  return `${initials}.(${name.length})`
}

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
    `[LOOKUP] race="${race || ''}" year=${year ?? ''} name=${anonName(name)} ` +
    `outcome=${outcome || 'unknown'} status=${status ?? ''} ms=${ms ?? ''} ` +
    `ip=${anonIp(ip)}${cached ? ' cached=true' : ''}`
  // Plain console.log so it lands in Vercel's request logs and is easy to grep.
  console.log(line)
}

/**
 * Record the lookup in the ring buffer (for the admin "recent lookups" view).
 * Same fields as logLookup; we just keep them structured.
 */
export function recordLookup({ race, year, name, outcome, ms, status, ip, cached }) {
  const entry = {
    at: Date.now(),
    race: race || null,
    year: year ?? null,
    name: anonName(name),
    outcome: outcome || 'unknown',
    status: status ?? null,
    ms: ms ?? null,
    ip: anonIp(ip),
    cached: !!cached,
  }
  ring.push(entry)
  if (ring.length > RING_SIZE) ring.shift()
}

/** Returns most-recent-first list of the last N lookups. */
export function getRecentLookups(limit = RING_SIZE) {
  return ring.slice(-limit).reverse()
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
