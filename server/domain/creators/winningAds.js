/**
 * Winning ads: ads that are working, kept as links with a note on why. The
 * team adds them in /creators; creators see them in their portal.
 */
import prisma from '../../db.js'

const SHAPE = { id: true, title: true, url: true, imageUrl: true, notes: true, createdAt: true }

export function listWinningAds() {
  return prisma.winningAd.findMany({ orderBy: { createdAt: 'desc' }, select: SHAPE })
}

function cleanUrl(raw) {
  const v = String(raw || '').trim()
  if (!v) return null
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch { return null }
}

export async function addWinningAd({ title, url, imageUrl, notes }, userId) {
  const t = String(title || '').trim().slice(0, 120)
  const link = cleanUrl(url)
  if (!t) throw Object.assign(new Error('A title is required'), { status: 400 })
  if (!link) throw Object.assign(new Error('A valid link is required'), { status: 400 })
  return prisma.winningAd.create({
    data: {
      title: t,
      url: link,
      imageUrl: imageUrl ? cleanUrl(imageUrl) : null,
      notes: String(notes || '').trim().slice(0, 2000) || null,
      createdById: userId || null,
    },
    select: SHAPE,
  })
}

export function removeWinningAd(id) {
  return prisma.winningAd.delete({ where: { id: String(id) }, select: SHAPE })
}
