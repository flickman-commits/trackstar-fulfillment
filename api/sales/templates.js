/**
 * /api/sales/templates
 *
 *   GET ?dealId=&personId=     the template library, filled in for that person (the composer's menu)
 *   GET ?firstName=&org=       the same for a one-off to a bare address, with no deal
 *   GET ?action=list           the library as stored, for Settings
 *   POST { action:'save', id?, name, motion, useFor?, subject?, body }   admin: add or change one
 *   POST { action:'delete', id }                                          admin: remove one
 */
import { setCors } from '../_lib/auth.js'
import { requireSalesRep, requireAdminRole, recordAudit } from '../_lib/users.js'
import { getDeal } from '../../server/domain/sales/attio.js'
import { primaryPerson } from '../../server/domain/sales/queue.js'
import { getSenderFor } from '../../server/domain/sales/settings.js'
import { listTemplates, saveTemplate, deleteTemplate, templatesFor, MOTIONS } from '../../server/domain/sales/templateLibrary.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS' })) return
  const actor = await requireSalesRep(req, res)
  if (!actor) return

  try {
    if (req.method === 'GET') {
      const q = req.query || {}
      if (q.action === 'list') return res.status(200).json({ templates: await listTemplates({ force: true }), motions: MOTIONS })

      const dealId = String(q.dealId || '')
      let deal, person
      if (dealId && !dealId.startsWith('adhoc:')) {
        deal = await getDeal(dealId)
        if (!deal) return res.status(404).json({ error: 'No such deal in Attio' })
        person = (q.personId && deal.people.find(p => p.id === q.personId)) || primaryPerson(deal)
      } else {
        deal = { name: String(q.org || '').slice(0, 200) }
        person = { firstName: String(q.firstName || '').slice(0, 60), lastName: '', email: String(q.email || '').slice(0, 200) }
      }
      const sender = await getSenderFor(actor.id, actor)
      return res.status(200).json(await templatesFor({ deal, person, sender }))
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    if (actor.role !== 'admin' && !actor.isSystem) return res.status(403).json({ error: 'Templates are edited by an admin.' })
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
