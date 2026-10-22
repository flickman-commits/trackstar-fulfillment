/**
 * Gelato: prints made and shipped near the recipient, for overseas samples
 * (Artelo handles the US). Every call checks in with Connections first.
 *
 * API facts: one key, sent as the X-API-KEY header, across separate hosts per
 * area: orders on order.gelatoapis.com (v4), products on product.gelatoapis.com
 * (v3), shipping on shipment.gelatoapis.com (v1).
 */
import { requireConnection } from '../lib/connections.js'
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js'

const HOST = {
  order: 'https://order.gelatoapis.com',
  product: 'https://product.gelatoapis.com',
  shipment: 'https://shipment.gelatoapis.com',
}

export class GelatoError extends Error {
  constructor(message, status) { super(message); this.status = status; this.expose = true }
}

export async function gelato(area, path, { method = 'GET', body } = {}) {
  await requireConnection('gelato')
  const key = String(process.env.GELATO_API_KEY || '').trim()
  if (!key) throw new GelatoError('GELATO_API_KEY is not set', 503)
  const res = await fetchWithTimeout(`${HOST[area]}${path}`, {
    method,
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }, 30_000)
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = { message: text.slice(0, 300) } }
  if (!res.ok) throw new GelatoError(`Gelato: ${data?.message || data?.error || res.status}`, res.status >= 500 ? 502 : 400)
  return data
}

/** The newest orders first. */
export async function gelatoOrders({ limit = 10 } = {}) {
  const d = await gelato('order', '/v4/orders:search', { method: 'POST', body: { limit, offset: 0 } })
  return d?.orders || []
}

export const gelatoOrder = id => gelato('order', `/v4/orders/${encodeURIComponent(id)}`)
