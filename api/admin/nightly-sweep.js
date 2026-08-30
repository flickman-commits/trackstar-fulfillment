/**
 * GET /api/admin/nightly-sweep
 *
 *   GET  ?cached=1[&format=markdown]  → LAST NIGHT'S finished report, without
 *                                       re-running anything. This is what the
 *                                       morning email reads.
 *   GET  (cron: Bearer CRON_SECRET)   → run the sweep. Kept for a manual or
 *                                       scripted trigger; there is deliberately
 *                                       no Vercel cron on this any more. The
 *                                       nightly Claude Code routine is the only
 *                                       scheduler, because a cron quietly
 *                                       producing a report while the agent is
 *                                       dead is how you get a healthy-looking
 *                                       email for a week without noticing the
 *                                       fixing half stopped.
 *   GET  (admin session / secret)     → run the sweep, return JSON
 *   GET  ?dryRun=1                    → run it without moving the baseline
 *   POST {before, after}              → the agent files its finished run:
 *                                       combines both passes, renders the
 *                                       report, and stores it for the morning
 *
 * This is the deterministic half of the nightly agent. It gathers facts with
 * production credentials and hands them over; the agent that acts on them
 * reads this endpoint and never touches the database itself. Keeping the
 * credentials on this side of the wire is the point - the worst an agent can
 * do with this report is write a bad pull request.
 */
import prisma from '../_lib/prisma.js'
import { setCors, requireAdmin } from '../_lib/auth.js'
import { agentActor } from '../_lib/agentToken.js'
import { runNightlySweep, combineSweepPasses, NIGHTLY_REPORT_KEY } from '../../server/services/nightlySweep.js'
import { formatSweepForSlack, formatSweepAsMarkdown, formatSweepBrief } from '../../server/services/nightlySweepReport.js'

/**
 * Park a rendered report where the morning digest reads it.
 *
 * Called from BOTH paths on purpose. The agent's POST stores the richer
 * version with what it fixed, but the cron has to store one too - otherwise a
 * night when the agent does not run leaves yesterday's report sitting there,
 * and the digest renders stale numbers as if they were this morning's. That is
 * the failure mode this whole design is supposed to avoid: a section that
 * looks fine because nothing updated it.
 */
async function storeRenderedReport(combined, notes = null) {
  const stored = {
    ...combined,
    notes,
    markdown: formatSweepAsMarkdown(combined),
    storedAt: new Date().toISOString(),
  }
  await prisma.systemConfig.upsert({
    where: { key: NIGHTLY_REPORT_KEY },
    create: { key: NIGHTLY_REPORT_KEY, value: JSON.stringify(stored) },
    update: { value: JSON.stringify(stored) },
  })
  return stored
}

/**
 * The shape combineSweepPasses produces, from a single sweep run on its own.
 *
 * "Fixed" here means "was a finding at the last sweep and is not one now",
 * which is the only thing a standalone run can honestly claim. It does not
 * assert who fixed it - an agent, a person during the day, or a timing site
 * that came back up all look identical from here, and all three are worth
 * seeing. Hardcoding this empty made the cron drop cleared findings silently:
 * they vanished off the list with nothing to say they had gone.
 *
 * The delta stores fingerprints rather than whole findings, so they are parsed
 * back into the minimal shape the report renders.
 */
function asUnfixedReport(report) {
  const resolved = (report.delta?.resolved || []).map(fp => {
    const [kind, ...rest] = String(fp).split('::')
    return { kind, subject: rest.join('::'), severity: 'medium', detail: 'No longer reported.' }
  })

  return {
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    healthy: report.healthy,
    failedChecks: report.failedChecks,
    found: report.delta?.new || [],
    fixed: resolved,
    introduced: [],
    remaining: report.findings,
    stats: report.stats,
    counts: {
      found: (report.delta?.new || []).length,
      fixed: resolved.length,
      introduced: 0,
      remaining: report.findings.length,
      remainingHigh: report.findings.filter(f => f.severity === 'high').length,
    },
  }
}

