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
  // Failures that already fired a Slack alert and would otherwise scroll away.
  lookup_failing: 'Storefront lookups failing',
  year_not_configured: 'Year missing from the scraper config',
}

const label = kind => KIND_LABELS[kind] || kind

/**
 * Findings the agent has no tool for, whatever tier the check assigned them.
 *
 * The `action` field describes how hard a finding is to fix, not who can fix
 * it, and the two came apart: an expired approval link is labelled tier0_auto
 * because resending is trivial, but there is no resend endpoint the agent can
 * reach, so it sat in "the robot will handle it" while a paying customer
 * waited. Anything here needs a person regardless of tier.
 */
const NO_TOOL_KINDS = new Set([
  'approval_link_expired',
  'missing_weather',
  'researched_over_customer_data',
  'suggestions_presented_as_matches',
  'photo_gate_bypassed',
  'no_runner_data',
  'race_run_but_not_researched',
  'pace_inconsistent_with_time',
])

/**
 * How long the agent gets before an item it owns becomes Matt's problem.
 *
 * A finding the agent can theoretically fix but has not fixed in a week is not
 * pending, it is stuck — the tool is missing, the site is blocking us, or it
 * keeps getting skipped for easier work. Leaving it in the agent's column
 * forever is how a backlog item becomes permanent without anyone deciding it
 * should be.
 */
const ESCALATE_AFTER_NIGHTS = 7

/** Who has to act: 'matt' if only a person can move it, otherwise 'claude'. */
export function owner(f) {
  if (f.action === 'tier2_flag') return 'matt'
  if (NO_TOOL_KINDS.has(f.kind)) return 'matt'
  if ((f.nightsOpen || 0) >= ESCALATE_AFTER_NIGHTS) return 'matt'
  return 'claude'
}

/**
 * Kinds where a paid order is already waiting.
 *
 * Everything in NEEDS YOU is high severity, so severity cannot order it. What
 * separates these is that someone has paid and is waiting: a print stalled on
 * a dead approval link costs money today, while a product selling without a
 * scraper degrades an experience that still completes. Ordering by group size
 * put three stalled orders below a scraper gap nobody is blocked on.
 */
const ORDER_KINDS = new Set([
  'approval_link_expired',
  'researched_over_customer_data',
  'race_run_but_not_researched',
  'no_runner_data',
  'photo_gate_bypassed',
  'suggestions_presented_as_matches',
  'pace_inconsistent_with_time',
])

/**
 * Backlog that is SUPPOSED to sit — the nightly quota works through it.
 *
 * An untested race-year ageing for five nights is the queue behaving normally;
 * flagging it as stalling would fire on a hundred rows and train the reader to
 * skip the line that means something. Stalling is only interesting for work
 * that was meant to be finished and was not.
 */
const EXPECTED_BACKLOG_KINDS = new Set(['no_probe', 'race_date_missing', 'no_year'])

/** "new tonight" / "8 nights" — the age that turns a noun into a decision. */
function age(f) {
  const n = f.nightsOpen
  if (n === undefined || n === null) return null
  if (n <= 0) return 'new tonight'
  return `${n} night${n === 1 ? '' : 's'}`
}

/** Oldest first: the thing that has been ignored longest is the real question. */
function byAgeDesc(a, b) {
  return (b.nightsOpen || 0) - (a.nightsOpen || 0)
}

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
export function formatSweepBrief(stored, { maxItems = 3 } = {}) {
  const c = stored.counts || {}
  const remaining = stored.remaining || []
  const out = []

  // A sweep that could not finish leads, because the alternative is a healthy
  // looking section built from checks that never ran.
  if (stored.healthy === false) {
    out.push(`⚠️ **Sweep incomplete** — ${(stored.failedChecks || []).map(f => f.name).join(', ')} did not run.`)
    out.push('')
  }

  /* ── 1. NEEDS YOU ───────────────────────────────────────────────────────
     Only what a person has to decide. This block earns the whole report, and
     it is meant to be empty most mornings — "nothing needs you" is the most
     useful thing it can say, and it can only mean that if the block stays
     honest about what the agent genuinely cannot do. */
  const mine = remaining.filter(f => owner(f) === 'matt')
  out.push(`**NEEDS YOU** ${mine.length ? `(${mine.length})` : '— nothing'}`)
  if (mine.length) {
    // Money first, then longest-ignored. Never by group size.
    const groups = group(mine).sort((a, b) => {
      const money = Number(ORDER_KINDS.has(b[0])) - Number(ORDER_KINDS.has(a[0]))
      if (money) return money
      return ([...b[1]].sort(byAgeDesc)[0].nightsOpen || 0)
        - ([...a[1]].sort(byAgeDesc)[0].nightsOpen || 0)
    })
    for (const [kind, items] of groups.slice(0, 4)) {
      const stamp = age([...items].sort(byAgeDesc)[0])
      const names = items.slice(0, maxItems).map(f => f.subject).join(', ')
      const more = items.length > maxItems ? `, +${items.length - maxItems}` : ''
      out.push(`- **${label(kind)}** (${items.length})${stamp ? ` · ${stamp}` : ''}`)
      out.push(`  ${names}${more}`)
    }
    const shown = groups.slice(0, 4).reduce((n, [, i]) => n + i.length, 0)
    if (mine.length > shown) out.push(`- …and ${mine.length - shown} more`)
  }

  /* ── 2. SHIPPED ─────────────────────────────────────────────────────────
     What actually changed, as the re-sweep measured it — never as the agent
     described it. Race-date commits do not appear here: the sweep reads the
     deployed config, so a date committed tonight only clears its finding on
     tomorrow's run. They land in "cleared since last night" instead, which is
     why that line is kept separate rather than added to this one. */
  out.push('')
  out.push('**SHIPPED**')
  const cleared = (stored.delta?.resolved || []).length
  out.push(`- ${c.fixed || 0} findings fixed and re-checked this run`)
  if (cleared) out.push(`- ${cleared} cleared since last night (includes work that deployed after it)`)
  if (c.introduced) out.push(`- ⚠️ ${c.introduced} new problem(s) appeared after the fixes ran`)

  /* ── 3. IN PROGRESS ─────────────────────────────────────────────────────
     The agent's own queue. No action implied — this exists so the backlog has
     a visible direction, and so anything the agent is quietly failing at
     surfaces before it ages into the NEEDS YOU block above. */
  out.push('')
  out.push('**IN PROGRESS**')
  const theirs = remaining.filter(f => owner(f) === 'claude')
  out.push(`- ${theirs.length} in the agent's queue · ${c.found || 0} new tonight`)

  // Aging but not yet escalated: the early warning for a stuck item.
  const stalling = theirs
    .filter(f => !EXPECTED_BACKLOG_KINDS.has(f.kind))
    .filter(f => (f.nightsOpen || 0) >= Math.floor(ESCALATE_AFTER_NIGHTS / 2))
    .sort(byAgeDesc)
    .slice(0, 2)
  for (const f of stalling) {
    out.push(`- Stalling: ${label(f.kind)} — ${f.subject} · ${age(f)}`)
  }

  // The agent's own words, marked as such. Kept last and kept labelled: this
  // is the one part of the report nothing verifies, and a claim that reads
  // like a measurement is how a bad night gets reported as a good one.
  if (stored.notes) {
    out.push('')
    out.push(`_Agent's note (unverified): ${stored.notes}_`)
  }

  return out.join('\n')
}
