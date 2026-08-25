/**
 * Browser auth - establishes / checks / clears a per-person session.
 *
 *   POST   /api/auth/login   { email, password }  → set ts_session cookie
 *   GET    /api/auth/login                        → 200 + who you are, else 401
 *   DELETE /api/auth/login                        → log out
 *
 * Deliberately NOT behind requireAdmin: this is the thing that establishes auth.
 *
 * BOOTSTRAP. When no users exist yet, ADMIN_PASSWORD still works once and
 * creates the first admin from the email supplied. Without that the first
 * deploy has no way in short of database access. The moment one user exists,
 * the shared password stops being accepted - so the escape hatch closes behind
 * you rather than lingering as a second way in.
 */
import crypto from 'crypto'
import prisma from '../_lib/prisma.js'
import {
  setCors,
  buildSessionCookie,
  parseCookies,
  createSessionToken,
  readSessionToken,
  SESSION_COOKIE,
} from '../_lib/auth.js'
import { verifyPassword, hashPassword, normalizeEmail, isValidEmail } from '../_lib/users.js'

function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a))
  const bBuf = Buffer.from(String(b))
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, DELETE, OPTIONS' })) return

  if (req.method === 'GET') {
    const actor = readSessionToken(parseCookies(req)[SESSION_COOKIE])
    if (!actor) return res.status(401).json({ authenticated: false })
    // Re-read so a deactivated account cannot keep browsing on a live token.
    const user = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true },
    })
    if (!user || !user.isActive) {
      res.setHeader('Set-Cookie', buildSessionCookie(req, { clear: true }))
      return res.status(401).json({ authenticated: false })
    }
    return res.status(200).json({ authenticated: true, user })
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', buildSessionCookie(req, { clear: true }))
    return res.status(200).json({ ok: true })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const email = normalizeEmail(req.body?.email)
  const password = req.body?.password
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  const userCount = await prisma.user.count()

  // First run only: the shared password mints the first admin.
  if (userCount === 0) {
    const shared = process.env.ADMIN_PASSWORD
    if (!shared) {
      return res.status(500).json({ error: 'No users exist and ADMIN_PASSWORD is not set' })
    }
    if (!safeEqual(password, shared)) {
      return res.status(401).json({ error: 'Incorrect password' })
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Enter a valid email to create the first admin' })
    }
    const created = await prisma.user.create({
      data: {
        email,
        // No name to go on yet: the invite flow is where a real one gets set,
        // and My Account is where it gets corrected.
        firstName: email.split('@')[0],
        passwordHash: hashPassword(shared),
        role: 'admin',
        lastLoginAt: new Date(),
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    })
    console.log(`[auth/login] Bootstrapped first admin: ${created.email}`)
    res.setHeader('Set-Cookie', buildSessionCookie(req, { token: createSessionToken(created) }))
    return res.status(200).json({ ok: true, user: created, bootstrapped: true })
  }

  const user = await prisma.user.findUnique({ where: { email } })

  // One message for "no such user", "wrong password" and "no password set", so
  // the form cannot be used to discover which emails have accounts.
  const bad = () => res.status(401).json({ error: 'Incorrect email or password' })
  if (!user || !user.passwordHash) return bad()
  if (!verifyPassword(password, user.passwordHash)) return bad()

  // Deactivation is a separate, honest message: they had the right password.
  if (!user.isActive) {
    return res.status(403).json({ error: 'This account has been deactivated.' })
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

  const actor = {
    id: user.id, email: user.email, role: user.role,
    firstName: user.firstName, lastName: user.lastName,
  }
  res.setHeader('Set-Cookie', buildSessionCookie(req, { token: createSessionToken(actor) }))
  return res.status(200).json({ ok: true, user: actor })
}
