/**
 * /api/sales/mockups - the co-branded example images cold emails carry.
 *
 *   GET                                          list, each with a signed preview URL
 *   GET  ?companyId=                             ...plus which one would be picked for that org
 *   POST { action:'upload', filename, contentType, data }   data is base64, no data: prefix
 *   POST { action:'delete', id }
 *
 * Upload comes through JSON rather than multipart because a mockup is a
 * handful of hundred kilobytes and the proofs endpoint's formidable setup is
 * far more machinery than that needs.
 */
import { setCors } from '../_lib/auth.js'
import { requireAdminOnly, recordAudit } from '../_lib/users.js'
import prisma from '../_lib/prisma.js'
import {
  listMockups, uploadMockup, deleteMockup, mockupPreviewUrl, pickMockup, isMockupStorageConfigured,
} from '../../server/domain/sales/mockups.js'

// Vercel's JSON body cap is 4.5 MB; base64 inflates by a third, so hold the
// image itself to something that comfortably survives the round trip.
const MAX_BASE64 = 6 * 1024 * 1024

async function withPreviews(files) {
  return Promise.all(files.map(async f => {
    try { return { ...f, previewUrl: await mockupPreviewUrl(f.id) } }
    catch { return { ...f, previewUrl: null } }
  }))
}

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS' })) return
  const actor = await requireAdminOnly(req, res)
  if (!actor) return

  try {
    if (!isMockupStorageConfigured()) {
      return res.status(200).json({ configured: false, mockups: [], selectedId: null })
    }

    if (req.method === 'GET') {
      const files = await listMockups()
      let selectedId = null
      if (req.query?.companyId) {
        const company = await prisma.company.findUnique({
          where: { id: String(req.query.companyId) },
          select: { name: true, notes: true, pipeline: true },
        })
        if (company) selectedId = (await pickMockup(company))?.id || null
      }
      return res.status(200).json({ configured: true, mockups: await withPreviews(files), selectedId })
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})

      if (body.action === 'upload') {
        const data = String(body.data || '')
        if (!data) return res.status(400).json({ error: 'No file data' })
        if (data.length > MAX_BASE64) return res.status(413).json({ error: 'That image is too large. Keep it under about 4 MB.' })
        const bytes = Buffer.from(data, 'base64')
        const saved = await uploadMockup({
          filename: body.filename,
          contentType: String(body.contentType || 'image/png'),
          bytes,
        })
        await recordAudit({ actor, action: 'sales.mockup.upload', summary: `Added the sales mockup ${saved.name}`, detail: { id: saved.id, size: saved.size } })
        return res.status(200).json({ mockup: { ...saved, previewUrl: await mockupPreviewUrl(saved.id).catch(() => null) } })
      }

      if (body.action === 'delete') {
        if (!body.id) return res.status(400).json({ error: 'id is required' })
        await deleteMockup(String(body.id))
        await recordAudit({ actor, action: 'sales.mockup.delete', summary: `Removed the sales mockup ${body.id}`, detail: { id: body.id } })
        return res.status(200).json({ success: true })
      }

      return res.status(400).json({ error: `Unknown action: ${body.action}` })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('[API /sales/mockups]', error)
    return res.status(500).json({ error: error.message })
  }
}
