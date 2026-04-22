/**
 * POST /api/orders/create-race-partner
 *
 * Creates a "race_partner" Order row used as the parent for proof/approval
 * workflows sent to race organizations. These are NOT customer orders — they
 * reuse the Order table so we can reuse the existing Proof + ApprovalToken
 * infrastructure. Race-partner rows are excluded from all-orders queries.
 */

import prisma from '../_lib/prisma.js'
import { setCors, requireAdmin } from '../_lib/auth.js'

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'partner'
}

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'POST, OPTIONS' })) return
  if (!requireAdmin(req, res)) return

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { partnerName, raceYear, contactName, contactEmail } = req.body || {}

    if (!partnerName || !String(partnerName).trim()) {
      return res.status(400).json({ error: 'partnerName is required' })
    }

    const year = parseInt(raceYear, 10) || new Date().getFullYear()
    const slug = slugify(partnerName)
    const baseOrderNumber = `RP-${slug}-${year}`

    // Ensure uniqueness against the (parentOrderNumber, lineItemIndex) constraint
    // by probing for existing rows and appending a suffix if needed.
    let orderNumber = baseOrderNumber
    let suffix = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await prisma.order.findFirst({
        where: { parentOrderNumber: orderNumber }
      })
      if (!existing) break
      suffix += 1
      orderNumber = `${baseOrderNumber}-${suffix}`
    }

    // NOTE: We reuse existing Order columns to avoid a schema change:
    //   raceName        → partner/race name
    //   customerName    → partner contact name
    //   customerEmail   → partner contact email
    const created = await prisma.order.create({
      data: {
        orderNumber,
        parentOrderNumber: orderNumber,
        lineItemIndex: 0,
        source: 'race_partner',
        arteloOrderData: {},
        raceName: String(partnerName).trim(),
        raceYear: year,
        runnerName: '—',
        productSize: '—',
        frameType: '—',
        trackstarOrderType: 'race_partner',
        designStatus: 'not_started',
        status: 'pending',
        customerEmail: contactEmail ? String(contactEmail).trim() : null,
        customerName: contactName ? String(contactName).trim() : null,
      }
    })

    console.log(`[API /orders/create-race-partner] Created race partner row ${created.id} (${orderNumber})`)
    return res.status(201).json({ success: true, order: created })
  } catch (error) {
    console.error('[API /orders/create-race-partner] Error:', error)
    return res.status(500).json({ error: error.message })
  }
}
