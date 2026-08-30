/**
 * GET /api/admin/nightly-sweep
 *
 *   GET  ?cached=1[&format=markdown]  → LAST NIGHT'S finished report, without
 *                                       re-running anything. This is what the
 *                                       morning email reads.
 *   GET  (cron: Bearer CRON_SECRET)   → run the sweep
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
import { runNightlySweep, combineSweepPasses, NIGHTLY_REPORT_KEY } from '../../server/services/nightlySweep.js'
import { formatSweepForSlack, formatSweepAsMarkdown } from '../../server/services/nightlySweepReport.js'

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
  if (!isCron && !requireAdmin(req, res)) return

  const dryRun = req.query?.dryRun === '1' || req.query?.dryRun === 'true'

  try {
    // ── The morning read. Deliberately does NOT re-run the sweep: the numbers
    // must be the ones the agent actually acted on overnight, not a fresh set
    // taken hours later that no longer matches what it says it fixed.
    if (req.query?.cached === '1' || req.query?.cached === 'true') {
      const row = await prisma.systemConfig.findUnique({ where: { key: NIGHTLY_REPORT_KEY } })
      if (!row?.value) {
        return res.status(404).json({ error: 'No nightly report stored yet.' })
      }
      const stored = JSON.parse(row.value)
      if (req.query?.format === 'markdown') {
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
        return res.status(200).send(stored.markdown)
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
      const markdown = formatSweepAsMarkdown(combined)
      // notes is the agent's own narrative - PR links, what it chose not to do.
      // Kept separate from the computed sections so a claim can never be
      // mistaken for a verified fact.
      const stored = { ...combined, notes, markdown, storedAt: new Date().toISOString() }
      await prisma.systemConfig.upsert({
        where: { key: NIGHTLY_REPORT_KEY },
        create: { key: NIGHTLY_REPORT_KEY, value: JSON.stringify(stored) },
        update: { value: JSON.stringify(stored) },
      })
      return res.status(200).json({ ok: true, counts: combined.counts, markdown })
    }

    const report = await runNightlySweep({ persistBaseline: !dryRun })

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
