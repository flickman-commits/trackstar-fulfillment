/**
 * /api/support/sync - bring the mirror up to date with the mailbox.
 *
 * Runs every 5 minutes from the cron (vercel.json), and on demand when a
 * rep presses Refresh on the Support page. One history.list call when
 * nothing changed. See server/domain/support/mailbox.js. Then Claude drafts
 * replies for the conversations that need one (server/domain/support/draft.js).
 */
import { setCors, isCronRequest } from '../_lib/auth.js'
import { requireCapability } from '../_lib/users.js'
import { sync, status } from '../../server/domain/support/mailbox.js'
import { refreshTokenIfDue, ensureSubscribed, catchUpIfDue } from '../../server/domain/support/instagram.js'
import { draftPending } from '../../server/domain/support/draft.js'

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
      // Without a webhook subscription Meta sends nothing; check it hourly, and catch up on anything missed.
      const sub = await ensureSubscribed()
      if (sub.subscribed) console.warn('[support.instagram] webhook subscription was missing; subscribed again')
      const caught = await catchUpIfDue()
      if (caught.seen) console.log(`[support.instagram] hourly catch-up read ${caught.seen} recent DMs (already-stored ones are left as they are)`)
    } catch (err) {
      console.warn(`[support.instagram] upkeep: ${err.message}`)
    }
    const s = await status()
    if (!s.connected) return res.status(200).json({ skipped: 'not_connected' })
    const out = await sync()
    if (out.imported || out.failed) console.log(`[support.sync] ${out.mode}: imported ${out.imported}, failed ${out.failed}`)
    // Claude's drafts for what just came in (and anything still waiting on one). Never fails the sync.
    let drafts = null
    try {
      drafts = await draftPending({ limit: 6 })
      if (drafts.drafted || drafts.failed) console.log(`[support.draft] drafted ${drafts.drafted}, failed ${drafts.failed}, waiting ${drafts.waiting}`)
    } catch (err) {
      console.warn(`[support.draft] ${err.message}`)
    }
    return res.status(200).json({ ...out, drafts })
  } catch (error) {
    console.error('[API /support/sync]', error)
    return res.status(500).json({ error: error.message })
  }
}
