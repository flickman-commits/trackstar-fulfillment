/**
 * GET /api/support/gmail-callback
 *
 * Where Google returns the browser after the consent screen for the support
 * mailbox. Its own path because Google rejects a redirect URI that carries a
 * query string. The session cookie rides along on the top-level navigation,
 * so the admin check works as usual. Either way the browser ends up on
 * /support with a flag the page turns into a toast.
 */
import { setCors, requireAdmin } from '../_lib/auth.js'
import { requireAdminRole } from '../_lib/users.js'
import { originFor } from '../../server/domain/sales/gmail.js'
import { completeConnection, redirectUriFor } from '../../server/domain/support/mailbox.js'

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, OPTIONS' })) return
  const actor = requireAdmin(req, res)
  if (!actor) return
  if (!(await requireAdminRole(req, res, actor))) return

  const base = originFor(req)
  const back = (query) => {
    res.setHeader('Location', `${base}/support?${query}`)
    return res.status(302).end()
  }

  if (req.query?.error) return back('gmail=denied')
  const code = String(req.query?.code || '')
  if (!code) return back('gmail=denied')

  try {
    const { email } = await completeConnection(code, redirectUriFor(req))
    return back(`gmail=connected&account=${encodeURIComponent(email)}`)
  } catch (err) {
    console.error('[API /support/gmail-callback] failed', err)
    return back(`gmail=error&reason=${encodeURIComponent(err.message.slice(0, 160))}`)
  }
}
