/**
 * Design Survey: community votes on new design options.
 *
 * We upload a handful of options (the proof portal's upload path), share
 * /vote/{token} on an Instagram story, and each visitor picks one and can say
 * why. One vote per browser (a random voterId the page keeps), and voting
 * again changes the vote rather than adding one.
 */
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import prisma from '../../../api/_lib/prisma.js'

const BUCKET = 'order-proofs'
const MAX_OPTIONS = 12
const MAX_COMMENT = 500

const supabase = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const newToken = () => crypto.randomBytes(9).toString('base64url')

export function hashIp(ip) {
  const salt = process.env.SESSION_SECRET || 'survey'
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32)
}

export async function listSurveys() {
  const rows = await prisma.designSurvey.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { votes: true, options: true } }, options: { orderBy: { sortOrder: 'asc' }, take: 1, select: { thumbnailUrl: true, imageUrl: true } } },
  })
  return rows.map(s => ({
    id: s.id, token: s.token, title: s.title, status: s.status, createdAt: s.createdAt,
    votes: s._count.votes, optionCount: s._count.options,
    cover: s.options[0]?.thumbnailUrl || s.options[0]?.imageUrl || null,
  }))
}

export async function createSurvey({ title, question, createdById }) {
  const t = String(title || '').trim().slice(0, 120)
  if (!t) throw new Error('A title is required')
  return prisma.designSurvey.create({
    data: { title: t, question: String(question || '').trim().slice(0, 200) || null, token: newToken(), createdById: createdById || null },
  })
}

export async function updateSurvey(id, { title, question, status }) {
  const data = {}
  if (title !== undefined) data.title = String(title).trim().slice(0, 120) || 'Untitled survey'
  if (question !== undefined) data.question = String(question || '').trim().slice(0, 200) || null
  if (status !== undefined) data.status = status === 'closed' ? 'closed' : 'open'
  return prisma.designSurvey.update({ where: { id }, data })
}

/** Storage paths behind an option's URLs, so removing it removes the files. */
function storagePaths(...urls) {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  return urls.filter(Boolean).map(u => String(u).split(marker)[1]).filter(Boolean).map(decodeURIComponent)
}

export async function deleteSurvey(id) {
  const opts = await prisma.surveyOption.findMany({ where: { surveyId: id }, select: { imageUrl: true, thumbnailUrl: true } })
  await prisma.designSurvey.delete({ where: { id } })
  const paths = opts.flatMap(o => storagePaths(o.imageUrl, o.thumbnailUrl))
  if (paths.length) await supabase().storage.from(BUCKET).remove(paths).catch(() => {})
}

