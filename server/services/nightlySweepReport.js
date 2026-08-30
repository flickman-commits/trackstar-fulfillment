/**
 * Turning a sweep into something readable at 7am with coffee.
 *
 * The report is ordered by what it asks of the reader, not by severity:
 * what is NEW, what got FIXED, then the standing backlog as counts. A nightly
 * message that re-lists two hundred known gaps is one nobody reads by the
 * third night, and then the one line that mattered goes past unseen.
 */

const KIND_LABELS = {
  selling_without_scraper: 'Selling with no scraper',
  scraper_drifted: 'Scraper returning wrong data',
  no_year: 'Year not configured',
  no_probe: 'Never tested',
  race_date_computed: 'Race date is a guess',
  race_run_but_not_researched: 'Race has run, order still says "not yet"',
  missing_weather: 'Past race with no weather',
  researched_over_customer_data: 'Re-researched over customer data',
  suggestions_presented_as_matches: 'Strangers offered as matches',
  pace_inconsistent_with_time: 'Pace does not match the finish time',
  approval_link_expired: 'Approval link dead on an open order',
  photo_gate_bypassed: 'Photo order in production, photo unconfirmed',
  no_runner_data: 'No runner data and nothing that will produce it',
  new_discount_code: 'New discount code seen',
}

const label = kind => KIND_LABELS[kind] || kind

/** Group findings by kind, biggest group first. */
function group(findings) {
  const by = {}
  for (const f of findings) (by[f.kind] ||= []).push(f)
  return Object.entries(by).sort((a, b) => b[1].length - a[1].length)
}

/** Slack hard-caps messages, so long lists are truncated with an honest count. */
function bullets(findings, max = 6) {
  const lines = findings.slice(0, max).map(f => `    • ${f.subject} — ${f.detail}`)
  if (findings.length > max) {
    lines.push(`    • …and ${findings.length - max} more (full list in the JSON report)`)
  }
  return lines
}

export function formatSweepForSlack(report) {
  const d = report.delta || { new: [], resolved: [], unchanged: 0, hasBaseline: false }
  const mention = process.env.SLACK_USER_ID_MATT ? `<@${process.env.SLACK_USER_ID_MATT}> ` : ''
  const secs = Math.round(report.durationMs / 1000)
  const out = []

  const headline = report.healthy
    ? ':crescent_moon: *Nightly sweep*'
    : ':rotating_light: *Nightly sweep — some checks could not run*'
  out.push(`${mention}${headline}  _(${secs}s)_`)

  // A partial sweep is not a clean one, and says so before anything else.
  if (!report.healthy) {
    out.push('')
    out.push('*Checks that failed to run:*')
    for (const f of report.failedChecks) out.push(`    • \`${f.name}\` — ${f.error}`)
    out.push('_Findings below are from the checks that did complete, so this is not a full picture._')
  }

  const high = report.findings.filter(f => f.severity === 'high')
  out.push('')
  out.push(
    `*${report.findings.length}* open findings — ` +
    `*${high.length}* high · *${d.new.length}* new tonight · *${d.resolved.length}* cleared`
  )

  if (!d.hasBaseline) {
    out.push('_First run, so everything reads as new. Tomorrow this leads with the difference._')
  }

  if (d.new.length) {
    out.push('')
    out.push('*:new: New tonight*')
    for (const [kind, items] of group(d.new)) {
      out.push(`  *${label(kind)}* (${items.length})`)
      out.push(...bullets(items))
    }
  }

  if (d.resolved.length) {
    out.push('')
    out.push(`*:white_check_mark: Cleared since last night* (${d.resolved.length})`)
    for (const fp of d.resolved.slice(0, 10)) {
      const [kind, subject] = fp.split('::')
      out.push(`    • ${label(kind)} — ${subject}`)
    }
    if (d.resolved.length > 10) out.push(`    • …and ${d.resolved.length - 10} more`)
  }

  // Standing work, as counts. Detail lives in the JSON; repeating it nightly
  // is what turns the report into wallpaper.
  const standing = report.findings.filter(f => !d.new.includes(f))
  if (standing.length) {
    out.push('')
    out.push(`*Standing backlog* (${standing.length}, unchanged)`)
    for (const [kind, items] of group(standing)) {
      out.push(`    • ${label(kind)}: ${items.length}`)
    }
  }

  const stats = report.stats || {}
  out.push('')
  out.push(
    '_' + [
      `${stats.catalog?.activeProducts ?? '?'} live products`,
      `${stats.catalog?.racesSold ?? '?'} races sold`,
      `${stats.scrapers?.racesConfigured ?? '?'} scrapers`,
      `${stats.orders?.openOrders ?? '?'} open orders`,
    ].join(' · ') + '_'
  )

  return out.join('\n')
}
