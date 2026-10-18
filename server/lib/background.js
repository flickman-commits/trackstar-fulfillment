/**
 * Keep a Vercel function alive until `promise` settles without making the
 * caller wait for it. Off Vercel (server/dev.js, a self-hosted server) the
 * process keeps running anyway, so the promise simply finishes on its own.
 */
import { waitUntil } from '@vercel/functions'

export function inBackground(promise) {
  try { waitUntil(promise) } catch { /* not on Vercel: the local server keeps running anyway */ }
}
