/**
 * /api/orders/comments
 *
 * GET    ?orderId=xxx            — List comments for an order (newest first)
 * POST   { orderId, text?, imageUrl? } — Add a comment
 * DELETE { commentId }           — Delete a comment + its image from storage
 */

import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'

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

      const comments = await prisma.orderComment.findMany({
        where: { orderId },
        orderBy: { createdAt: 'desc' }
      })

      return res.status(200).json({ comments })
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
      const { orderId, text, imageData, imageName } = body

      if (!orderId) return res.status(400).json({ error: 'orderId is required' })
      if (!text && !imageData) return res.status(400).json({ error: 'text or imageData is required' })

      const order = await prisma.order.findUnique({ where: { id: orderId } })
      if (!order) return res.status(404).json({ error: 'Order not found' })

      // Upload image to Supabase Storage if provided (server-side with service role key)
      let imageUrl = null
      if (imageData) {
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        )
        const ext = (imageName || 'image.png').split('.').pop() || 'png'
        const timestamp = Date.now()
        const randomSuffix = Math.random().toString(36).substring(2, 8)
        const filePath = `${orderId}/${timestamp}-${randomSuffix}.${ext}`

        // Convert base64 to buffer
        const buffer = Buffer.from(imageData, 'base64')
        const { error: uploadErr } = await supabase.storage
          .from('order-comments')
          .upload(filePath, buffer, { contentType: `image/${ext}`, upsert: false })

        if (uploadErr) {
          console.error('[comments] Image upload failed:', uploadErr.message)
          return res.status(500).json({ error: `Image upload failed: ${uploadErr.message}` })
        }

        const { data: { publicUrl } } = supabase.storage
          .from('order-comments')
          .getPublicUrl(filePath)
        imageUrl = publicUrl
      }

      const comment = await prisma.orderComment.create({
        data: { orderId, text: text || null, imageUrl }
      })

      console.log(`[comments] Added to order ${order.orderNumber}: ${text ? 'text' : ''}${imageUrl ? ' +image' : ''}`)
      return res.status(201).json({ success: true, comment })
    }

    if (req.method === 'DELETE') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
      const { commentId } = body

      if (!commentId) return res.status(400).json({ error: 'commentId is required' })

      const comment = await prisma.orderComment.findUnique({ where: { id: commentId } })
      if (!comment) return res.status(404).json({ error: 'Comment not found' })

      // Clean up image from Supabase Storage if present
      if (comment.imageUrl) {
        try {
          const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
          )
          const match = comment.imageUrl.match(/\/storage\/v1\/object\/public\/order-comments\/(.+)$/)
          if (match?.[1]) {
            await supabase.storage.from('order-comments').remove([decodeURIComponent(match[1])])
          }
        } catch (e) {
          console.warn('[comments] Failed to delete image from storage:', e.message)
        }
      }

      await prisma.orderComment.delete({ where: { id: commentId } })
      console.log(`[comments] Deleted comment ${commentId}`)
      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('[comments] Error:', error)
    return res.status(500).json({ error: error.message })
  } finally {
    await prisma.$disconnect()
  }
}