async function postToSlack(text) {
  const url = process.env.SLACK_DM_WEBHOOK_URL || process.env.SLACK_PROOF_WEBHOOK_URL
  if (!url) {
    console.warn('[nightly-sweep] no Slack webhook configured - skipping the report')
    return { sent: false, reason: 'no webhook configured' }
  }
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    console.error(`[nightly-sweep] Slack rejected the report (${resp.status}): ${body.slice(0, 200)}`)
    return { sent: false, reason: `Slack ${resp.status}` }
  }
  return { sent: true }
}

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS' })) return

  const isCron = req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET}`
  const wantsCached = req.query?.cached === '1' || req.query?.cached === 'true'

  /**
   * A token that can do exactly one thing: read last night's stored report.
   *
   * The daily digest lives in a different project and only needs this one
   * value. Handing it ADMIN_SECRET would put a key to every admin endpoint,
   * destructive ones included, into a second codebase's environment for the
   * sake of one GET. This grants no writes and reaches nothing else, so the
   * worst it can leak is a health summary.
   */
  const reportToken = process.env.NIGHTLY_REPORT_READ_TOKEN
  const presented = req.headers['x-report-token']
  const isReportReader = Boolean(
    wantsCached && reportToken && presented && presented === reportToken
  )

  // The nightly agent carries its own narrowly-scoped token; see _lib/agentToken.
  const isAgent = Boolean(agentActor(req))
  if (!isCron && !isReportReader && !isAgent && !requireAdmin(req, res)) return

  const dryRun = req.query?.dryRun === '1' || req.query?.dryRun === 'true'

  try {
    // ── The morning read. Deliberately does NOT re-run the sweep: the numbers
    // must be the ones the agent actually acted on overnight, not a fresh set
    // taken hours later that no longer matches what it says it fixed.
    if (wantsCached) {
      const row = await prisma.systemConfig.findUnique({ where: { key: NIGHTLY_REPORT_KEY } })
      if (!row?.value) {
        // 404 rather than an empty 200 so a consumer can tell "the agent has
        // not run" from "the agent ran and found nothing", and omit its
        // section instead of rendering a blank one.
        return res.status(404).json({ error: 'No nightly report stored yet.' })
      }
      const stored = JSON.parse(row.value)

      if (req.query?.format === 'markdown') {
        const brief = req.query?.brief === '1' || req.query?.brief === 'true'
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
        return res.status(200).send(
          brief ? formatSweepBrief(stored) : stored.markdown
        )
      }
      return res.status(200).json(stored)
    }

    // ── The agent files its finished run: sweep, fix, sweep again.
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
      const { before, after, notes = null } = body
      if (!before?.findings || !after?.findings) {
        return res.status(400).json({ error: 'before and after sweep reports are required' })
      }
      const combined = combineSweepPasses(before, after)
      // notes is the agent's own narrative - PR links, what it chose not to do.
      // Kept separate from the computed sections so a claim can never be
      // mistaken for a verified fact.
      const stored = await storeRenderedReport(combined, notes)
      return res.status(200).json({ ok: true, counts: combined.counts, markdown: stored.markdown })
    }

    const report = await runNightlySweep({ persistBaseline: !dryRun })

    // Store the report on every real run, so the digest always has something
    // from THIS morning even if no agent ran. A dry run deliberately does not,
    // since it is a preview and must not overwrite the night's record.
    if (!dryRun) {
      await storeRenderedReport(asUnfixedReport(report))
    }

    // Slack is opt-in now that the report rides along in the morning email.
    // One more notification channel is how a report stops being read.
    let slack = { sent: false, reason: 'disabled (set NIGHTLY_SWEEP_SLACK=1 to enable)' }
    if (isCron && !dryRun && process.env.NIGHTLY_SWEEP_SLACK === '1') {
      slack = await postToSlack(formatSweepForSlack(report))
    }

    return res.status(200).json({ ...report, slack })
  } catch (error) {
    console.error('[nightly-sweep] the sweep itself failed:', error)

    // A sweep that cannot run must be louder than one that finds nothing.
    // Silence reading as "all clear" is how the catalog sat stale for
    // eighteen days.
    if (isCron) {
      // A sweep that cannot run is the one thing that always pages, regardless
      // of the Slack toggle: the morning email would otherwise show yesterday's
      // stored report and read like everything is fine.
      await postToSlack(
        `:rotating_light: *Nightly sweep failed to run*\n` +
        `\`${error.message}\`\n` +
        `No checks completed, so tonight's silence is not an all-clear.`
      ).catch(() => {})
    }
    return res.status(500).json({ healthy: false, error: error.message })
  }
}
