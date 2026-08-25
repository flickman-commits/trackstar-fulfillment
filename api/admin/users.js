/**
 * /api/admin/users - manage who can sign in.
 *
 *   GET                                   list everyone (any signed-in user)
 *   POST   { action:'invite', email, name, role }   create an account + invite link
 *   POST   { action:'role', id, role }              promote / demote
 *   POST   { action:'active', id, isActive }        deactivate / reactivate
 *   POST   { action:'reset', id }                   issue a fresh invite link
 *   POST   { action:'set-password', password }      change YOUR OWN password
 *   DELETE { id }                                   remove an account
 *
 * Every write except set-password is admin-only.
 *
 * Accounts are created without a password and with a single-use invite token.
 * Nobody types a colleague's password for them, and no password travels over
 * Slack: the admin sends a link, the person chooses their own.
 *
 * Listing is open to any signed-in user on purpose. Knowing who else has
 * access is not a secret from the people who already have it, and it is how a
 * staff member works out who to ask to run an admin action.
 */
import crypto from 'crypto'
import prisma from '../_lib/prisma.js'
import { setCors, requireAdmin } from '../_lib/auth.js'
import {
  ROLES, hashPassword, normalizeEmail, isValidEmail,
  loadActiveUser, requireAdminRole, recordAudit,
} from '../_lib/users.js'

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const MIN_PASSWORD = 10

const PUBLIC_FIELDS = {
  id: true, email: true, name: true, role: true, isActive: true,
  lastLoginAt: true, createdAt: true, inviteExpiresAt: true, passwordHash: true,
}

/** Never let a password hash out of the API, even to an admin. */
function shape(u) {
  const { passwordHash, ...rest } = u
  return { ...rest, hasPassword: Boolean(passwordHash) }
}

function newInvite() {
  return {
    inviteToken: crypto.randomBytes(24).toString('hex'),
    inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
  }
}

function inviteUrl(req, token) {
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host || ''
  const base = process.env.APP_URL || `${proto}://${host}`
  return `${base.replace(/\/$/, '')}/?invite=${token}`
}

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, DELETE, OPTIONS' })) return
  const actor = requireAdmin(req, res)
  if (!actor) return

  try {
    if (req.method === 'GET') {
      const users = await prisma.user.findMany({
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        select: PUBLIC_FIELDS,
      })
      return res.status(200).json({ users: users.map(shape) })
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
      const { action } = body

      // Changing your own password needs no role, only a live account.
      if (action === 'set-password') {
        const me = await loadActiveUser(actor)
        if (!me || me.isSystem) return res.status(401).json({ error: 'Sign in again.' })
        const password = String(body.password || '')
        if (password.length < MIN_PASSWORD) {
          return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` })
        }
        await prisma.user.update({
          where: { id: me.id },
          data: { passwordHash: hashPassword(password), inviteToken: null, inviteExpiresAt: null },
        })
        await recordAudit({ action: 'user.password', summary: 'Changed their own password', actor: me })
        return res.status(200).json({ ok: true })
      }

      const admin = await requireAdminRole(req, res, actor)
      if (!admin) return

      if (action === 'invite') {
        const email = normalizeEmail(body.email)
        const name = String(body.name || '').trim() || email.split('@')[0]
        const role = ROLES.includes(body.role) ? body.role : 'staff'
        if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address' })

        const existing = await prisma.user.findUnique({ where: { email } })
        if (existing) return res.status(409).json({ error: 'Someone already has that email' })

        const invite = newInvite()
        const user = await prisma.user.create({
          data: { email, name, role, ...invite },
          select: PUBLIC_FIELDS,
        })
        await recordAudit({
          action: 'user.invite',
          summary: `Invited ${email} as ${role}`,
          detail: { email, role },
          actor: admin,
        })
        return res.status(201).json({ user: shape(user), inviteUrl: inviteUrl(req, invite.inviteToken) })
      }

      const target = body.id
        ? await prisma.user.findUnique({ where: { id: body.id }, select: PUBLIC_FIELDS })
        : null
      if (!target) return res.status(404).json({ error: 'No such user' })

      if (action === 'role') {
        const role = body.role
        if (!ROLES.includes(role)) return res.status(400).json({ error: 'Role must be admin or staff' })
        // Demoting the last admin locks everyone out of user management, and
        // the only way back is database access. Refuse rather than explain.
        if (target.role === 'admin' && role !== 'admin' && await lastAdmin(target.id)) {
          return res.status(400).json({ error: 'This is the only admin. Promote someone else first.' })
        }
        const user = await prisma.user.update({ where: { id: target.id }, data: { role }, select: PUBLIC_FIELDS })
        await recordAudit({
          action: 'user.role',
          summary: `Changed ${target.email} from ${target.role} to ${role}`,
          detail: { userId: target.id, from: target.role, to: role },
          actor: admin,
        })
        return res.status(200).json({ user: shape(user) })
      }

      if (action === 'active') {
        const isActive = body.isActive !== false
        if (!isActive && target.role === 'admin' && await lastAdmin(target.id)) {
          return res.status(400).json({ error: 'This is the only admin. Promote someone else first.' })
        }
        const user = await prisma.user.update({ where: { id: target.id }, data: { isActive }, select: PUBLIC_FIELDS })
        await recordAudit({
          action: isActive ? 'user.reactivate' : 'user.deactivate',
          summary: `${isActive ? 'Reactivated' : 'Deactivated'} ${target.email}`,
          detail: { userId: target.id },
          actor: admin,
        })
        return res.status(200).json({ user: shape(user) })
      }

      if (action === 'reset') {
        const invite = newInvite()
        await prisma.user.update({
          where: { id: target.id },
          data: { ...invite, passwordHash: null },
        })
        await recordAudit({
          action: 'user.reset',
          summary: `Reset the password for ${target.email}`,
          detail: { userId: target.id },
          actor: admin,
        })
        return res.status(200).json({ inviteUrl: inviteUrl(req, invite.inviteToken) })
      }

      return res.status(400).json({ error: `Unknown action: ${action}` })
    }

    if (req.method === 'DELETE') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
      const admin = await requireAdminRole(req, res, actor)
      if (!admin) return

      const target = await prisma.user.findUnique({ where: { id: body.id || '' } })
      if (!target) return res.status(404).json({ error: 'No such user' })
      if (target.id === admin.id) {
        return res.status(400).json({ error: 'You cannot delete your own account. Ask another admin.' })
      }
      if (target.role === 'admin' && await lastAdmin(target.id)) {
        return res.status(400).json({ error: 'This is the only admin. Promote someone else first.' })
      }

      // Comments and edit batches keep their denormalised name and email, so
      // the history still reads correctly after the account is gone.
      await prisma.user.delete({ where: { id: target.id } })
      await recordAudit({
        action: 'user.delete',
        summary: `Deleted the account for ${target.email}`,
        detail: { email: target.email, role: target.role },
        actor: admin,
      })
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('[admin/users] Error:', error)
    return res.status(500).json({ error: error.message })
  }
}

/** True when `id` is the only active admin left. */
async function lastAdmin(id) {
  const others = await prisma.user.count({
    where: { role: 'admin', isActive: true, id: { not: id } },
  })
  return others === 0
}
