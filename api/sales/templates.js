/**
 * /api/sales/templates
 *
 *   GET                        the library as stored, plus what the browser needs to fill one in
 *   POST { action:'save', id?, name, motion, useFor?, subject?, body }   any sales rep: add or change one
 *   POST { action:'delete', id }                                          admin: remove one
 */
import { setCors } from '../_lib/auth.js'
import { requireSalesRep, requireAdminRole, recordAudit } from '../_lib/users.js'
import { getSenderFor, getSettings } from '../../server/domain/sales/settings.js'
import { listTemplates, saveTemplate, deleteTemplate, MOTIONS } from '../../server/domain/sales/templateLibrary.js'
import { DEFAULT_SOCIAL_PROOF, NEEDS_OPENER } from '../../server/domain/sales/angles.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS' })) return
  const actor = await requireSalesRep(req, res)
  if (!actor) return

  try {
    if (req.method === 'GET') {
      // Everything the composer needs to fill a template in the browser, in
      // one small read with no Attio call: the person is already on screen.
      const [templates, settings, sender] = await Promise.all([listTemplates(), getSettings(), getSenderFor(actor.id, actor)])
      return res.status(200).json({
        templates, motions: MOTIONS,
        fill: { senderName: sender.name || '', socialProof: settings.socialProof || DEFAULT_SOCIAL_PROOF, needsOpener: NEEDS_OPENER },
      })
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    if (body.action === 'save') {
      try {
        const templates = await saveTemplate(body, actor)
        await recordAudit({ actor, action: 'sales.template_library', summary: `${body.id ? 'Edited' : 'Added'} the template "${String(body.name || '').slice(0, 80)}"` })
        return res.status(200).json({ templates })
      } catch (e) {
        return res.status(400).json({ error: e.message })
      }
    }
    if (body.action === 'delete') {
      if (!(await requireAdminRole(req, res, actor))) return
      const templates = await deleteTemplate(String(body.id || ''))
      await recordAudit({ actor, action: 'sales.template_library', summary: `Deleted a template (${String(body.id || '').slice(0, 40)})` })
      return res.status(200).json({ templates })
    }
    return res.status(400).json({ error: 'Unknown action' })
  } catch (error) {
    console.error('[API /sales/templates]', error)
    return res.status(500).json({ error: 'Could not load the templates' })
  }
}
