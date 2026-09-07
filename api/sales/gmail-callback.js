/**
 * GET /api/sales/gmail-callback
 *
 * Where Google returns the browser after the consent screen. Its own path and
 * its own file, because Google rejects a registered redirect URI that carries
 * a query string, so this could not live at /api/sales/gmail?action=callback.
 *
 * The request arrives as a top-level navigation, so the session cookie
 * (SameSite=Lax) comes with it and requireAdmin works normally. On both
 * success and failure the browser ends up back on /sales with a flag the page
 * turns into a toast.
 */
import { setCors, requireAdmin } from '../_lib/auth.js'
import { completeConnection, redirectUriFor, originFor } from '../../server/domain/sales/gmail.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, OPTIONS' })) return
  if (!requireAdmin(req, res)) return

  const base = originFor(req)
  const back = (query) => {
    res.setHeader('Location', `${base}/sales?${query}`)
    return res.status(302).end()
  }

  // Google reports a refusal with ?error=access_denied rather than a code.
  if (req.query?.error) return back('gmail=denied')
  const code = String(req.query?.code || '')
  if (!code) return back('gmail=denied')

  try {
    const { email } = await completeConnection(code, redirectUriFor(req))
    return back(`gmail=connected&account=${encodeURIComponent(email)}`)
  } catch (err) {
    console.error('[API /sales/gmail-callback] failed', err)
    return back(`gmail=error&reason=${encodeURIComponent(err.message.slice(0, 120))}`)
  }
}
