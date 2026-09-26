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
  scraper_broken: 'Scraper erroring',
  no_year: 'Year not configured',
  no_probe: 'Never tested',
  race_date_missing: 'Race date not verified',
  race_run_but_not_researched: 'Race has run, order still says "not yet"',
  missing_weather: 'Past race with no weather',
  researched_over_customer_data: 'Re-researched over customer data',
  suggestions_presented_as_matches: 'Strangers offered as matches',
  pace_inconsistent_with_time: 'Pace does not match the finish time',
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
 * it, and the two came apart: a finding labelled tier0_auto with no endpoint
 * the agent can reach sat in "the robot will handle it" while a paying
 * customer waited. Anything here needs a person regardless of tier.
 */
const NO_TOOL_KINDS = new Set([
  'missing_weather',
  'researched_over_customer_data',
  'suggestions_presented_as_matches',
  'photo_gate_bypassed',
  'no_runner_data',
  'race_run_but_not_researched',
  'pace_inconsistent_with_time',
  'new_discount_code',
])

/**
 * Repairs the agent owns, with a grace period before they become Matt's.
 *
 * Since 2026-09-27 the agent can see timing sites (trace_scraper), test a code
 * change on a preview (probe_preview) and save event ids, so a broken scraper
 * is its job rather than a flag. It gets a few nights; a repair it has not
 * landed by then is stuck, and a stuck repair belongs in front of a person.
 * The clock starts at that date for findings older than it, so a scraper that
 * was broken for weeks before the tools existed does not land on Matt the
 * first morning the agent is allowed to touch it.
 */
const AGENT_REPAIR_KINDS = new Set([
  'scraper_drifted', 'scraper_broken', 'year_not_configured', 'lookup_failing',
])
const REPAIR_TOOLS_SINCE = '2026-09-27T00:00:00Z'
const REPAIR_GRACE_NIGHTS = 3

/**
 * Backlog that is SUPPOSED to sit — the nightly quota works through it.
 *
 * An untested race-year ageing for five nights is the queue behaving normally;
 * escalating it put 75 "never tested" rows in front of Matt, which is how the
 * report became something he stopped reading. These never escalate.
 */
const EXPECTED_BACKLOG_KINDS = new Set(['no_probe', 'race_date_missing', 'no_year'])

/**
 * Standing facts about the catalog, not problems to solve tonight: a product
 * sold with manual entry works, just less well. Worth a line the night one
 * appears, and a weekly look after that, not a daily one.
 */
const QUIET_AFTER_FIRST_NIGHT = new Set(['selling_without_scraper'])

/** Everything else the agent owns escalates after a week. */
const ESCALATE_AFTER_NIGHTS = 7

/** Nights the agent has had the tools to fix this finding. */
function nightsOwned(f) {
  const seen = Date.parse(f.firstSeenAt || '') || Date.now()
  const from = Math.max(seen, Date.parse(REPAIR_TOOLS_SINCE))
  return Math.max(0, Math.floor((Date.now() - from) / 86400000))
}

/**
 * Who has to act: 'matt' if only a person can move it, 'claude' if it is the
 * agent's queue, 'quiet' if it is a known standing fact that needs nobody.
 */
export function owner(f) {
  if (NO_TOOL_KINDS.has(f.kind)) return 'matt'
  if (EXPECTED_BACKLOG_KINDS.has(f.kind)) return 'claude'
  if (QUIET_AFTER_FIRST_NIGHT.has(f.kind)) return (f.nightsOpen || 0) <= 0 ? 'matt' : 'quiet'
  if (AGENT_REPAIR_KINDS.has(f.kind)) return nightsOwned(f) >= REPAIR_GRACE_NIGHTS ? 'matt' : 'claude'
  if (f.action === 'tier2_flag') return 'matt'
  if ((f.nightsOpen || 0) >= ESCALATE_AFTER_NIGHTS) return 'matt'
  return 'claude'
}

/**
 * Kinds where a paid order is already waiting.
 *
 * What separates these is that someone has paid and is waiting: a print
 * stalled on an order problem costs money today, while a product selling
 * without a scraper degrades an experience that still completes. They sort to
 * the top of "Things that need you".
 */
