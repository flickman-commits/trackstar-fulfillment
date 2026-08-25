/**
 * User accounts, password hashing and role checks.
 *
 * Passwords use scrypt from node's crypto - no new dependency, and it is a
 * memory-hard KDF rather than a bare hash, so a stolen database is not a
 * stolen password list.
 *
 * Roles are two: `admin` can do the irreversible things and manage people,
 * `staff` does the day to day work. Anything not explicitly marked destructive
 * is open to both, because inventing a permission matrix nobody has asked for
 * makes the tool harder to use without making it safer.
 */

import crypto from 'crypto'
import prisma from './prisma.js'

export const ROLES = ['admin', 'staff']
const SCRYPT_KEYLEN = 64

/** "scrypt:<saltHex>:<hashHex>" */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN)
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false
  const [scheme, saltHex, hashHex] = stored.split(':')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
  try {
    const expected = Buffer.from(hashHex, 'hex')
    const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length)
    return crypto.timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

/** Emails are identity, so they are compared lowercased and trimmed. */
export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))
}

/**
 * Re-read the user behind a request and confirm they may still act.
 *
 * The session token carries id, email and role so ordinary reads need no
 * database round trip. That makes the token briefly stale if someone is
 * demoted or deactivated, which is fine for reading a page and NOT fine for
 * deleting variants - so anything destructive calls this instead and pays for
 * a lookup.
 */
export async function loadActiveUser(actor) {
  if (!actor) return null
  // Cron and internal tooling authenticate with the shared secret and have no
  // user row. They are trusted at the admin level by definition.
  if (actor.isSystem) return actor
  if (!actor.id) return null
  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  })
  if (!user || !user.isActive) return null
  return user
}

/**
 * Gate for irreversible actions. Verifies against the database rather than
 * trusting the token, then checks the role. Responds and returns null on
 * failure so callers can `if (!user) return`.
 */
export async function requireAdminRole(req, res, actor) {
  const user = await loadActiveUser(actor)
  if (!user) {
    res.status(401).json({ error: 'Your account is no longer active. Sign in again.' })
    return null
  }
  if (user.role !== 'admin') {
    res.status(403).json({
      error: 'This action is limited to admins. Ask an admin to run it, or to change your role.',
    })
    return null
  }
  return user
}

/** Append-only record of who did something consequential. */
export async function recordAudit({ action, summary, detail = null, actor }) {
  try {
    await prisma.auditEvent.create({
      data: {
        action,
        summary,
        detail: detail ?? undefined,
        userId: actor?.isSystem ? null : actor?.id ?? null,
        actorEmail: actor?.email || 'unknown',
      },
    })
  } catch (error) {
    // An audit failure must not take down the action it describes, but it must
    // be loud - a silent gap in the log is worse than no log at all.
    console.error('[audit] FAILED to record', action, error.message)
  }
}
