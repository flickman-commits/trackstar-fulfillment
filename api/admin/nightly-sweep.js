/**
 * GET /api/admin/nightly-sweep
 *
 *   Cron  (Authorization: Bearer CRON_SECRET) → run it and Slack the result
 *   Admin (session or x-admin-secret)         → run it and return the JSON
 *   ?dryRun=1                                 → run it, return JSON, no Slack,
 *                                               and do not move the delta
 *                                               baseline
 *
 * This is the deterministic half of the nightly agent. It gathers facts with
 * production credentials and hands them over; the agent that acts on them
 * reads this endpoint and never touches the database itself. Keeping the
 * credentials on this side of the wire is the point - the worst an agent can
 * do with this report is write a bad pull request.
 */
import { setCors, requireAdmin } from '../_lib/auth.js'
import { runNightlySweep } from '../../server/services/nightlySweep.js'
import { formatSweepForSlack } from '../../server/services/nightlySweepReport.js'

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
    const report = await runNightlySweep({ persistBaseline: !dryRun })

    let slack = { sent: false, reason: 'not requested' }
    if (isCron && !dryRun) {
      slack = await postToSlack(formatSweepForSlack(report))
    }

    return res.status(200).json({ ...report, slack })
  } catch (error) {
    console.error('[nightly-sweep] the sweep itself failed:', error)

    // A sweep that cannot run must be louder than one that finds nothing.
    // Silence reading as "all clear" is how the catalog sat stale for
    // eighteen days.
    if (isCron) {
      await postToSlack(
        `:rotating_light: *Nightly sweep failed to run*\n` +
        `\`${error.message}\`\n` +
        `No checks completed, so tonight's silence is not an all-clear.`
      ).catch(() => {})
    }
    return res.status(500).json({ healthy: false, error: error.message })
  }
}