const ORDER_KINDS = new Set([
  'researched_over_customer_data',
  'race_run_but_not_researched',
  'no_runner_data',
  'photo_gate_bypassed',
  'suggestions_presented_as_matches',
  'pace_inconsistent_with_time',
])

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


/** "A, B, C and 4 more" */
function listOf(items, max = 3) {
  const names = items.slice(0, max).map(f => f.subject)
  const more = items.length - names.length
  if (!more) return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
  return `${names.join(', ')} and ${more} more`
}

const plural = (n, one, many) => (n === 1 ? one : many)

/**
 * One plain sentence per kind of problem, written for someone who does not
 * know the internals. Grouped, so three stuck orders are one line, not three.
 */
function needsYouLine(kind, items) {
  const n = items.length
  const list = listOf(items)
  const oldest = Math.max(...items.map(f => f.nightsOpen || 0))
  const since = oldest > 1 ? ` (${oldest} nights)` : ''
  switch (kind) {
    case 'no_runner_data':
      return `${n} ${plural(n, 'order has', 'orders have')} no runner time and nothing will find one: ${list}. Ask the customer for their time or bib.${since}`
    case 'researched_over_customer_data':
      return `${n} ${plural(n, 'order was', 'orders were')} looked up even though the customer gave their time: ${list}. Use the customer's numbers.${since}`
    case 'suggestions_presented_as_matches':
      return `${n} ${plural(n, 'order shows', 'orders show')} strangers as possible matches: ${list}. Don't accept one without checking.${since}`
    case 'pace_inconsistent_with_time':
      return `${n} ${plural(n, 'order has', 'orders have')} a pace that doesn't match the finish time: ${list}.${since}`
    case 'photo_gate_bypassed':
      return `${n} photo ${plural(n, 'order went', 'orders went')} to production without the photo confirmed: ${list}.${since}`
    case 'race_run_but_not_researched':
      return `${n} ${plural(n, 'order still says', 'orders still say')} the race hasn't run: ${list}.${since}`
    case 'missing_weather':
      return `${n} past ${plural(n, 'race has', 'races have')} no weather on file: ${list}.${since}`
    case 'scraper_drifted':
    case 'scraper_broken':
      return `I couldn't fix ${list} after ${REPAIR_GRACE_NIGHTS}+ nights of trying. ${plural(n, 'It needs', 'They need')} a look.`
    case 'year_not_configured':
      return `${list} ${plural(n, 'needs', 'need')} an event id I couldn't find, and customers are waiting on ${plural(n, 'it', 'them')}.${since}`
    case 'lookup_failing':
      return `Shoppers' lookups keep failing for ${list}, and I couldn't get ${plural(n, 'it', 'them')} working.${since}`
    case 'selling_without_scraper':
      return `New ${plural(n, 'product', 'products')} on sale with no scraper (shoppers type their time by hand): ${list}.`
    case 'new_discount_code':
      return `New discount ${plural(n, 'code', 'codes')} ${list}. If it's a partner, the print may need a co-branded version.`
    default:
      return `${label(kind)}: ${list}.${since}`
  }
}

/**
 * The morning email.
 *
 * Three blocks, in the order a person wants them:
 *
 *   Things fixed          — only what production confirmed after the run:
 *                           repairs the agent claimed AND that re-probed live,
 *                           plus counts of findings the re-sweep saw clear.
 *   Things that need you  — one sentence per kind of problem, orders first,
 *                           capped at five. "Nothing, I handled everything"
 *                           when empty, which is the point of the whole report.
 *   Scrapers              — one line of health for every race we scrape.
 *
 * Nothing in "Things fixed" is the agent's word alone. Its sentences only
 * appear once verifyFixes (mcpRepairTools.js) has checked them against
 * production; a claim that failed that check is shown as not confirmed.
 */
