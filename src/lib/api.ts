/**
 * Shared API fetch wrapper that injects the admin secret header.
 * Use this for ALL merchant API calls (not customer-facing approval portal).
 */

const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET || ''

/**
 * Wrapper around fetch that adds the x-admin-secret header.
 * Same signature as native fetch.
 */
export function apiFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  if (ADMIN_SECRET) {
    headers.set('x-admin-secret', ADMIN_SECRET)
  }
  return fetch(url, { ...init, headers })
}
