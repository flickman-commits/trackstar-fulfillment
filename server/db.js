/**
 * The one Prisma client.
 *
 * Domain code under server/ used to import the client from api/_lib, which
 * made the business layer depend on the HTTP layer, and several services
 * constructed their own PrismaClient on top of that. Serverless connection
 * limits are small; one client per process is the whole point.
 *
 * api/_lib/prisma.js re-exports this so existing handlers keep working.
 */
import { PrismaClient } from '@prisma/client'

/**
 * On Vercel every function instance has its own pool, and Prisma's default
 * size (cpus x 2 + 1) times a handful of warm instances is enough to exhaust
 * the Supabase pooler, which then fails every function at once, sign-in
 * included. A small explicit cap per instance and a longer wait for a
 * connection keeps a burst (bulk research alongside page loads) from
 * turning into 500s. Respects a limit already present in the URL.
 */
function datasourceUrl() {
  const url = process.env.DATABASE_URL
  if (!url || process.env.NODE_ENV !== 'production') return undefined
  if (/connection_limit=/.test(url)) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}connection_limit=5&pool_timeout=30`
}

let prisma

if (process.env.NODE_ENV === 'production') {
  const url = datasourceUrl()
  prisma = new PrismaClient(url ? { datasources: { db: { url } } } : undefined)
} else {
  // Reuse across dev hot-reloads instead of leaking a client per reload.
  if (!globalThis.__prisma) {
    globalThis.__prisma = new PrismaClient()
  }
  prisma = globalThis.__prisma
}

export default prisma
