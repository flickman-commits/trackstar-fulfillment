/**
 * POST /api/orders/photo - admin only. Attach a customer's photo after
 * purchase (they emailed it), to one print or every print on the order.
 *
 *   { action: 'upload-url', filename }        signed upload slot in the
 *                                             personalization-photos bucket
 *   { action: 'attach', orderIds, path }      set the photo on those prints
 *   { action: 'remove', orderId }             take a hand-attached photo off
 *   { action: 'replace', orderId, path }      swap the photo on a print that has one
 *                                             (the customer emailed a different one);
 *                                             never bills, keeps how it was paid for
 *
 * With charge: true (Shopify orders) it also edits the Shopify order to add
 * one Photo Add-On per print, and Shopify emails the customer a link to pay
 * the difference. If that edit fails (say the app lacks write_order_edits),
 * the photo is still attached and the answer says so, so it can be added by
 * hand in Shopify. Either way the photo is "not paid" until Shopify reads
 * paid, and the print cannot be completed before then (photoPayment.js).
 */
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { setCors, requireAdmin } from '../_lib/auth.js'
import { requireAdminRole, recordAudit } from '../_lib/users.js'
import prisma from '../_lib/prisma.js'
import { addVariantToOrder, PHOTO_ADDON_VARIANT_ID } from '../../server/services/shopifyOrderEdit.js'

const BUCKET = 'personalization-photos'
const EXTS = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp'])

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'POST, OPTIONS' })) return
  const actor = requireAdmin(req, res)
  if (!actor) return
  const admin = await requireAdminRole(req, res, actor)
  if (!admin) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})

    if (body.action === 'upload-url') {
      let ext = String(body.filename || 'photo.jpg').split('.').pop().toLowerCase()
      if (!EXTS.has(ext)) ext = 'jpg'
      if (ext === 'jpeg') ext = 'jpg'
      // Same shape as checkout uploads, so the viewer and retention sweep treat it alike.
      const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
      if (error) return res.status(500).json({ error: `Could not start the upload: ${error.message}` })
      return res.status(200).json({ path, uploadUrl: data.signedUrl })
    }

    if (body.action === 'replace') {
      const path = String(body.path || '')
      if (!/^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.[a-z]+$/.test(path)) return res.status(400).json({ error: 'Not an uploaded photo path' })
      const o = await prisma.order.findUnique({ where: { id: String(body.orderId || '') }, select: { id: true, orderNumber: true, photoPath: true } })
      if (!o) return res.status(404).json({ error: 'Order not found' })
      if (!o.photoPath) return res.status(400).json({ error: 'This print has no photo to replace. Add one instead.' })
      // The new photo has to be placed again, and any design made with the old one is out of date.
      await prisma.order.update({ where: { id: o.id }, data: { photoPath: path, photoPlacedAt: null } })
      await recordAudit({
        action: 'order.photo-replaced',
        summary: `Replaced the customer photo on ${o.orderNumber}`,
        detail: { orderId: o.id, from: o.photoPath, to: path },
        actor: admin,
      })
      return res.status(200).json({ ok: true, photoPath: path })
    }

    if (body.action === 'attach') {
      const path = String(body.path || '')
      if (!/^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.[a-z]+$/.test(path)) return res.status(400).json({ error: 'Not an uploaded photo path' })
      const ids = (Array.isArray(body.orderIds) ? body.orderIds : []).map(String).slice(0, 20)
      if (!ids.length) return res.status(400).json({ error: 'Pick at least one print' })
      const rows = await prisma.order.findMany({ where: { id: { in: ids } }, select: { id: true, orderNumber: true, parentOrderNumber: true, source: true } })
      if (rows.length !== ids.length || new Set(rows.map(r => r.parentOrderNumber)).size !== 1) {
        return res.status(400).json({ error: 'Those prints are not all on one order' })
      }
      await prisma.order.updateMany({ where: { id: { in: ids } }, data: { photoPath: path, photoAddedManually: true, photoPlacedAt: null } })

      // Bill for it: one Photo Add-On per print, on the same Shopify order.
      let charged = false, chargeError = null
      if (body.charge && rows[0].source === 'shopify') {
        try {
          await addVariantToOrder(rows[0].parentOrderNumber, PHOTO_ADDON_VARIANT_ID, ids.length,
            `Photo Add-On x${ids.length} added from the fulfillment tool by ${admin.firstName || 'an admin'}`)
          charged = true
        } catch (error) {
          console.error('[API /orders/photo] Shopify order edit failed:', error.message)
          chargeError = /access|scope|permission|denied/i.test(error.message)
            ? 'Shopify did not let the tool edit the order (the app needs the write_order_edits permission). Add the Photo Add-On to the order in Shopify by hand.'
            : 'The photo is attached, but adding the Photo Add-On in Shopify failed. Add it to the order in Shopify by hand.'
        }
      }
      await recordAudit({
        action: 'order.photo-added',
        summary: `Added a customer photo to ${rows.map(r => r.orderNumber).join(', ')}`,
        detail: { orderIds: ids, path, charged, chargeError },
        actor: admin,
      })
      return res.status(200).json({ ok: true, photoPath: path, charged, chargeError })
    }

    if (body.action === 'remove') {
      const o = await prisma.order.findUnique({ where: { id: String(body.orderId || '') }, select: { id: true, orderNumber: true, photoAddedManually: true } })
      if (!o) return res.status(404).json({ error: 'Order not found' })
      if (!o.photoAddedManually) return res.status(400).json({ error: 'Only a photo added here can be removed here' })
      await prisma.order.update({ where: { id: o.id }, data: { photoPath: null, photoAddedManually: false, photoPlacedAt: null } })
      await recordAudit({ action: 'order.photo-removed', summary: `Removed the customer photo from ${o.orderNumber}`, detail: { orderId: o.id }, actor: admin })
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (error) {
    console.error('[API /orders/photo]', error)
    return res.status(500).json({ error: 'Photo update failed' })
  }
}
