/**
 * /api/approval-token
 *
 * GET  ?orderId=xxx  — Get existing approval token + URL for an order
 * POST { orderId }   — Generate or regenerate approval token
 */

import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const prisma = new PrismaClient()

function buildApprovalUrl(req, token) {
  const origin = req.headers?.origin || (() => {
    const host = req.headers?.host || 'trackstar-fulfillment.vercel.app'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    return `${protocol}://${host}`
  })()
  return `${origin}/approve/${token}`
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      const { orderId } = req.query
      if (!orderId) return res.status(400).json({ error: 'orderId is required' })

      const approvalToken = await prisma.approvalToken.findUnique({ where: { orderId } })
      if (!approvalToken) return res.status(404).json({ error: 'No approval token found for this order' })

      return res.status(200).json({
        approvalToken,
        approvalUrl: buildApprovalUrl(req, approvalToken.token)
      })
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
      const { orderId } = body

      if (!orderId) return res.status(400).json({ error: 'orderId is required' })

      const order = await prisma.order.findUnique({ where: { id: orderId } })
      if (!order) return res.status(404).json({ error: 'Order not found' })

      const newToken = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

      // Upsert: create or regenerate
      const approvalToken = await prisma.approvalToken.upsert({
        where: { orderId },
        create: { orderId, token: newToken, expiresAt },
        update: { token: newToken, expiresAt }
      })

      console.log(`[approval-token] Generated token for order ${order.orderNumber}`)
      return res.status(200).json({
        approvalToken,
        approvalUrl: buildApprovalUrl(req, approvalToken.token)
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('[approval-token] Error:', error)
    return res.status(500).json({ error: error.message })
  } finally {
    await prisma.$disconnect()
  }
}
