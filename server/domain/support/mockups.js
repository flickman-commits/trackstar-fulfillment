/**
 * Mockups a rep can send a customer: what the order's print looks like.
 *
 * Two places hold them, the same two the fulfillment side shows:
 *   render  an automated design's PNG preview (RenderJob.previewPath, in the
 *           private production-files bucket), newest finished version per item
 *   proof   a custom order's proof images (Proof.imageUrl, public), newest
 *           version, all images of it
 *
 * The page only ever handles a reference ("render:<id>", "proof:<id>"); the
 * server resolves it to bytes when the reply is sent, so a customer's
 * picture never round-trips through the browser and nothing the browser
 * sends can make the server fetch an arbitrary URL.
 */
import { createClient } from '@supabase/supabase-js'
import { readUpload } from './uploads.js'
import prisma from '../../db.js'
import { BUCKET } from '../render/jobs.js'

function storage() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

/** Every mockup for these order rows, newest first, with a short-lived thumbnail to show. */
export async function listMockups(orderIds) {
  const ids = [...new Set((orderIds || []).filter(Boolean))]
  if (!ids.length) return []
  const [jobs, proofs] = await Promise.all([
    prisma.renderJob.findMany({
      where: { orderId: { in: ids }, status: 'done', previewPath: { not: null } },
      orderBy: [{ version: 'desc' }],
      select: { id: true, orderId: true, version: true, review: true, previewPath: true, finishedAt: true, createdAt: true },
    }),
    prisma.proof.findMany({
      where: { orderId: { in: ids } },
      orderBy: [{ version: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, orderId: true, version: true, status: true, imageUrl: true, thumbnailUrl: true, createdAt: true },
    }),
  ])

  const out = []
  // Renders: the newest finished one per order row, unless it was rejected.
  const seenRender = new Set()
  const sb = jobs.length ? storage() : null
  for (const j of jobs) {
    if (seenRender.has(j.orderId) || j.review === 'rejected') continue
    seenRender.add(j.orderId)
    let thumbUrl = null
    try { thumbUrl = (await sb.storage.from(BUCKET).createSignedUrl(j.previewPath, 3600)).data?.signedUrl || null } catch { /* the chip shows without a picture */ }
    out.push({ ref: `render:${j.id}`, orderId: j.orderId, kind: 'render', label: `Design v${j.version}${j.review === 'approved' ? ', approved' : ''}`, thumbUrl, at: j.finishedAt || j.createdAt })
  }
  // Proofs: every image of the newest version per order row.
  const newest = new Map()
  for (const p of proofs) if (!newest.has(p.orderId)) newest.set(p.orderId, p.version)
  for (const p of proofs) {
    if (newest.get(p.orderId) !== p.version) continue
    out.push({ ref: `proof:${p.id}`, orderId: p.orderId, kind: 'proof', label: `Proof v${p.version}${p.status === 'approved' ? ', approved' : ''}`, thumbUrl: p.thumbnailUrl || p.imageUrl, at: p.createdAt })
  }
  return out
}

function extFor(type) {
  return type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png'
}

/**
 * A reference to the file the customer gets: its bytes for email, a link
 * Meta can fetch for a DM (signed for a day, which outlives the send), and
 * a name. Throws for a reference that is not one of ours.
 */
export async function resolveMockup(ref, { filenameStem = 'Your Trackstar print' } = {}) {
  const [kind, id] = String(ref || '').split(':')
  // A file the rep attached from their computer keeps its own name.
  if (kind === 'upload') return readUpload(String(ref).slice('upload:'.length))
  if (kind === 'render') {
    const j = await prisma.renderJob.findUnique({ where: { id: String(id) }, select: { previewPath: true, status: true } })
    if (!j?.previewPath || j.status !== 'done') throw new Error('That design is not ready')
    const sb = storage()
    const { data, error } = await sb.storage.from(BUCKET).download(j.previewPath)
    if (error || !data) throw new Error('Could not read the design file')
    const bytes = Buffer.from(await data.arrayBuffer())
    const url = (await sb.storage.from(BUCKET).createSignedUrl(j.previewPath, 86400)).data?.signedUrl || null
    return { bytes, contentType: 'image/png', filename: `${filenameStem}.png`, url }
  }
  if (kind === 'proof') {
    const p = await prisma.proof.findUnique({ where: { id: String(id) }, select: { imageUrl: true } })
    if (!p?.imageUrl) throw new Error('That proof is gone')
    // Only our own storage: the URL comes from our table, and is checked anyway.
    const host = new URL(p.imageUrl).host
    const ours = new URL(process.env.SUPABASE_URL || 'https://invalid').host
    if (host !== ours) throw new Error('That proof is not in our storage')
    const res = await fetch(p.imageUrl)
    if (!res.ok) throw new Error(`Could not read the proof (${res.status})`)
    const type = (res.headers.get('content-type') || 'image/png').split(';')[0]
    const bytes = Buffer.from(await res.arrayBuffer())
    return { bytes, contentType: type, filename: `${filenameStem}.${extFor(type)}`, url: p.imageUrl }
  }
  throw new Error('Unknown attachment')
}
