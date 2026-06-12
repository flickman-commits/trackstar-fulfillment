/**
 * fetch() with a hard timeout, for calls to external APIs and timing sites.
 *
 * On Vercel a hung upstream request blocks the whole serverless function
 * until the platform kills it (maxDuration 300s), so every outbound call
 * needs a bounded wait. Timeouts throw a TimeoutError with the URL in the
 * message; all other fetch errors pass through unchanged.
 *
 * AthlinksScraper keeps its own fetch wrapper because it layers a retry on
 * top of the timeout.
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000

export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: ctrl.signal })
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error(`Request timed out after ${timeoutMs}ms: ${url}`)
      timeoutErr.name = 'TimeoutError'
      throw timeoutErr
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
