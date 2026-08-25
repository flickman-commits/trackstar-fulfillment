/**
 * Shared auth + CORS helpers for API endpoints.
 *
 * Auth: Merchant endpoints require either a valid `ts_session` cookie (set by
 *   the browser login flow in api/auth/login.js) or the `x-admin-secret` header
 *   (server-to-server callers: Vercel crons, internal tooling). The session
 *   token is a stateless HMAC-signed value — no DB lookup, no client-readable
 *   secret in the bundle.
 * CORS: Locked to known origins (Vercel + localhost for dev).
 */

import crypto from 'crypto'

export const SESSION_COOKIE = 'ts_session'
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/** Signing key for session tokens — dedicated secret, falls back to ADMIN_SECRET. */
function sessionSecret() {
  return process.env.SESSION_SECRET || process.env.ADMIN_SECRET || ''
}

function sign(payload) {
  return crypto.createHmac('sha256', sessionSecret()).update(payload).digest('hex')
}

/** Constant-time string compare that won't throw on length mismatch. */
function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a))
  const bBuf = Buffer.from(String(b))
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

/**
 * Create a signed session token identifying WHO is signed in:
 *   "<userId>|<email>|<role>|<expiryEpochMs>.<hmac>"
 *
 * Identity rides inside the signed payload so an ordinary request still needs
 * no database lookup. The cost is that the token is briefly stale if someone
 * is demoted or deactivated mid-session; destructive endpoints therefore
 * re-check against the database via requireAdminRole rather than trusting it.
 *
 * Tokens issued by the old shared-password scheme carried only an expiry and
 * no longer verify. That is deliberate: everyone re-authenticates once as
 * their own account instead of inheriting an anonymous session.
 */
export function createSessionToken(user) {
  const expiry = Date.now() + SESSION_MAX_AGE_MS
  const payload = [user.id, user.email, user.role, String(expiry)].join('|')
  return `${payload}.${sign(payload)}`
}

/**
 * Verify a session token and return the actor it names, or null.
 * Signature must be valid, the token unexpired, and the payload well formed.
 */
export function readSessionToken(token) {
  if (!token || typeof token !== 'string') return null
  if (!sessionSecret()) return null
  const dot = token.lastIndexOf('.')
  if (dot < 1) return null
  const payload = token.slice(0, dot)
  const mac = token.slice(dot + 1)
  if (!safeEqual(mac, sign(payload))) return null

  const parts = payload.split('|')
  // Anything shorter is a pre-identity token; treat it as invalid.
  if (parts.length !== 4) return null
  const [id, email, role, expiryRaw] = parts
  const expiry = Number(expiryRaw)
  if (!Number.isFinite(expiry) || Date.now() >= expiry) return null
  if (!id || !email) return null
  return { id, email, role: role || 'staff' }
}

/** Back-compat boolean form, for callers that only need yes/no. */
export function verifySessionToken(token) {
  return readSessionToken(token) !== null
}

/** Parse a request's Cookie header into a plain object. */
export function parseCookies(req) {
  const header = req.headers?.cookie
  if (!header) return {}
  return header.split(';').reduce((acc, pair) => {
    const idx = pair.indexOf('=')
    if (idx < 0) return acc
    const key = pair.slice(0, idx).trim()
    const val = pair.slice(idx + 1).trim()
    if (key) acc[key] = decodeURIComponent(val)
    return acc
  }, {})
}

/**
 * Build a Set-Cookie string for the session. `clear` issues an expired cookie
 * (logout). `Secure` is omitted on plain-http localhost so local dev works.
 */
export function buildSessionCookie(req, { clear = false, token = '' } = {}) {
  const proto = req.headers['x-forwarded-proto'] || ''
  const host = req.headers['x-forwarded-host'] || req.headers.host || ''
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1')
  const secure = !isLocal && proto !== 'http'

  const value = clear ? '' : token
  const maxAge = clear ? 0 : Math.floor(SESSION_MAX_AGE_MS / 1000)
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

const ALLOWED_ORIGINS = [
  'https://fast.trackstar.art',
  'https://trackstar-fulfillment.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
]

/**
 * Set CORS headers. Returns true if this was a preflight OPTIONS request (caller should return).
 */
export function setCors(req, res, { methods = 'GET, POST, OPTIONS', allowPublic = false } = {}) {
  const origin = req.headers.origin || ''

  // For public endpoints (customer approval portal), allow any origin
  if (allowPublic) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*')
  } else {
    // Match against allowed origins (also allow Vercel preview URLs)
    const isAllowed = ALLOWED_ORIGINS.includes(origin)
      || origin.endsWith('.vercel.app')
    res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : ALLOWED_ORIGINS[0])
  }

  res.setHeader('Access-Control-Allow-Methods', methods)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret, Cookie')
  res.setHeader('Access-Control-Allow-Credentials', 'true')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return true
  }

  return false
}

/**
 * Authorize a request. Returns true if authorized, sends 401/500 and returns
 * false otherwise. Accepts either:
 *   1. a valid `ts_session` cookie (browser users), or
 *   2. the `x-admin-secret` header matching ADMIN_SECRET (server-to-server).
 */
/**
 * Require an authenticated caller and return WHO they are.
 *
 * Returns a truthy actor on success and false on failure, so the existing
 * `if (!requireAdmin(req, res)) return` call sites keep working unchanged
 * while newer code can use the return value for attribution:
 *
 *   const actor = requireAdmin(req, res)
 *   if (!actor) return
 *
 * The name is now a misnomer - it means "authenticated", not "admin". Role is
 * enforced separately by requireAdminRole in _lib/users.js, because a role
 * check worth having must re-read the database and this must stay synchronous
 * for the twenty-odd endpoints that only need to know someone is signed in.
 */
export function requireAdmin(req, res) {
  const secret = process.env.ADMIN_SECRET
  if (!secret) {
    console.error('[auth] ADMIN_SECRET not configured - blocking request')
    res.status(500).json({ error: 'Server misconfigured' })
    return false
  }

  // Browser path: signed session cookie naming a user.
  const cookies = parseCookies(req)
  const actor = readSessionToken(cookies[SESSION_COOKIE])
  if (actor) return actor

  // Server-to-server path: shared admin secret header (constant-time compare).
  // Crons and internal tooling have no user row; they act as "system".
  const provided = req.headers['x-admin-secret']
  if (provided && safeEqual(provided, secret)) {
    return { id: null, email: 'system', name: 'System', role: 'admin', isSystem: true }
  }

  res.status(401).json({ error: 'Unauthorized' })
  return false
}
