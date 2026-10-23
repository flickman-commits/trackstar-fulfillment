/**
 * GET /api/cron/artelo-send - every minute, from Vercel cron. Sends approved
 * prints whose hold is over to Artelo production, one at a time
 * (server/domain/render/arteloSend.js). Cron only.
 */
import { isCronRequest } from '../_lib/auth.js'
import { sendDue } from '../../server/domain/render/arteloSend.js'

export default async function handler(req, res) {
  if (!isCronRequest(req)) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const out = await sendDue()
    if (out.tried) console.log(`[cron/artelo-send] ${JSON.stringify(out)}`)
    return res.status(200).json(out)
  } catch (error) {
    console.error('[cron/artelo-send]', error)
    return res.status(500).json({ error: 'Send failed' })
  }
}
