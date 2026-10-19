/**
 * GET /api/creators/samples?creatorId= - every sample print made for a
 * creator (CREATOR-XXXXXX, -2, -3...), newest first, with where each one is.
 */
import { setCors } from '../_lib/auth.js'
import { requireCapability } from '../_lib/users.js'
import prisma from '../_lib/prisma.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, OPTIONS' })) return
  const user = await requireCapability(req, res, 'creators')
  if (!user) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const id = String(req.query.creatorId || '')
    if (!id) return res.status(400).json({ error: 'creatorId is required' })
    const base = `CREATOR-${id.slice(-6).toUpperCase()}`
    const samples = await prisma.order.findMany({
      where: { source: 'creator_sample', orderNumber: { startsWith: base } },
      orderBy: { createdAt: 'desc' },
      select: { orderNumber: true, status: true, raceName: true, raceYear: true, productSize: true, frameType: true, createdAt: true, trackingNumber: true, trackingCarrier: true, shippedAt: true },
    })
    return res.status(200).json({ samples })
  } catch (error) {
    console.error('[API /creators/samples]', error)
    return res.status(500).json({ error: 'Could not load samples' })
  }
}
