/**
 * Who fulfills an order.
 *
 * Every order gets an assignee when it comes in, from a per-type default
 * kept in SystemConfig ("assignment_defaults", a JSON map of order type to
 * user id) so the defaults can change without a deploy: standard and custom
 * orders on import, partner orders and bulk runs when they are created.
 * Anyone on the team can reassign afterwards. Help shifts (below) are for
 * the two queues, standard and custom.
 */
import prisma from '../../db.js'

export const ASSIGNABLE_TYPES = ['standard', 'custom', 'race_partner', 'bulk']
export const SHIFT_TYPES = ['standard', 'custom']
const KEY = 'assignment_defaults'

let cache = null
let cachedAt = 0

export async function getAssignmentDefaults({ force = false } = {}) {
  if (!force && cache && Date.now() - cachedAt < 60_000) return cache
  const row = await prisma.systemConfig.findUnique({ where: { key: KEY } })
  let parsed = {}
  try { parsed = row?.value ? JSON.parse(row.value) : {} } catch { parsed = {} }
  cache = parsed
  cachedAt = Date.now()
  return parsed
}

export async function setAssignmentDefaults(map) {
  const clean = {}
  for (const t of ASSIGNABLE_TYPES) if (map?.[t]) clean[t] = String(map[t])
  await prisma.systemConfig.upsert({ where: { key: KEY }, update: { value: JSON.stringify(clean) }, create: { key: KEY, value: JSON.stringify(clean) } })
  cache = clean
  cachedAt = Date.now()
  return clean
}

/** The default assignee id for a new order of this type, or null. Skips deactivated users. */
export async function defaultAssigneeFor(orderType) {
  if (!ASSIGNABLE_TYPES.includes(orderType)) return null
  const defaults = await getAssignmentDefaults()
  const id = defaults[orderType]
  if (!id) return null
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, isActive: true } })
  return user?.isActive ? user.id : null
}

/*
 * Help shifts: extra hands for a busy stretch.
 *
 * Each order type keeps its regular person (the default above). A shift adds
 * a helper for a run of dates (inclusive, business time) with a weight: 1 is
 * an even share with the regular, 2 twice the regular's, 0.5 half. While any
 * shift is on, a new order goes to whoever is furthest below their share of
 * the open queue (unfinished orders of that type), so a helper who is slow
 * or off for a day stops piling up and the work leans the other way.
 *
 * When a shift ends, the helper's unfinished orders of that type go back to
 * the regular (endExpiredShifts, run with every import) and the audit log
 * says so. The helper's account is left alone. Shifts live in SystemConfig
 * ("assignment_shifts"); ended ones are kept a month for the record.
 */
const SHIFTS_KEY = 'assignment_shifts'
export const BUSINESS_TZ = 'America/New_York'
export const SHARE_WEIGHTS = [0.5, 1, 2]
const KEEP_ENDED_DAYS = 30

/** Today's date in business time, as YYYY-MM-DD. */
export function businessDate(at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

export async function getShifts() {
  const row = await prisma.systemConfig.findUnique({ where: { key: SHIFTS_KEY } })
  try { const v = row?.value ? JSON.parse(row.value) : []; return Array.isArray(v) ? v : [] } catch { return [] }
}

async function writeShifts(list) {
  const cutoff = businessDate(new Date(Date.now() - KEEP_ENDED_DAYS * 86400000))
  const kept = list.filter(s => !s.handedBackAt || s.until >= cutoff)
  const v = JSON.stringify(kept)
  await prisma.systemConfig.upsert({ where: { key: SHIFTS_KEY }, update: { value: v }, create: { key: SHIFTS_KEY, value: v } })
  return kept
}

const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))

export function isShiftOn(shift, today = businessDate()) {
  return shift.from <= today && today <= shift.until
}

export async function addShift({ type, userId, weight = 1, from, until }) {
  if (!SHIFT_TYPES.includes(type)) throw new Error('Help is for standard or custom orders')
  if (!isDate(from) || !isDate(until)) throw new Error('Pick the first and last day')
  if (until < from) throw new Error('The last day is before the first')
  if (until < businessDate()) throw new Error('Those dates are already over')
  const w = Number(weight)
  if (!SHARE_WEIGHTS.includes(w)) throw new Error('Pick a share')
  const user = await prisma.user.findUnique({ where: { id: String(userId) }, select: { id: true, isActive: true, firstName: true } })
  if (!user?.isActive) throw new Error('Pick an active teammate')
  const regular = (await getAssignmentDefaults({ force: true }))[type]
  if (regular === user.id) throw new Error(`${user.firstName} already gets every ${type} order`)
  const list = await getShifts()
  if (list.some(s => s.type === type && s.userId === user.id && !s.handedBackAt && s.from <= until && from <= s.until)) {
    throw new Error(`${user.firstName} already has a shift on those days`)
  }
  const shift = { id: `shift_${Date.now().toString(36)}`, type, userId: user.id, weight: w, from, until, createdAt: new Date().toISOString() }
  await writeShifts([...list, shift])
  return shift
}

/**
 * End a shift now. One that has not started is dropped; one that has is
 * closed as of yesterday, and its unfinished orders go back right away.
 */
export async function endShift(id) {
  const list = await getShifts()
  const s = list.find(x => x.id === id)
  if (!s) throw new Error('No such shift')
  const today = businessDate()
  const yesterday = businessDate(new Date(Date.now() - 86400000))
  const next = s.from > today
    ? list.filter(x => x.id !== id)
    : list.map(x => x.id === id ? { ...x, until: yesterday, endedEarlyAt: new Date().toISOString() } : x)
  await writeShifts(next)
  return endExpiredShifts()
}

