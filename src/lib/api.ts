/**
 * Shared API fetch wrapper for merchant API calls (not the customer-facing
 * approval portal). Auth rides on an httpOnly session cookie set by the login
 * flow — `credentials: 'include'` sends it. No secret is held in the client.
 * On 401 we bounce back to the login gate.
 */

/**
 * Wrapper around fetch that includes the session cookie.
 * Same signature as native fetch.
 */
export async function apiFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, { ...init, credentials: 'include' })
  if (response.status === 401) {
    // Session expired or missing — reload so the gate re-checks and shows login.
    window.location.reload()
  }
  return response
}
