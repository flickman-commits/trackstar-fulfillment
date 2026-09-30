/**
 * When orders were last pulled from Artelo, and a simple lock so the cron and
 * a manual run never import at the same time. Both live in SystemConfig.
 */
import prisma from '../db.js'

const LAST_KEY = 'orders_last_import'
const LOCK_KEY = 'orders_import_lock'
const LOCK_MS = 10 * 60 * 1000

export async function getLastImport() {
  const row = await prisma.systemConfig.findUnique({ where: { key: LAST_KEY } })
  return row?.value || null
}

export async function runLockedImport(fn) {
  const lock = await prisma.systemConfig.findUnique({ where: { key: LOCK_KEY } })
  if (lock && Date.now() - new Date(lock.value).getTime() < LOCK_MS) return { skipped: 'already_running' }
  const now = new Date().toISOString()
  await prisma.systemConfig.upsert({ where: { key: LOCK_KEY }, update: { value: now }, create: { key: LOCK_KEY, value: now } })
  try {
    const out = await fn()
    const done = new Date().toISOString()
    await prisma.systemConfig.upsert({ where: { key: LAST_KEY }, update: { value: done }, create: { key: LAST_KEY, value: done } })
    return { ...out, lastImportedAt: done }
  } finally {
    await prisma.systemConfig.delete({ where: { key: LOCK_KEY } }).catch(() => {})
  }
}