/** A signed URL the browser uploads the original to, straight into storage. */
export async function startUpload(surveyId, filename) {
  const ext = String(filename || 'option.png').split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  const path = `surveys/${surveyId}/raw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUploadUrl(path)
  if (error) throw new Error(`Could not start the upload: ${error.message}`)
  return { path, uploadUrl: data.signedUrl }
}

/**
 * Turn an uploaded original into an option: a web-size copy (phones on a story
 * link, so 1500px is plenty) and a thumbnail, then drop the raw file.
 */
export async function addOption(surveyId, rawPath, label) {
  if (!String(rawPath).startsWith(`surveys/${surveyId}/raw-`)) throw new Error('Unexpected upload path')
  const count = await prisma.surveyOption.count({ where: { surveyId } })
  if (count >= MAX_OPTIONS) throw new Error(`A survey can have at most ${MAX_OPTIONS} options`)

  const sb = supabase()
  const { data: blob, error } = await sb.storage.from(BUCKET).download(rawPath)
  if (error || !blob) throw new Error('The uploaded file could not be read back')
  const buffer = Buffer.from(await blob.arrayBuffer())

  const sharp = (await import('sharp')).default
  const web = await sharp(buffer).rotate().resize(1500, null, { withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
  const thumb = await sharp(buffer).rotate().resize(400, null, { withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const webPath = `surveys/${surveyId}/${stamp}.jpg`
  const thumbPath = `surveys/${surveyId}/${stamp}-thumb.jpg`
  for (const [p, b] of [[webPath, web], [thumbPath, thumb]]) {
    const { error: upErr } = await sb.storage.from(BUCKET).upload(p, b, { contentType: 'image/jpeg', upsert: false })
    if (upErr) throw new Error(`Image upload failed: ${upErr.message}`)
  }
  await sb.storage.from(BUCKET).remove([rawPath]).catch(() => {})

  return prisma.surveyOption.create({
    data: {
      surveyId,
      label: String(label || '').trim().slice(0, 60) || null,
      imageUrl: sb.storage.from(BUCKET).getPublicUrl(webPath).data.publicUrl,
      thumbnailUrl: sb.storage.from(BUCKET).getPublicUrl(thumbPath).data.publicUrl,
      sortOrder: count,
    },
  })
}

export async function updateOption(optionId, { label, sortOrder }) {
  const data = {}
  if (label !== undefined) data.label = String(label || '').trim().slice(0, 60) || null
  if (sortOrder !== undefined) data.sortOrder = Number(sortOrder) || 0
  return prisma.surveyOption.update({ where: { id: optionId }, data })
}

export async function removeOption(optionId) {
  const o = await prisma.surveyOption.delete({ where: { id: optionId } })
  const paths = storagePaths(o.imageUrl, o.thumbnailUrl)
  if (paths.length) await supabase().storage.from(BUCKET).remove(paths).catch(() => {})
}

/** Everything the admin page shows: options with tallies, and every comment. */
export async function surveyResults(id) {
  const s = await prisma.designSurvey.findUnique({
    where: { id },
    include: {
      options: { orderBy: { sortOrder: 'asc' }, include: { _count: { select: { votes: true } } } },
      votes: { orderBy: { createdAt: 'desc' }, select: { id: true, optionId: true, comment: true, createdAt: true, ipHash: true } },
    },
  })
  if (!s) return null
  const total = s.votes.length
  // Votes from one network beyond a handful are worth a glance, not a block:
  // a whole office or a dorm shares an address.
  const perIp = {}
  for (const v of s.votes) if (v.ipHash) perIp[v.ipHash] = (perIp[v.ipHash] || 0) + 1
  const crowded = Object.values(perIp).filter(n => n > 5).reduce((a, n) => a + n, 0)
  return {
    id: s.id, token: s.token, title: s.title, question: s.question, status: s.status, createdAt: s.createdAt,
    total, crowdedVotes: crowded,
    options: s.options.map((o, i) => ({
      id: o.id, label: o.label, name: o.label || `Option ${i + 1}`, imageUrl: o.imageUrl, thumbnailUrl: o.thumbnailUrl,
      sortOrder: o.sortOrder, votes: o._count.votes, share: total ? Math.round((o._count.votes / total) * 100) : 0,
    })),
    comments: s.votes.filter(v => v.comment).map(v => ({ id: v.id, optionId: v.optionId, comment: v.comment, createdAt: v.createdAt })),
  }
}

/* ── Public side ───────────────────────────────────────────────────────── */

/** What a voter sees. No counts, so the first votes do not steer the rest. */
export async function publicSurvey(token, voterId) {
  const s = await prisma.designSurvey.findUnique({
    where: { token },
    include: { options: { orderBy: { sortOrder: 'asc' }, select: { id: true, label: true, imageUrl: true, thumbnailUrl: true } } },
  })
  if (!s) return null
  const mine = voterId
    ? await prisma.surveyVote.findUnique({ where: { surveyId_voterId: { surveyId: s.id, voterId: String(voterId).slice(0, 64) } }, select: { optionId: true, comment: true } })
    : null
  return {
    title: s.title,
    question: s.question || 'Which design is your favorite?',
    open: s.status === 'open',
    options: s.options.map((o, i) => ({ id: o.id, name: o.label || `Option ${i + 1}`, imageUrl: o.imageUrl, thumbnailUrl: o.thumbnailUrl })),
    myVote: mine ? { optionId: mine.optionId, comment: mine.comment } : null,
  }
}

export async function castVote(token, { voterId, optionId, comment, ip }) {
  const vid = String(voterId || '').trim().slice(0, 64)
  if (vid.length < 8) throw Object.assign(new Error('bad_voter'), { code: 400 })
  const s = await prisma.designSurvey.findUnique({ where: { token }, select: { id: true, status: true } })
  if (!s) throw Object.assign(new Error('not_found'), { code: 404 })
  if (s.status !== 'open') throw Object.assign(new Error('closed'), { code: 409 })
  const opt = await prisma.surveyOption.findFirst({ where: { id: String(optionId || ''), surveyId: s.id }, select: { id: true } })
  if (!opt) throw Object.assign(new Error('bad_option'), { code: 400 })
  const text = String(comment || '').trim().slice(0, MAX_COMMENT) || null
  await prisma.surveyVote.upsert({
    where: { surveyId_voterId: { surveyId: s.id, voterId: vid } },
    update: { optionId: opt.id, comment: text },
    create: { surveyId: s.id, optionId: opt.id, voterId: vid, comment: text, ipHash: ip ? hashIp(ip) : null },
  })
  return { ok: true }
}
