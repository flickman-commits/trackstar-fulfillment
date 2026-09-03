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
  race_date_missing: 'Race date not verified',
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


/**
 * The finished nightly report, as Markdown, for the morning email.
 *
 * Ordered the way you would want to read it half awake: what we found, what we
 * fixed, then what still needs you. The last section is the point of the whole
 * exercise and is meant to be short - ideally empty.
 *
 * Markdown rather than Slack mrkdwn because this is written to be embedded in
 * the existing daily email rather than posted as yet another notification.
 */
export function formatSweepAsMarkdown(combined) {
  const c = combined.counts
  const out = []

  out.push('## Overnight system sweep')
  out.push('')

  if (!combined.healthy) {
    out.push('> **Some checks could not run tonight**, so this is not a full picture:')
    for (const f of combined.failedChecks) out.push(`> - \`${f.name}\` — ${f.error}`)
    out.push('')
  }

  out.push(
    `**${c.fixed} fixed** · **${c.found} new** · ` +
    `**${c.remaining} still open** (${c.remainingHigh} high)`
  )
  out.push('')

  if (c.fixed) {
    out.push('### Fixed overnight')
    for (const [kind, items] of group(combined.fixed)) {
      out.push(`- **${label(kind)}** (${items.length})`)
      for (const f of items.slice(0, 5)) out.push(`  - ${f.subject}`)
      if (items.length > 5) out.push(`  - …and ${items.length - 5} more`)
    }
    out.push('')
  }

  if (c.found) {
    out.push('### New tonight')
    for (const [kind, items] of group(combined.found)) {
      out.push(`- **${label(kind)}** (${items.length})`)
      for (const f of items.slice(0, 5)) out.push(`  - ${f.subject} — ${f.detail}`)
      if (items.length > 5) out.push(`  - …and ${items.length - 5} more`)
    }
    out.push('')
  }

  // A fix that broke something else. Rare, and never worth burying.
  if (c.introduced) {
    out.push('### ⚠️ Appeared after the fixes ran')
    for (const f of combined.introduced) out.push(`- ${label(f.kind)} — ${f.subject}: ${f.detail}`)
    out.push('')
  }

  const high = combined.remaining.filter(f => f.severity === 'high')
  out.push('### Needs you')
  if (!high.length) {
    out.push('Nothing high-severity outstanding.')
  } else {
    for (const [kind, items] of group(high)) {
      out.push(`- **${label(kind)}** (${items.length})`)
      for (const f of items.slice(0, 6)) out.push(`  - ${f.subject} — ${f.detail}`)
      if (items.length > 6) out.push(`  - …and ${items.length - 6} more`)
    }
  }
  out.push('')

  const rest = combined.remaining.filter(f => f.severity !== 'high')
  if (rest.length) {
    out.push(`<details><summary>Standing backlog (${rest.length})</summary>`)
    out.push('')
    for (const [kind, items] of group(rest)) out.push(`- ${label(kind)}: ${items.length}`)
    out.push('')
    out.push('</details>')
    out.push('')
  }

  const s = combined.stats || {}
  out.push(
    `_${s.catalog?.activeProducts ?? '?'} live products · ` +
    `${s.catalog?.racesSold ?? '?'} races sold · ` +
    `${s.scrapers?.racesConfigured ?? '?'} scrapers · ` +
    `${s.orders?.openOrders ?? '?'} open orders_`
  )

  return out.join('\n')
}


/**
 * The email-sized version.
 *
 * The full report runs to a couple of hundred findings, and a daily email is
 * not the place to read a backlog. This is the one line you want at 7am plus
 * the things that actually need a person, capped hard. Everything else stays
 * in the JSON for when you go looking.
 *
 * Deliberately says nothing when there is nothing to say. A section that
 * writes a paragraph every morning to prove it ran is a section you stop
 * reading, and then the morning it matters goes past unnoticed.
 */
export function formatSweepBrief(stored, { maxItems = 6 } = {}) {
  const c = stored.counts || {}
  const out = []

  // A sweep that could not finish leads, because the alternative is a healthy
  // looking section built from checks that never ran.
  if (stored.healthy === false) {
    out.push(`⚠️ **Sweep incomplete** — ${(stored.failedChecks || []).map(f => f.name).join(', ')} did not run.`)
    out.push('')
  }

  const parts = []
  if (c.fixed) parts.push(`**${c.fixed}** fixed overnight`)
  if (c.found) parts.push(`**${c.found}** new`)
  parts.push(`**${c.remainingHigh || 0}** need attention`)
  out.push(parts.join(' · '))

  const high = (stored.remaining || []).filter(f => f.severity === 'high')
  if (high.length) {
    out.push('')
    for (const [kind, items] of group(high).slice(0, 4)) {
      const names = items.slice(0, maxItems).map(f => f.subject).join(', ')
      const more = items.length > maxItems ? `, +${items.length - maxItems} more` : ''
      out.push(`- **${label(kind)}** — ${names}${more}`)
    }
  }

  // The agent's own narrative: what it shipped, what it deliberately left.
  if (stored.notes) {
    out.push('')
    out.push(stored.notes)
  }

  return out.join('\n')
}
