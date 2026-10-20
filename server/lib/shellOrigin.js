/**
 * Where the preview handlers fetch the built index.html from.
 *
 * Never from request headers alone: the fetched shell is cached for the
 * life of the instance, so a request that named another host would have every
 * later visitor served that host's page. Vercel overwrites X-Forwarded-Host,
 * which made this safe there, but nothing does behind server/dev.js.
 *
 *   Vercel production  VERCEL_PROJECT_PRODUCTION_URL
 *   Vercel preview     the deployment's own host (VERCEL_URL)
 *   anywhere else      APP_BASE_URL, or the request's host only when it is localhost
 */
export function shellUrl(req) {
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/index.html`
  }
  if (process.env.VERCEL && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/index.html`
  }
  if (process.env.APP_BASE_URL) return `${process.env.APP_BASE_URL.replace(/\/$/, '')}/index.html`
  const host = String(req.headers.host || '')
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return `http://${host}/index.html`
  return null
}
