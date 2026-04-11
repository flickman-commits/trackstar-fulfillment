/**
 * Shared Prisma singleton for serverless functions.
 * Prevents connection exhaustion under load — one client per cold start.
 */
import { PrismaClient } from '@prisma/client'

let prisma

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient()
} else {
  // In dev, reuse across hot-reloads
  if (!globalThis.__prisma) {
    globalThis.__prisma = new PrismaClient()
  }
  prisma = globalThis.__prisma
}

export default prisma
