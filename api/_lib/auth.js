/**
 * Shared auth + CORS helpers for API endpoints.
 *
 * Admin secret: All merchant endpoints require x-admin-secret header.
 * CORS: Locked to known origins (Vercel + localhost for dev).
 */

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret')
  res.setHeader('Access-Control-Allow-Credentials', 'true')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return true
  }

  return false
}

/**
 * Verify admin secret header. Returns true if authorized, sends 401 and returns false otherwise.
 */
export function requireAdmin(req, res) {
  const secret = process.env.ADMIN_SECRET
  if (!secret) {
    console.error('[auth] ADMIN_SECRET not configured — blocking request')
    res.status(500).json({ error: 'Server misconfigured' })
    return false
  }

  const provided = req.headers['x-admin-secret']
  if (provided !== secret) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }

  return true
}