export function formatSweepBrief(stored) {
  const remaining = stored.remaining || []
  const out = []

  // A sweep that could not finish leads, because the alternative is a healthy
  // looking email built from checks that never ran.
  if (stored.healthy === false) {
    out.push(`⚠️ **Last night's check didn't finish** (${(stored.failedChecks || []).map(f => f.name).join(', ')}), so this isn't the full picture.`)
    out.push('')
  }

  /* ── Things fixed ── */
  const fixedLines = []
  for (const f of stored.verifiedFixes || []) fixedLines.push(f.summary)

  // Cleared by the re-sweep without a repair sentence attached: tested
  // race-years, ids found, orders unstuck. Counted, not listed.
  const coveredByFixes = new Set((stored.verifiedFixes || []).flatMap(f => f.years.map(y => `${f.race} ${y}`)))
  // A race-year whose test came back wrong leaves "never tested" and turns up
  // as a broken scraper instead; that is not a fix and is not counted as one.
  const nowBroken = new Set(remaining
    .filter(f => f.kind === 'scraper_drifted' || f.kind === 'scraper_broken')
    .map(f => f.subject))
  const cleared = (stored.fixed || []).filter(f => !coveredByFixes.has(f.subject) && !nowBroken.has(f.subject))
  const tested = cleared.filter(f => f.kind === 'no_probe').length
  const ids = cleared.filter(f => f.kind === 'no_year' || f.kind === 'year_not_configured').length
  const other = cleared.length - tested - ids
  if (tested) fixedLines.push(`Tested ${tested} more ${plural(tested, 'race-year', 'race-years')} against a real finisher; all working.`)
  if (ids) fixedLines.push(`Added ${ids} missing event ${plural(ids, 'id', 'ids')}, checked against a real finisher.`)
  if (other) fixedLines.push(`${other} other ${plural(other, 'problem', 'problems')} cleared and re-checked.`)

  out.push('**Things fixed**')
  if (fixedLines.length) for (const line of fixedLines) out.push(`- ${line}`)
  else out.push('- Nothing tonight.')
  for (const f of stored.unverifiedFixes || []) {
    out.push(`- Tried ${f.race} ${f.years.join(', ')} but couldn't confirm it works yet (${f.reason}). I'll keep at it.`)
  }
  if ((stored.introduced || []).some(f => f.kind === 'scraper_drifted' || f.kind === 'scraper_broken')) {
    const broke = stored.introduced.filter(f => f.kind === 'scraper_drifted' || f.kind === 'scraper_broken')
    out.push(`- ⚠️ ${listOf(broke)} stopped working during the night. I'm on it.`)
  }

  /* ── Things that need you ── */
  const mine = remaining.filter(f => owner(f) === 'matt')
  const groups = Object.entries(
    mine.reduce((by, f) => ((by[f.kind] ||= []).push(f), by), {})
  ).sort((a, b) => {
    const money = Number(ORDER_KINDS.has(b[0])) - Number(ORDER_KINDS.has(a[0]))
    if (money) return money
    return Math.max(...b[1].map(f => f.nightsOpen || 0)) - Math.max(...a[1].map(f => f.nightsOpen || 0))
  })
  const needLines = [
    ...groups.map(([kind, items]) => needsYouLine(kind, items)),
    ...(stored.needsMatt || []),
  ]

  out.push('')
  out.push('**Things that need you**')
  if (!needLines.length) {
    out.push('- Nothing, I handled everything.')
  } else {
    for (const line of needLines.slice(0, 5)) out.push(`- ${line}`)
    if (needLines.length > 5) out.push(`- …and ${needLines.length - 5} more on the dashboard.`)
  }

  /* ── Scrapers ── */
  const h = stored.stats?.scrapers?.raceHealth
  if (h) {
    const parts = [`${h.passing} of ${h.total} working`]
    if (h.failing.length) parts.push(`not working: ${h.failing.slice(0, 4).join(', ')}${h.failing.length > 4 ? ` and ${h.failing.length - 4} more` : ''}`)
    if (h.untested) parts.push(`${h.untested} not tested yet`)
    out.push('')
    out.push(`**Scrapers:** ${parts.join(' · ')}`)
  }

  return out.join('\n')
}
