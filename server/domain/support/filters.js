/**
 * Sender filters: mail that is not customer support, kept out of the inbox.
 *
 * A filter is an address (orders@artelo.com) or a whole domain (artelo.com).
 * A domain is an admin's to add, and never a consumer provider (gmail.com).
 * A conversation from a filtered sender is marked `filtered` as it arrives,
 * goes to nobody, and shows in no inbox view, only under Filtered, where it
 * can be read and unfiltered. Nothing is deleted, in Gmail or here. Adding a
 * filter files the existing conversations from that sender too; removing it
 * brings them back.
 *
 * The list lives in SystemConfig as JSON, cached briefly per instance: the
 * import checks it for every new conversation.
 */
import prisma from '../../db.js'
import { UserError } from './errors.js'

const KEY = 'support_sender_filters'
let cache = { at: 0, list: null }

/** "Orders@Artelo.com " -> "orders@artelo.com"; "@artelo.com" or "https://artelo.com" -> "artelo.com". Null when it is neither. */
export function normalizePattern(raw) {
  let s = String(raw || '').trim().toLowerCase()
  s = s.replace(/^mailto:/, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^@/, '').replace(/^www\./, '')
  if (/^[^@\s]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return s
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(s)) return s
  return null
}

/** Whether an address is caught by a pattern: the address itself, or its domain or a parent domain. */
export function matches(email, pattern) {
  const e = String(email || '').toLowerCase()
  if (!e || !pattern) return false
  if (pattern.includes('@')) return e === pattern
  const domain = e.split('@')[1] || ''
  return domain === pattern || domain.endsWith(`.${pattern}`)
}

export async function listFilters() {
  if (cache.list && Date.now() - cache.at < 30_000) return cache.list
  const row = await prisma.systemConfig.findUnique({ where: { key: KEY } })
  let list = []
  try { list = JSON.parse(row?.value || '[]') } catch { list = [] }
  cache = { at: Date.now(), list }
  return list
}

async function saveFilters(list) {
  const v = JSON.stringify(list)
  await prisma.systemConfig.upsert({ where: { key: KEY }, update: { value: v }, create: { key: KEY, value: v } })
  cache = { at: Date.now(), list }
}

/** Whether mail from this address is filtered out. */
export async function isFiltered(email) {
  const list = await listFilters()
  return list.some(f => matches(email, f.pattern))
}

/** The where clause for conversations a pattern catches. */
function threadsFor(pattern) {
  return pattern.includes('@')
    ? { customerEmail: { equals: pattern, mode: 'insensitive' } }
    : { OR: [{ customerEmail: { endsWith: `@${pattern}`, mode: 'insensitive' } }, { customerEmail: { endsWith: `.${pattern}`, mode: 'insensitive' } }] }
}

/**
 * Domains millions of customers write from. Filtering one would file most of
 * the inbox; filter the one address instead.
 */
export const CONSUMER_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'aol.com',
  'me.com', 'mac.com', 'live.com', 'msn.com', 'proton.me', 'protonmail.com', 'comcast.net', 'att.net', 'verizon.net',
])

/** Why this pattern may not be added by this person, or null when it may. */
export function filterRefusal(pattern, actor) {
  if (pattern.includes('@')) return null
  const consumer = [...CONSUMER_DOMAINS].some(d => pattern === d || d.endsWith(`.${pattern}`))
  if (consumer) return `${pattern} is where most customers write from. Filter the one address instead, like orders@${pattern}.`
  if (actor?.role !== 'admin') return 'Filtering a whole domain is an admin\'s call. Filter the one address, or ask Matt.'
  return null
}

/** Add a filter and file what is already here from that sender. */
export async function addFilter(raw, actor) {
  const pattern = normalizePattern(raw)
  if (!pattern) throw new UserError('A filter is an email address or a domain, like artelo.com')
  const refused = filterRefusal(pattern, actor)
  if (refused) throw new UserError(refused)
  const ours = String(process.env.SUPPORT_MAILBOX_EMAIL || 'fast@trackstar.art').split('@')[1]
  if (pattern === ours || pattern.endsWith(`@${ours}`)) throw new UserError('That is our own domain. Filtering it would hide our replies.')
  const list = await listFilters()
  if (!list.some(f => f.pattern === pattern)) {
    list.push({ pattern, addedBy: [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') || null, addedAt: new Date().toISOString() })
    await saveFilters(list)
  }
  const { count } = await prisma.supportThread.updateMany({ where: { ...threadsFor(pattern), channel: 'email', filtered: false }, data: { filtered: true, assigneeId: null } })
  return { pattern, filed: count, filters: list }
}

/** Remove a filter and bring back the conversations nothing else still filters. */
export async function removeFilter(raw) {
  const pattern = normalizePattern(raw) || String(raw || '').trim().toLowerCase()
  const list = (await listFilters()).filter(f => f.pattern !== pattern)
  await saveFilters(list)
  const caught = await prisma.supportThread.findMany({ where: { ...threadsFor(pattern), filtered: true }, select: { id: true, customerEmail: true } })
  const back = caught.filter(t => !list.some(f => matches(t.customerEmail, f.pattern))).map(t => t.id)
  if (back.length) await prisma.supportThread.updateMany({ where: { id: { in: back } }, data: { filtered: false } })
  return { pattern, restored: back.length, filters: list }
}
