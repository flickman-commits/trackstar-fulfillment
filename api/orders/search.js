/**
 * GET /api/orders/search?q=5038 | jane@example.com | Jane Smith
 *
 * The ⌘K search: standard, custom and partner orders in one list, open or
 * completed, so an order number or a customer's email finds the order
 * whatever view it lives in. Bulk runners are left out; they live in their
 * bulk order. Each hit carries the ref the order view opens at
 * (/orders/5038, or 5038-2 for a later line item).
 */
import prisma from '../_lib/prisma.js'
import { setCors, requireAdmin } from '../_lib/auth.js'
import { sendPublicError } from '../../server/lib/publicError.js'

const LIMIT = 12

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, OPTIONS' })) return
  const actor = await requireAdmin(req, res)
  if (!actor) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const q = String(req.query.q || '').trim().replace(/^#/, '').slice(0, 100)
    if (q.length < 2) return res.status(200).json({ results: [] })
    const text = { contains: q, mode: 'insensitive' }
    const or = [
      { customerEmail: text },
      { customerName: text },
      { runnerName: text },
      { runnerNameOverride: text },
      { bibNumberCustomer: { equals: q, mode: 'insensitive' } },
    ]
    if (/^\d+$/.test(q)) {
      or.push(
        { parentOrderNumber: { startsWith: q } },
        { shopifyOrderData: { path: ['name'], string_starts_with: q } },
        { shopifyOrderData: { path: ['name'], string_starts_with: `#${q}` } },
      )
    }
    const rows = await prisma.order.findMany({
      where: { trackstarOrderType: { in: ['standard', 'custom', 'race_partner'] }, OR: or },
      orderBy: [{ createdAt: 'desc' }],
      take: 40,
      select: {
        id: true, parentOrderNumber: true, lineItemIndex: true, trackstarOrderType: true, status: true, designStatus: true,
        runnerName: true, runnerNameOverride: true, customerName: true, customerEmail: true,
        raceName: true, raceNameOverride: true, raceYear: true, yearOverride: true, createdAt: true,
      },
    })
    // The shop's order number (#5038), read alone rather than the whole Shopify payload.
    const names = rows.length ? await prisma.$queryRaw`SELECT id, "shopifyOrderData"->>'name' AS name FROM "Order" WHERE id = ANY(${rows.map(r => r.id)})` : []
    const nameOf = new Map(names.map(r => [r.id, r.name]))
    // An exact order number first, then the newest.
    const number = o => String(nameOf.get(o.id) || o.parentOrderNumber || '').replace(/^#/, '')
    rows.sort((a, b) => (number(b) === q) - (number(a) === q))
    const results = rows.slice(0, LIMIT).map(o => {
      const n = number(o)
      return {
        ref: o.lineItemIndex ? `${n}-${o.lineItemIndex + 1}` : n,
        number: n,
        type: o.trackstarOrderType,
        done: o.status === 'completed' || o.designStatus === 'sent_to_production',
        runner: o.runnerNameOverride || o.runnerName || null,
        customer: o.customerName || null,
        email: o.customerEmail || null,
        race: [o.raceNameOverride ?? o.raceName, o.yearOverride ?? o.raceYear].filter(Boolean).join(' ') || null,
        createdAt: o.createdAt,
      }
    })
    return res.status(200).json({ results })
  } catch (error) {
    console.error('[API /orders/search] Error:', error)
    return sendPublicError(res, error)
  }
}
