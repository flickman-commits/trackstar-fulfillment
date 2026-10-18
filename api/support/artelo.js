/**
 * /api/support/artelo - a new Artelo order for a customer (a reprint or replacement).
 *
 *   POST { action: 'prep', id, shopifyOrderId }      the items, whether each can be copied, the next order id
 *   POST { action: 'create', id, shopifyOrderId, orderIds, address, email, instructions, test }
 *
 * id is the Support conversation. See server/domain/support/arteloOrder.js.
 */
import { setCors } from '../_lib/auth.js'
import { requireCapability, recordAudit } from '../_lib/users.js'
import prisma from '../_lib/prisma.js'
import { reorderPrep, createReorder } from '../../server/domain/support/arteloOrder.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'POST, OPTIONS' })) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const user = await requireCapability(req, res, 'support')
  if (!user) return
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const thread = await prisma.supportThread.findUnique({ where: { id: String(body.id || '') } })
    if (!thread) return res.status(404).json({ error: 'No such conversation' })
    if (body.action === 'prep') return res.status(200).json(await reorderPrep({ shopifyOrderId: body.shopifyOrderId }))
    if (body.action === 'create') {
      const out = await createReorder({ thread, shopifyOrderId: body.shopifyOrderId, orderIds: Array.isArray(body.orderIds) ? body.orderIds.map(String) : [], address: body.address, email: body.email, instructions: body.instructions, test: body.test === true, actor: user })
      await recordAudit({ action: 'support.artelo_order', summary: out.summary, detail: { threadId: thread.id, shopifyOrderId: body.shopifyOrderId, arteloOrderId: out.orderId, test: out.test }, actor: user })
      return res.status(200).json(out)
    }
    return res.status(400).json({ error: 'Unknown action' })
  } catch (error) {
    console.error('[API /support/artelo]', error)
    return res.status(500).json({ error: error.message })
  }
}
