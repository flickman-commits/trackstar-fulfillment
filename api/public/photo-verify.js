/**
 * Public, unauthenticated: verify a just-uploaded photo's actual bytes.
 *
 *   POST /api/public/photo-verify
 *   body: { path, contentType }
 *   -> { ok: true, width, height, type }  |  4xx with a shopper-safe message
 *
 * WHY THIS IS A SEPARATE STEP
 *   Uploads go straight from the browser to Supabase (signed URL) so we can
 *   clear Vercel's ~4.5MB body cap. That means no server ever sees the bytes at
 *   write time, and the only thing the bucket can check is the DECLARED
 *   content type — which the client chooses. So we verify immediately after the
 *   upload, reading just the header bytes, and DELETE anything that fails.
 *
 *   A path is only allowed into the cart after passing through here. Anything
 *   that fails is removed rather than left sitting in the bucket.
 *
 * Defends against type spoofing and decompression bombs; see
 * server/lib/imageValidation.js for the specifics.
 */
import { createClient } from '@supabase/supabase-js'
import { setCors } from '../_lib/auth.js'
import { checkRateLimitDurable } from '../../server/lib/publicRateLimit.js'
import { validateImageBytes } from '../../server/lib/imageValidation.js'

const BUCKET = 'personalization-photos'

/** Enough for a PNG/WEBP header and virtually every JPEG's SOF marker. */
const HEADER_BYTES = 64 * 1024

/** Server-side shape check — never trust a client-supplied storage path. */
const PATH_RE = /^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|heic|heif)$/i

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'POST, OPTIONS', allowPublic: true })) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (process.env.PHOTO_UPLOAD_ENABLED !== 'true') {
    return res.status(503).json({ error: 'unavailable' })
  }

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return res.status(500).json({ error: 'server_misconfigured' })

  const limit = await checkRateLimitDurable(clientIp(req), { bucket: 'photo_verify', max: 40 })
  if (!limit.allowed) {
    res.setHeader('Retry-After', Math.ceil(limit.retryAfterMs / 1000))
    return res.status(429).json({ error: 'rate_limited' })
  }

  const { path, contentType } = req.body || {}
  if (!PATH_RE.test(String(path || ''))) {
    return res.status(400).json({ error: 'bad_path' })
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  /** Remove a file that failed verification so bad bytes never linger. */
  async function purge(reason) {
    try {
      await supabase.storage.from(BUCKET).remove([path])
      console.warn(`[PHOTO_VERIFY] purged path="${path}" reason=${reason}`)
    } catch (err) {
      console.error(`[PHOTO_VERIFY] purge FAILED path="${path}":`, err.message)
    }
  }

  try {
    // Range-read just the header. Downloading up to 25MB into a Lambda to look
    // at the first few bytes would be wasteful and memory-hostile.
    const { data: signed, error: signErr } = await supabase
      .storage.from(BUCKET).createSignedUrl(path, 60)
    if (signErr || !signed?.signedUrl) {
      return res.status(404).json({ error: 'not_found' })
    }

    const resp = await fetch(signed.signedUrl, { headers: { Range: `bytes=0-${HEADER_BYTES - 1}` } })
    if (!resp.ok && resp.status !== 206) {
      return res.status(404).json({ error: 'not_found' })
    }

    const buf = Buffer.from(await resp.arrayBuffer())
    const verdict = validateImageBytes(buf, contentType)

    if (!verdict.ok) {
      await purge(verdict.reason)
      return res.status(400).json({
        error: verdict.reason,
        message: verdict.message,
      })
    }

    console.log(
      `[PHOTO_VERIFY] ok path="${path}" type=${verdict.type} ` +
      `dims=${verdict.width || '?'}x${verdict.height || '?'}`
    )

    return res.status(200).json({
      ok: true,
      type: verdict.type,
      width: verdict.width || null,
      height: verdict.height || null,
    })
  } catch (err) {
    console.error('[photo-verify] failed:', err.message)
    // Unverified bytes must not survive, even when the checker itself broke.
    await purge('verifier_error')
    return res.status(500).json({ error: 'verify_failed' })
  }
}
