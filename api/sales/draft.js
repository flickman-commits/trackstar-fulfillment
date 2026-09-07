/**
 * /api/sales/draft
 *
 *   GET  ?action=status                                    what is wired up: model, research, Gmail
 *   POST { action:'variants', companyId, contactId? }       five drafts for the next touch
 *   POST { action:'queue', companyId, contactId, subject, body }  file the chosen one
 */
import { setCors, requireAdmin } from '../_lib/auth.js'
import { draftVariants, queueDraft } from '../../server/domain/sales/drafting.js'
import { llmInfo } from '../../server/lib/llm.js'
import { isResearchConfigured } from '../../server/domain/sales/research.js'
import { gmailStatus } from '../../server/domain/sales/gmail.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS' })) return
  const actor = requireAdmin(req, res)
  if (!actor) return

  try {
    if (req.method === 'GET') {
      return res.status(200).json({
        llm: llmInfo(),
        research: { configured: isResearchConfigured() },
        gmail: await gmailStatus(),
      })
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    if (!body.companyId) return res.status(400).json({ error: 'companyId is required' })

    if (body.action === 'variants') {
      const out = await draftVariants({ companyId: String(body.companyId), contactId: body.contactId ? String(body.contactId) : undefined })
      const { company, contact, ...rest } = out
      return res.status(200).json({ ...rest, contactId: contact.id, companyId: company.id })
    }

    if (body.action === 'queue') {
      if (!body.contactId) return res.status(400).json({ error: 'contactId is required' })
      const out = await queueDraft({
        companyId: String(body.companyId),
        contactId: String(body.contactId),
        subject: String(body.subject || ''),
        body: String(body.body || ''),
        actor,
      })
      return res.status(200).json(out)
    }

    return res.status(400).json({ error: `Unknown action: ${body.action}` })
  } catch (error) {
    console.error('[API /sales/draft]', error)
    return res.status(500).json({ error: error.message })
  }
}
