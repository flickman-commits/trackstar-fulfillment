/**
 * Custom designs finished per designer in a month (Eastern time), for payouts.
 * See api/admin/custom-counter.js.
 */
import prisma from '../../db.js'

const TZ = 'America/New_York'
const monthOf = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(d).slice(0, 7)

export async function customCounter(month) {
  const [y, m] = month.split('-').map(Number)
  // A day of slack each side, then the exact Eastern month in JS.
  const from = new Date(Date.UTC(y, m - 1, 1) - 86400000)
  const to = new Date(Date.UTC(y, m, 1) + 86400000)
  const rows = await prisma.order.findMany({
    where: {
      trackstarOrderType: 'custom',
      designStatus: 'sent_to_production',
      OR: [
        { designCompletedAt: { gte: from, lt: to } },
        { designCompletedAt: null, researchedAt: { gte: from, lt: to } },
      ],
    },
    select: {
      id: true, orderNumber: true, parentOrderNumber: true, lineItemIndex: true, runnerName: true, raceName: true, raceYear: true,
      customerName: true, isRushOrder: true, designCompletedAt: true, designCompletedById: true, researchedAt: true, assigneeId: true,
      shopifyOrderData: true,
    },
  })
  const users = await prisma.user.findMany({ select: { id: true, firstName: true, lastName: true } })
  const byId = new Map(users.map(u => [u.id, u]))
  const groups = new Map()
  for (const o of rows) {
    const at = o.designCompletedAt || o.researchedAt
    if (!at || monthOf(at) !== month) continue
    const who = o.designCompletedById || o.assigneeId || null
    if (!groups.has(who)) {
      const u = who ? byId.get(who) : null
      groups.set(who, { userId: who, name: u ? `${u.firstName} ${u.lastName}`.trim() : 'Unattributed', orders: [] })
    }
    const sd = o.shopifyOrderData
    const name = sd && typeof sd === 'object' && 'name' in sd ? String(sd.name) : `#${o.parentOrderNumber}`
    groups.get(who).orders.push({
      id: o.id, orderNumber: o.orderNumber, display: name, item: o.lineItemIndex + 1,
      runnerName: o.runnerName, race: [o.raceName, o.raceYear].filter(Boolean).join(' '), customerName: o.customerName,
      rush: o.isRushOrder, completedAt: at.toISOString(), estimated: !o.designCompletedAt,
    })
  }
  const designers = [...groups.values()]
    .map(g => ({ ...g, count: g.orders.length, orders: g.orders.sort((a, b) => a.completedAt.localeCompare(b.completedAt)) }))
    .sort((a, b) => (a.userId ? 0 : 1) - (b.userId ? 0 : 1) || b.count - a.count)
  return { month, total: designers.reduce((n, d) => n + d.count, 0), designers }
}
