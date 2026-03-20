/**
 * /api/approve/[token]
 *
 * Public endpoint — no auth required (token-based access)
 *
 * GET  /api/approve/:token                          — Get order info + proofs for customer portal
 * POST /api/approve/:token { proofId, action, feedback? } — Customer approves or requests revision
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  // Token comes from req.query.token (Vercel dynamic route [token].js)
  // In dev server (Express), the param adapter copies req.params.token → req.query.token
  const token = req.query.token
  if (!token) return res.status(400).json({ error: 'Token is required' })

  try {
    // Look up the approval token
    const approvalToken = await prisma.approvalToken.findUnique({
      where: { token },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            parentOrderNumber: true,
            customerName: true,
            customerEmail: true,
            raceName: true,
            designStatus: true,
            trackstarOrderType: true,
            shopifyOrderData: true
          }
        }
      }
    })

    if (!approvalToken) {
      return res.status(404).json({ error: 'Invalid approval link. Please contact us for assistance.' })
    }

    if (new Date() > approvalToken.expiresAt) {
      return res.status(410).json({ error: 'This approval link has expired. Please contact us for a new link.' })
    }

    if (req.method === 'GET') {
      const proofs = await prisma.proof.findMany({
        where: { orderId: approvalToken.orderId },
        orderBy: { version: 'asc' }
      })

      // Extract friendly display order number from Shopify data
      const shopifyData = approvalToken.order.shopifyOrderData
      const displayOrderNumber = (shopifyData && typeof shopifyData === 'object' && 'name' in shopifyData)
        ? String(shopifyData.name).replace('#', '')
        : approvalToken.order.parentOrderNumber

      return res.status(200).json({
        order: {
          ...approvalToken.order,
          displayOrderNumber,
          shopifyOrderData: undefined // Don't expose raw Shopify data to customers
        },
        proofs
      })
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
      const { proofId, action, feedback } = body

      if (!proofId) return res.status(400).json({ error: 'proofId is required' })
      if (!action || !['approve', 'request_revision'].includes(action)) {
        return res.status(400).json({ error: 'action must be "approve" or "request_revision"' })
      }

      // Verify the proof belongs to this order
      const proof = await prisma.proof.findUnique({ where: { id: proofId } })
      if (!proof || proof.orderId !== approvalToken.orderId) {
        return res.status(404).json({ error: 'Proof not found' })
      }

      const newStatus = action === 'approve' ? 'approved' : 'revision_requested'
      const newDesignStatus = action === 'approve' ? 'approved_by_customer' : 'in_revision'

      // Update proof status + feedback
      const updatedProof = await prisma.proof.update({
        where: { id: proofId },
        data: {
          status: newStatus,
          customerFeedback: feedback || null
        }
      })

      // Update order design status
      await prisma.order.update({
        where: { id: approvalToken.orderId },
        data: { designStatus: newDesignStatus }
      })

      console.log(`[approve] Customer ${action} proof v${proof.version} for order ${approvalToken.order.orderNumber}`)
      return res.status(200).json({ success: true, proof: updatedProof })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('[approve] Error:', error)
    return res.status(500).json({ error: error.message })
  } finally {
    await prisma.$disconnect()
  }
}
