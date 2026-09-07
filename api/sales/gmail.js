/**
 * /api/sales/gmail - connect Matt's Gmail so the tool can write drafts into it.
 *
 *   GET  ?action=status     { configured, connected, email }
 *   GET  ?action=connect    redirects to Google's consent screen
 *   GET  ?action=callback   Google sends the browser back here; stores the token, returns to /sales
 *   POST { action:'disconnect' }
 *
 * The callback arrives as a top-level navigation, so the session cookie
 * (SameSite=Lax) comes with it and requireAdmin works as usual.
 */
import { setCors, requireAdmin } from '../_lib/auth.js'
import { getAuthUrl, completeConnection, disconnectGmail, gmailStatus, redirectUriFor, isGmailConfigured } from '../../server/domain/sales/gmail.js'

function appUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host || ''
  return (process.env.APP_URL || `${proto}://${host}`).replace(/\/$/, '')
}

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS' })) return
  if (!requireAdmin(req, res)) return

  try {
    const action = req.method === 'GET'
      ? String(req.query?.action || 'status')
      : String((typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}).action || '')

    if (action === 'status') return res.status(200).json(await gmailStatus())

    if (action === 'connect') {
      if (!isGmailConfigured()) return res.status(400).json({ error: 'Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET first' })
      res.setHeader('Location', getAuthUrl(redirectUriFor(req)))
      return res.status(302).end()
    }

    if (action === 'callback') {
      const code = String(req.query?.code || '')
      const base = appUrl(req)
      if (!code) { res.setHeader('Location', `${base}/sales?gmail=denied`); return res.status(302).end() }
      try {
        const { email } = await completeConnection(code, redirectUriFor(req))
        res.setHeader('Location', `${base}/sales?gmail=connected&account=${encodeURIComponent(email)}`)
      } catch (err) {
        console.error('[API /sales/gmail] callback failed', err)
        res.setHeader('Location', `${base}/sales?gmail=error&reason=${encodeURIComponent(err.message.slice(0, 120))}`)
      }
      return res.status(302).end()
    }

    if (action === 'disconnect' && req.method === 'POST') {
      await disconnectGmail()
      return res.status(200).json({ success: true })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (error) {
    console.error('[API /sales/gmail]', error)
    return res.status(500).json({ error: error.message })
  }
}
