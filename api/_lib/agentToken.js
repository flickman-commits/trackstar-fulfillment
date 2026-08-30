/**
 * The nightly agent's credential.
 *
 * The agent runs in Anthropic's cloud with a fresh checkout and none of our
 * environment, so it has to carry a secret in its routine prompt. That rules
 * out ADMIN_SECRET: a key to every admin endpoint sitting in a scheduler
 * config is exactly the blast radius this design has been avoiding, and it
 * would let a leaked prompt clear research, merge races or reprice the store.
 *
 * So the agent gets its own token, allowed to do only the things the nightly
 * playbook actually calls for:
 *
 *   - run the sweep and file its report
 *   - probe scrapers, capture fixtures, discover event ids, save an override
 *
 * Everything else - orders, proofs, users, Shopify writes, the audit log,
 * anything destructive - refuses it. A leaked agent token costs scraper
 * upkeep, not the business.
 *
 * Deliberately a fixed allowlist rather than a role or a scope string. There
 * are five endpoints; a permission system for five endpoints is more places
 * for a mistake to hide than the endpoints themselves.
 */
import crypto from 'crypto'

/** Paths the agent may reach, matched against the pathname only. */
const AGENT_ALLOWED_PATHS = new Set([
  '/api/admin/nightly-sweep',
  '/api/admin/lookup-health',
])

/**
 * POST bodies the agent may send to lookup-health. The sweep endpoint needs no
 * list: it has no destructive mode.
 *
 * Note what is missing. `sync-catalog` is here because it is idempotent, but
 * there is no path to clearing research, merging races or touching an order.
 */
const AGENT_ALLOWED_ACTIONS = new Set([
  'capture-fixture',
  'discover-ids',
  'save-override',
  'repair-plan',
  'sync-catalog',
])

function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a))
  const bBuf = Buffer.from(String(b))
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

/**
 * Is this request the nightly agent, and is it asking for something it may have?
 *
 * Returns an actor on success so the caller can attribute the work, or null to
 * fall through to the normal admin check. Never sends a response itself - a
 * request that is not the agent is not necessarily unauthorized, it just is
 * not this.
 */
export function agentActor(req) {
  const token = process.env.AGENT_TOKEN
  const presented = req.headers['x-agent-token']
  if (!token || !presented || !safeEqual(presented, token)) return null

  const path = String(req.url || '').split('?')[0]
  if (!AGENT_ALLOWED_PATHS.has(path)) {
    console.warn(`[agentToken] refused: ${path} is not on the agent's allowlist`)
    return null
  }

  // The probe (no action) is allowed; a named action must be on the list.
  const action = req.body?.action ?? req.query?.action ?? null
  if (action && !AGENT_ALLOWED_ACTIONS.has(action)) {
    console.warn(`[agentToken] refused action "${action}" on ${path}`)
    return null
  }

  return {
    id: null,
    email: 'nightly-agent',
    name: 'Nightly agent',
    role: 'agent',
    isAgent: true,
  }
}
