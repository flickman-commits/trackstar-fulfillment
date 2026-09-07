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

let prisma

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient()
} else {
  // Reuse across dev hot-reloads instead of leaking a client per reload.
  if (!globalThis.__prisma) {
    globalThis.__prisma = new PrismaClient()
  }
  prisma = globalThis.__prisma
}

export default prisma
