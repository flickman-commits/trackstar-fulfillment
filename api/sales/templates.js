/**
 * /api/sales/templates
 *
 *   GET ?dealId=&personId=     the team's outreach templates (from Notion), filled in for that person
 *   GET ?firstName=&org=       the same for a one-off to a bare address, with no deal
 *
 * Read-only. The wording is edited in Notion; see notionTemplates.js.
 */
import { setCors } from '../_lib/auth.js'
import { requireSalesRep } from '../_lib/users.js'
import { getDeal } from '../../server/domain/sales/attio.js'
import { primaryPerson } from '../../server/domain/sales/queue.js'
import { getSenderFor } from '../../server/domain/sales/settings.js'
import { templatesFor } from '../../server/domain/sales/notionTemplates.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, OPTIONS' })) return
  const actor = await requireSalesRep(req, res)
  if (!actor) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const q = req.query || {}
    const dealId = String(q.dealId || '')
    let deal = null, person = null
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
  } catch (error) {
    console.error('[API /sales/templates]', error)
    return res.status(500).json({ error: 'Could not load the templates' })
  }
}
