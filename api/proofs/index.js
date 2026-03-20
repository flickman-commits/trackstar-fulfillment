/**
 * /api/proofs — Consolidated proof & approval endpoint
 *
 * Proof CRUD (merchant):
 *   GET    ?orderId=xxx                     — List proofs for an order
 *   POST   { orderId, imageData, imageName } — Upload a new proof
 *   DELETE { proofId }                      — Delete a proof
 *
 * Approval token (merchant):
 *   GET    ?action=token&orderId=xxx        — Get existing approval token + URL
 *   POST   { action: "generate-token", orderId } — Generate or regenerate token
 *
 * Customer approval (public, token-based):
 *   GET    ?action=approve&token=xxx        — Get order info + proofs for customer portal
 *   POST   { action: "approve", token, proofId, approval, feedback? } — Customer approves/revises
 */

import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action || (req.method !== 'GET' ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body)?.action : null)

  try {
    // ─── Customer Approval (public, token-based) ───
    if (action === 'approve') {
      const token = req.query.token || (typeof req.body === 'string' ? JSON.parse(req.body) : req.body)?.token
      if (!token) return res.status(400).json({ error: 'Token is required' })

      const approvalToken = await prisma.approvalToken.findUnique({
        where: { token },
        include: {
          order: {
            select: {
              id: true, orderNumber: true, parentOrderNumber: true,
              customerName: true, customerEmail: true, raceName: true,
              designStatus: true, trackstarOrderType: true, shopifyOrderData: true
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
        const shopifyData = approvalToken.order.shopifyOrderData
        const displayOrderNumber = (shopifyData && typeof shopifyData === 'object' && 'name' in shopifyData)
          ? String(shopifyData.name).replace('#', '')
          : approvalToken.order.parentOrderNumber

        return res.status(200).json({
          order: { ...approvalToken.order, displayOrderNumber, shopifyOrderData: undefined },
          proofs
        })
      }

      if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
        const { proofId, approval, feedback } = body

        if (!proofId) return res.status(400).json({ error: 'proofId is required' })
        if (!approval || !['approve', 'request_revision'].includes(approval)) {
          return res.status(400).json({ error: 'approval must be "approve" or "request_revision"' })
        }

        const proof = await prisma.proof.findUnique({ where: { id: proofId } })
        if (!proof || proof.orderId !== approvalToken.orderId) {
          return res.status(404).json({ error: 'Proof not found' })
        }

        const newStatus = approval === 'approve' ? 'approved' : 'revision_requested'
        const newDesignStatus = approval === 'approve' ? 'approved_by_customer' : 'in_revision'

        const updatedProof = await prisma.proof.update({
          where: { id: proofId },
          data: { status: newStatus, customerFeedback: feedback || null }
        })
        await prisma.order.update({
          where: { id: approvalToken.orderId },
          data: { designStatus: newDesignStatus }
        })

        console.log(`[approve] Customer ${approval} proof v${proof.version} for order ${approvalToken.order.orderNumber}`)
        return res.status(200).json({ success: true, proof: updatedProof })
      }

      return res.status(405).json({ error: 'Method not allowed' })
    }

    // ─── Approval Token Management (merchant) ───
    if (action === 'token' || action === 'generate-token') {
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
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

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
    }

    // ─── Proof CRUD (merchant) ───
    if (req.method === 'GET') {
      const { orderId } = req.query
      if (!orderId) return res.status(400).json({ error: 'orderId is required' })

      const proofs = await prisma.proof.findMany({
        where: { orderId },
        orderBy: { version: 'asc' }
      })
      return res.status(200).json({ proofs })
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
      const { orderId, imageData, imageName } = body

      if (!orderId) return res.status(400).json({ error: 'orderId is required' })
      if (!imageData) return res.status(400).json({ error: 'imageData is required' })

      const order = await prisma.order.findUnique({ where: { id: orderId } })
      if (!order) return res.status(404).json({ error: 'Order not found' })

      const lastProof = await prisma.proof.findFirst({
        where: { orderId },
        orderBy: { version: 'desc' }
      })
      const version = (lastProof?.version || 0) + 1

      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
      const ext = (imageName || 'proof.png').split('.').pop()?.toLowerCase() || 'png'
      const timestamp = Date.now()
      const filePath = `${orderId}/v${version}-${timestamp}.${ext}`

      const mimeTypes = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
        pdf: 'application/pdf'
      }
      const contentType = mimeTypes[ext] || `image/${ext}`

      const buffer = Buffer.from(imageData, 'base64')
      const { error: uploadErr } = await supabase.storage
        .from('order-proofs')
        .upload(filePath, buffer, { contentType, upsert: false })

      if (uploadErr) {
        console.error('[proofs] Image upload failed:', uploadErr.message)
        return res.status(500).json({ error: `Image upload failed: ${uploadErr.message}` })
      }

      const { data: { publicUrl } } = supabase.storage.from('order-proofs').getPublicUrl(filePath)

      const proof = await prisma.proof.create({
        data: { orderId, version, imageUrl: publicUrl, fileName: imageName || null, status: 'pending' }
      })

      let approvalToken = await prisma.approvalToken.findUnique({ where: { orderId } })
      if (!approvalToken) {
        approvalToken = await prisma.approvalToken.create({
          data: { orderId, token: crypto.randomUUID(), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
        })
      }

      const approvalUrl = buildApprovalUrl(req, approvalToken.token)
      console.log(`[proofs] Uploaded v${version} for order ${order.orderNumber}`)
      return res.status(201).json({ success: true, proof, approvalToken, approvalUrl })
    }

    if (req.method === 'DELETE') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
      const { proofId } = body

      if (!proofId) return res.status(400).json({ error: 'proofId is required' })

      const proof = await prisma.proof.findUnique({ where: { id: proofId } })
      if (!proof) return res.status(404).json({ error: 'Proof not found' })

      if (proof.imageUrl) {
        try {
          const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
          const match = proof.imageUrl.match(/\/storage\/v1\/object\/public\/order-proofs\/(.+)$/)
          if (match?.[1]) {
            await supabase.storage.from('order-proofs').remove([decodeURIComponent(match[1])])
          }
        } catch (e) {
          console.warn('[proofs] Failed to delete image from storage:', e.message)
        }
      }

      await prisma.proof.delete({ where: { id: proofId } })
      console.log(`[proofs] Deleted proof ${proofId}`)
      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('[proofs] Error:', error)
    return res.status(500).json({ error: error.message })
  } finally {
    await prisma.$disconnect()
  }
}
