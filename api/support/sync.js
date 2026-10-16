/**
 * /api/support/sync - bring the mirror up to date with the mailbox.
 *
 * Runs every 5 minutes from the cron (vercel.json), and on demand when a
 * rep presses Refresh on the Support page. One history.list call when
 * nothing changed. See server/domain/support/mailbox.js.
 */
import { setCors, isCronRequest } from '../_lib/auth.js'
import { requireCapability } from '../_lib/users.js'
import { sync, status } from '../../server/domain/support/mailbox.js'
import { refreshTokenIfDue } from '../../server/domain/support/instagram.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS' })) return
  if (!isCronRequest(req)) {
    const user = await requireCapability(req, res, 'support')
    if (!user) return
  }
  try {
    // Instagram needs no sync (the webhook delivers), only its long-lived token kept alive.
    try {
      const ig = await refreshTokenIfDue()
      if (ig.refreshed) console.log('[support.instagram] token refreshed')
    } catch (err) {
      console.warn(`[support.instagram] token refresh: ${err.message}`)
    }
    const s = await status()
    if (!s.connected) return res.status(200).json({ skipped: 'not_connected' })
    const out = await sync()
    if (out.imported || out.failed) console.log(`[support.sync] ${out.mode}: imported ${out.imported}, failed ${out.failed}`)
    return res.status(200).json(out)
  } catch (error) {
    console.error('[API /support/sync]', error)
    return res.status(500).json({ error: error.message })
  }
}
