/**
 * The `state` on an OAuth round trip (Google for the support mailbox and a
 * rep's Gmail, Instagram for the DM inbox).
 *
 * Without it, anyone could send a signed-in teammate to our callback with a
 * code from their own account and have the app connect that account. So the
 * connect step makes a random value and keeps it twice: in a short-lived
 * HttpOnly cookie on the browser that started, and in SystemConfig under the
 * person's id. The callback accepts the code only when the state Google or
 * Meta hands back matches both, compared in constant time, within ten
 * minutes. Each state works once.
 */
import crypto from 'crypto'
import prisma from '../../db.js'
import { parseCookies, safeEqual } from '../../../api/_lib/auth.js'
import { UserError } from './errors.js'

export const OAUTH_STATE_TTL_MS = 10 * 60_000
const cookieName = purpose => `ts_oauth_${purpose}`
const configKey = (purpose, userId) => `oauth_state:${purpose}:${userId}`

function secureFor(req) {
  const proto = req.headers?.['x-forwarded-proto'] || ''
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host || ''
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1')
  return !isLocal && proto !== 'http'
}

function cookie(req, purpose, value, maxAgeSeconds) {
  const parts = [`${cookieName(purpose)}=${value}`, 'Path=/api', `Max-Age=${maxAgeSeconds}`, 'HttpOnly', 'SameSite=Lax']
  if (secureFor(req)) parts.push('Secure')
  return parts.join('; ')
}

/** Add a Set-Cookie without dropping one already on the response. */
function appendCookie(res, value) {
  const prev = res.getHeader?.('Set-Cookie')
  const list = prev ? (Array.isArray(prev) ? prev : [String(prev)]) : []
  res.setHeader('Set-Cookie', [...list, value])
}

/**
 * Make a state for this person and purpose ('sales_gmail', 'support_gmail',
 * 'support_instagram'), set its cookie on the response, and return it for
 * the consent URL. A new connect replaces any earlier unfinished one.
 */
export async function issueOAuthState(req, res, { purpose, userId }) {
  if (!userId) throw new UserError('Connecting needs a signed-in person')
  const state = crypto.randomBytes(32).toString('hex')
  const value = JSON.stringify({ state, exp: Date.now() + OAUTH_STATE_TTL_MS })
  const key = configKey(purpose, userId)
  await prisma.systemConfig.upsert({ where: { key }, update: { value }, create: { key, value } })
  appendCookie(res, cookie(req, purpose, state, Math.floor(OAUTH_STATE_TTL_MS / 1000)))
  return state
}

/**
 * Whether the state on the callback is the one this person's browser was
 * given. Always clears the cookie and the stored value, so a state cannot be
 * used twice, pass or fail.
 */
export async function checkOAuthState(req, res, { purpose, userId, state }) {
  const key = configKey(purpose, userId)
  const fromCookie = parseCookies(req)[cookieName(purpose)] || ''
  appendCookie(res, cookie(req, purpose, '', 0))
  if (!userId) return false
  const row = await prisma.systemConfig.findUnique({ where: { key } })
  await prisma.systemConfig.deleteMany({ where: { key } }).catch(() => {})
  const given = String(state || '')
  if (!row || !given || !fromCookie) return false
  let saved = null
  try { saved = JSON.parse(row.value) } catch { return false }
  if (!saved?.state || !(Number(saved.exp) > Date.now())) return false
  return safeEqual(given, saved.state) && safeEqual(given, fromCookie)
}
