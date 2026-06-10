/**
 * Browser auth endpoint — establishes / checks / clears the admin session.
 *
 *   POST   /api/auth/login   { password }  → validate, set ts_session cookie
 *   GET    /api/auth/login                 → 200 if a valid session cookie, else 401
 *   DELETE /api/auth/login                 → clear the session cookie (logout)
 *
 * This endpoint is deliberately NOT behind requireAdmin — it is the thing that
 * establishes auth. The password lives only in the server env (ADMIN_PASSWORD);
 * it is never shipped to the client.
 */
import crypto from 'crypto'
import {
  setCors,
  buildSessionCookie,
  parseCookies,
  verifySessionToken,
  SESSION_COOKIE,
} from '../_lib/auth.js'

function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a))
  const bBuf = Buffer.from(String(b))
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, DELETE, OPTIONS' })) return

  // Session check — used by the gate on page load.
  if (req.method === 'GET') {
    const cookies = parseCookies(req)
    if (verifySessionToken(cookies[SESSION_COOKIE])) {
      return res.status(200).json({ authenticated: true })
    }
    return res.status(401).json({ authenticated: false })
  }

  // Logout — issue an expired cookie.
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', buildSessionCookie(req, { clear: true }))
    return res.status(200).json({ ok: true })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const expected = process.env.ADMIN_PASSWORD
  if (!expected) {
    console.error('[auth/login] ADMIN_PASSWORD not configured — blocking login')
    return res.status(500).json({ error: 'Server misconfigured' })
  }

  const { password } = req.body || {}
  if (!password || !safeEqual(password, expected)) {
    return res.status(401).json({ error: 'Incorrect password' })
  }

  res.setHeader('Set-Cookie', buildSessionCookie(req))
  return res.status(200).json({ ok: true })
}
