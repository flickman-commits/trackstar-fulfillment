/**
 * /api/proofs
 *
 * GET    ?orderId=xxx                     — List proofs for an order (by version asc)
 * POST   { orderId, imageData, imageName } — Upload a new proof + auto-create approval token
 * DELETE { proofId }                      — Delete a proof + its image from storage
 */

import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const prisma = new PrismaClient()

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
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

      // Calculate next version number
      const lastProof = await prisma.proof.findFirst({
        where: { orderId },
        orderBy: { version: 'desc' }
      })
      const version = (lastProof?.version || 0) + 1

      // Upload image to Supabase Storage
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
      const ext = (imageName || 'proof.png').split('.').pop()?.toLowerCase() || 'png'
      const timestamp = Date.now()
      const filePath = `${orderId}/v${version}-${timestamp}.${ext}`

      // Map extension to proper MIME type
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

      const { data: { publicUrl } } = supabase.storage
        .from('order-proofs')
        .getPublicUrl(filePath)

      // Create proof record
      const proof = await prisma.proof.create({
        data: {
          orderId,
          version,
          imageUrl: publicUrl,
          fileName: imageName || null,
          status: 'pending'
        }
      })

      // Auto-create approval token if one doesn't exist
      let approvalToken = await prisma.approvalToken.findUnique({ where: { orderId } })
      if (!approvalToken) {
        approvalToken = await prisma.approvalToken.create({
          data: {
            orderId,
            token: crypto.randomUUID(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
          }
        })
      }

      // Build approval URL from Origin header (frontend) or fallback to host
      const origin = req.headers?.origin || (() => {
        const host = req.headers?.host || 'trackstar-fulfillment.vercel.app'
        const protocol = host.includes('localhost') ? 'http' : 'https'
        return `${protocol}://${host}`
      })()
      const approvalUrl = `${origin}/approve/${approvalToken.token}`

      console.log(`[proofs] Uploaded v${version} for order ${order.orderNumber}`)
      return res.status(201).json({ success: true, proof, approvalToken, approvalUrl })
    }

    if (req.method === 'DELETE') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
      const { proofId } = body

      if (!proofId) return res.status(400).json({ error: 'proofId is required' })

      const proof = await prisma.proof.findUnique({ where: { id: proofId } })
      if (!proof) return res.status(404).json({ error: 'Proof not found' })

      // Clean up image from Supabase Storage
      if (proof.imageUrl) {
        try {
          const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
          )
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