/** Who takes orders of this type today, with their weights. Regular first. */
export async function rosterFor(orderType, today = businessDate()) {
  if (!ASSIGNABLE_TYPES.includes(orderType)) return []
  const regular = await defaultAssigneeFor(orderType)
  const shifts = (await getShifts()).filter(s => s.type === orderType && isShiftOn(s, today))
  const roster = regular ? [{ userId: regular, weight: 1, regular: true }] : []
  for (const s of shifts) {
    if (roster.some(r => r.userId === s.userId)) continue
    const u = await prisma.user.findUnique({ where: { id: s.userId }, select: { isActive: true } })
    if (u?.isActive) roster.push({ userId: s.userId, weight: s.weight, regular: false, shiftId: s.id })
  }
  return roster
}

/**
 * Unfinished work of this type, per assignee. A bulk run counts once until it
 * is sent to Artelo; a partner order until the partner approves a design.
 */
export async function openCounts(orderType, userIds) {
  const rows = orderType === 'bulk'
    ? await prisma.bulkOrder.groupBy({
      by: ['assigneeId'],
      where: { status: { not: 'submitted' }, assigneeId: { in: userIds } },
      _count: { _all: true },
    })
    : await prisma.order.groupBy({
      by: ['assigneeId'],
      where: {
        trackstarOrderType: orderType, status: { not: 'completed' }, assigneeId: { in: userIds },
        ...(orderType === 'race_partner' ? { designStatus: { notIn: ['sent_to_production', 'approved_by_customer'] } } : {}),
      },
      _count: { _all: true },
    })
  return Object.fromEntries(userIds.map(id => [id, rows.find(r => r.assigneeId === id)?._count._all || 0]))
}

/** Whoever is furthest below their share; ties go to the regular, then the order shifts were added. */
export function pickByShare(roster, counts) {
  let best = null
  for (const r of roster) {
    const load = (counts[r.userId] || 0) / r.weight
    if (!best || load < best.load) best = { userId: r.userId, load }
  }
  return best?.userId || null
}

/** The assignee for a new order: the regular, or the roster's share balance while help is on. */
export async function assigneeForNewOrder(orderType) {
  const roster = await rosterFor(orderType)
  if (roster.length <= 1) return roster[0]?.userId || null
  return pickByShare(roster, await openCounts(orderType, roster.map(r => r.userId)))
}

/**
 * Give a helper their share of the queue that is already waiting: orders of
 * the type nobody has started (no proofs, design not started), newest first,
 * so the regular keeps the front of the line they are working through.
 */
export async function spreadQueue(shiftId) {
  const s = (await getShifts()).find(x => x.id === shiftId)
  if (!s || !isShiftOn(s)) throw new Error('That shift is not on today')
  const roster = await rosterFor(s.type)
  const ids = roster.map(r => r.userId)
  const counts = await openCounts(s.type, ids)
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const weightSum = roster.reduce((a, r) => a + r.weight, 0)
  const want = Math.floor(total * (s.weight / weightSum)) - (counts[s.userId] || 0)
  if (want <= 0) return { moved: 0, orderIds: [] }
  const others = ids.filter(id => id !== s.userId)
  const candidates = await prisma.order.findMany({
    where: { trackstarOrderType: s.type, status: { not: 'completed' }, designStatus: 'not_started', assigneeId: { in: others }, proofs: { none: {} } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
    take: want,
  })
  const orderIds = candidates.map(c => c.id)
  if (orderIds.length) await prisma.order.updateMany({ where: { id: { in: orderIds } }, data: { assigneeId: s.userId } })
  return { moved: orderIds.length, orderIds }
}

/**
 * Shifts whose last day has passed: hand the helper's unfinished orders of
 * that type back to the regular, once. A helper still on another shift for
 * the same type keeps them.
 */
export async function endExpiredShifts() {
  const today = businessDate()
  const list = await getShifts()
  const due = list.filter(s => !s.handedBackAt && s.until < today)
  if (!due.length) return { handedBack: 0 }
  let handedBack = 0
  for (const s of due) {
    const stillOn = list.some(o => o.id !== s.id && o.type === s.type && o.userId === s.userId && isShiftOn(o, today))
    const regular = await defaultAssigneeFor(s.type)
    if (!stillOn && regular && regular !== s.userId) {
      const r = await prisma.order.updateMany({
        where: { trackstarOrderType: s.type, assigneeId: s.userId, status: { not: 'completed' } },
        data: { assigneeId: regular },
      })
      handedBack += r.count
      const [helper, reg] = await Promise.all([
        prisma.user.findUnique({ where: { id: s.userId }, select: { firstName: true } }),
        prisma.user.findUnique({ where: { id: regular }, select: { firstName: true } }),
      ])
      await prisma.auditEvent.create({
        data: {
          action: 'order.shift-ended',
          summary: `${helper?.firstName || 'Helper'}'s ${s.type} shift ended: ${r.count} unfinished order${r.count === 1 ? '' : 's'} back to ${reg?.firstName || 'the regular'}`,
          detail: { shift: s, moved: r.count },
          userId: null,
          actorEmail: 'system',
        },
      }).catch(err => console.warn(`[assignment] audit not saved: ${err.message}`))
    }
    s.handedBackAt = new Date().toISOString()
  }
  await writeShifts(list)
  return { handedBack }
}

/** True when this person gets new orders of this type automatically today. */
export async function isAutoAssignee(orderType, userId) {
  return (await rosterFor(orderType)).some(r => r.userId === userId)
}
