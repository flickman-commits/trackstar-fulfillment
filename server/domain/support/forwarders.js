/**
 * Who may forward a customer's email to fast@ and have it become that
 * customer's conversation (forwards.js does the unwrapping). Anyone at our
 * own domain, anyone with a login here (their sign-in address), and the
 * addresses an admin lists in Settings: the other inboxes the team still
 * gets support mail in (Matt's matt@flickmanmedia.com).
 *
 * A forward from anyone else stays as written: a customer forwarding us an
 * email from their race is still that customer writing to us.
 */
import prisma from '../../db.js'
import { UserError } from './errors.js'

const KEY = 'support_forwarders'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
let cache = { at: 0, set: null }

export async function listForwarders() {
  const row = await prisma.systemConfig.findUnique({ where: { key: KEY } })
  try { return Array.isArray(JSON.parse(row?.value || '[]')) ? JSON.parse(row.value) : [] } catch { return [] }
}

export async function saveForwarders(list) {
  const clean = [...new Set((Array.isArray(list) ? list : []).map(e => String(e || '').trim().toLowerCase()).filter(Boolean))]
  const bad = clean.find(e => !EMAIL.test(e))
  if (bad) throw new UserError(`"${bad}" is not an email address`)
  if (clean.length > 50) throw new UserError('Fifty addresses at most')
  await prisma.systemConfig.upsert({ where: { key: KEY }, update: { value: JSON.stringify(clean) }, create: { key: KEY, value: JSON.stringify(clean) } })
  cache = { at: 0, set: null }
  return clean
}

/** Listed in Settings, or the sign-in address of someone on the team. Our own domain is checked by the caller (isOurs). */
export async function isForwarder(email) {
  const e = String(email || '').trim().toLowerCase()
  if (!e) return false
  if (!cache.set || Date.now() - cache.at > 60_000) {
    const [listed, users] = await Promise.all([listForwarders(), prisma.user.findMany({ select: { email: true } })])
    cache = { at: Date.now(), set: new Set([...listed, ...users.map(u => String(u.email || '').toLowerCase())]) }
  }
  return cache.set.has(e)
}
