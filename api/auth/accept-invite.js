/**
 * /api/auth/accept-invite - set a password from an invite link.
 *
 *   GET  ?token=...                 who the invite is for (to greet them)
 *   POST { token, password }        set the password and sign them in
 *
 * No auth: holding an unexpired, unused invite token IS the credential. The
 * token is single use - it is cleared the moment a password is set, so a link
 * forwarded or left in an inbox stops working once it has been used.
 */
import prisma from '../_lib/prisma.js'
import { setCors, buildSessionCookie, createSessionToken } from '../_lib/auth.js'
import { hashPassword } from '../_lib/users.js'

const MIN_PASSWORD = 10

async function findByToken(token) {
  if (!token || typeof token !== 'string') return null
  const user = await prisma.user.findUnique({ where: { inviteToken: token } })
  if (!user || !user.isActive) return null
  if (!user.inviteExpiresAt || user.inviteExpiresAt.getTime() < Date.now()) return null
  return user
}

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS', allowPublic: true })) return

  try {
    if (req.method === 'GET') {
      const user = await findByToken(req.query?.token)
      if (!user) return res.status(404).json({ error: 'That invite link is invalid or has expired.' })
      return res.status(200).json({ email: user.email, firstName: user.firstName, lastName: user.lastName })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const user = await findByToken(body.token)
    if (!user) return res.status(404).json({ error: 'That invite link is invalid or has expired.' })

    const password = String(body.password || '')
    if (password.length < MIN_PASSWORD) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(password),
        inviteToken: null,
        inviteExpiresAt: null,
        lastLoginAt: new Date(),
      },
    })

    const actor = {
      id: user.id, email: user.email, role: user.role,
      firstName: user.firstName, lastName: user.lastName,
    }
    res.setHeader('Set-Cookie', buildSessionCookie(req, { token: createSessionToken(actor) }))
    return res.status(200).json({ ok: true, user: actor })
  } catch (error) {
    console.error('[auth/accept-invite] Error:', error)
    return res.status(500).json({ error: error.message })
  }
}
