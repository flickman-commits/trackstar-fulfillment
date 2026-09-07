/**
 * POST /api/sales/research  { contactId, force? }
 *
 * Research one contact and store it on the row. Cached after the first run
 * unless `force` is set. The backend is chosen in domain/sales/research.js.
 */
import { setCors } from '../_lib/auth.js'
import { requireAdminOnly } from '../_lib/users.js'
import { researchContact } from '../../server/domain/sales/research.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'POST, OPTIONS' })) return
  // Sales is admin-only: the pipeline and everyone's contact details are
  // not part of the fulfillment job the staff accounts exist for.
  if (!await requireAdminOnly(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    if (!body.contactId) return res.status(400).json({ error: 'contactId is required' })
    const { contact, research, cached } = await researchContact(String(body.contactId), { force: Boolean(body.force) })
    const { company, ...rest } = contact
    return res.status(200).json({ contact: rest, research, cached })
  } catch (error) {
    console.error('[API /sales/research]', error)
    return res.status(500).json({ error: error.message })
  }
}
