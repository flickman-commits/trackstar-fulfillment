/**
 * /api/sales/settings - the knobs the business turns.
 *
 *   GET             { settings, defaults }   merged live values, and the code defaults for reference
 *   POST { ...patch }                        override any subset; omitted fields keep their value
 *
 * The overnight routine reads the same merged values through sales_rules, so
 * a change here reaches the next run without a deploy.
 */
import { setCors } from '../_lib/auth.js'
import { requireAdminOnly, recordAudit } from '../_lib/users.js'
import { getSettings, setSettings, DEFAULTS } from '../../server/domain/sales/settings.js'
import { checkMirrors } from '../../server/domain/sales/externalSync.js'
import prisma from '../_lib/prisma.js'

const EDITABLE = ['dailyCap', 'sender', 'socialProof', 'priorityRaces', 'signature', 'timezone', 'undoSeconds']

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS' })) return
  const actor = await requireAdminOnly(req, res)
  if (!actor) return

  try {
    if (req.method === 'GET') {
      if (req.query?.action === 'check') {
        const sample = await prisma.company.findFirst({ where: { pipeline: 'CHARITY', externalId: { contains: 'notion' } }, select: { externalId: true } })
        return res.status(200).json(await checkMirrors(sample?.externalId))
      }
      return res.status(200).json({ settings: await getSettings({ force: true }), defaults: DEFAULTS })
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const patch = {}
    for (const k of EDITABLE) if (body[k] !== undefined) patch[k] = body[k]
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to change' })
    const settings = await setSettings(patch)
    await recordAudit({ actor, action: 'sales.settings', summary: `Changed sales settings: ${Object.keys(patch).join(', ')}`, detail: patch })
    return res.status(200).json({ settings })
  } catch (error) {
    console.error('[API /sales/settings]', error)
    return res.status(500).json({ error: error.message })
  }
}
