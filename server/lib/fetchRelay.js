/**
 * Fetch a page through the render worker on Matt's Mac, for timing sites
 * whose Cloudflare rules refuse cloud addresses (TrueTime answers Vercel with
 * 403 and a home connection with 200). The request waits in FetchRelay; the
 * worker (worker/render-worker.mjs) claims it, fetches it, and posts the page
 * back. A lookup through the relay takes a few seconds longer, nothing more.
 *
 * When no worker has checked in lately, it fails at once with a reason a
 * person can act on (start the worker), instead of hanging an import.
 */
import prisma from '../db.js'
import { isConnectionOn } from './connections.js'

/** The only hosts the relay fetches. A worker refuses anything else too. */
export const RELAY_HOSTS = ['results.truetimeracing.com']
const ONLINE_MS = 90_000
const WAIT_MS = 45_000
const MAX_BODY = 3_000_000

export class RelayUnavailableError extends Error {}

export function relayAllowed(url) {
  try { return RELAY_HOSTS.includes(new URL(url).host) } catch { return false }
}

/** Is a render worker around to relay? */
export async function relayOnline() {
  const w = await prisma.renderWorker.findFirst({ where: { lastSeenAt: { gte: new Date(Date.now() - ONLINE_MS) } }, select: { id: true } })
  return Boolean(w)
}

/**
 * The page, as the worker saw it: { status, text, setCookies }.
 * Throws RelayUnavailableError when no worker is online or none answered in time.
 */
export async function relayFetch(url, init = {}, { waitMs = WAIT_MS } = {}) {
  if (!relayAllowed(url)) throw new Error(`${new URL(url).host} is not a relay host`)
  // Settings > Connections: switching the render worker off pauses its relaying as well as its rendering.
  if (!(await isConnectionOn('render_worker'))) throw new RelayUnavailableError('the render worker is switched off in Settings > Connections')
  if (!(await relayOnline())) throw new RelayUnavailableError('no render worker is online to relay the lookup')
  const row = await prisma.fetchRelay.create({
    data: { url, method: String(init.method || 'GET').toUpperCase(), headers: init.headers || {}, body: typeof init.body === 'string' ? init.body : null },
  })
  const until = Date.now() + waitMs
  while (Date.now() < until) {
    await new Promise(r => setTimeout(r, 1000))
    const r = await prisma.fetchRelay.findUnique({ where: { id: row.id } })
    if (r?.status === 'done') return { status: r.responseStatus, text: r.responseBody || '', setCookies: Array.isArray(r.setCookies) ? r.setCookies : [] }
    if (r?.status === 'failed') throw new Error(`relay fetch failed on the worker: ${r.error || 'unknown error'}`)
  }
  await prisma.fetchRelay.updateMany({ where: { id: row.id, status: { in: ['pending', 'claimed'] } }, data: { status: 'expired', doneAt: new Date() } })
  throw new RelayUnavailableError('the render worker did not answer in time')
}

/** The worker's side: up to `limit` waiting requests, each claimed by this worker alone. */
export async function claimRelays(workerId, limit = 4) {
  if (!(await isConnectionOn('render_worker'))) return []
  // Old rows go, whatever their state: nothing waits a day for a page.
  await prisma.fetchRelay.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86400000) } } }).catch(() => {})
  const waiting = await prisma.fetchRelay.findMany({ where: { status: 'pending', createdAt: { gte: new Date(Date.now() - WAIT_MS) } }, orderBy: { createdAt: 'asc' }, take: limit, select: { id: true } })
  const out = []
  for (const w of waiting) {
    const got = await prisma.fetchRelay.updateMany({ where: { id: w.id, status: 'pending' }, data: { status: 'claimed', workerId: String(workerId || ''), claimedAt: new Date() } })
    if (got.count) out.push(await prisma.fetchRelay.findUnique({ where: { id: w.id }, select: { id: true, url: true, method: true, headers: true, body: true } }))
  }
  return out.filter(r => r && relayAllowed(r.url))
}

/** The worker's answer for one request. */
export async function finishRelay({ id, workerId, status, body, setCookies, error }) {
  const ok = !error && Number.isInteger(Number(status))
  const got = await prisma.fetchRelay.updateMany({
    where: { id: String(id || ''), status: 'claimed', workerId: String(workerId || '') },
    data: ok
      ? { status: 'done', responseStatus: Number(status), responseBody: String(body || '').slice(0, MAX_BODY), setCookies: Array.isArray(setCookies) ? setCookies.slice(0, 20).map(String) : [], doneAt: new Date() }
      : { status: 'failed', error: String(error || 'no status').slice(0, 300), doneAt: new Date() },
  })
  return { updated: got.count }
}
