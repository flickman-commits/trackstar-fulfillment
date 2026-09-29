/**
 * Who fulfills an order.
 *
 * Every standard and custom order gets an assignee when it is imported, from
 * a per-type default kept in SystemConfig ("assignment_defaults", a JSON map
 * of order type to user id) so the defaults can change without a deploy.
 * Anyone on the team can reassign an order afterwards. Partner and bulk
 * orders are not assigned: they are run as projects, not a queue.
 */
import prisma from '../../db.js'

export const ASSIGNABLE_TYPES = ['standard', 'custom']
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
