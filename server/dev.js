/**
 * Local development API server
 *
 * Runs your Vercel serverless functions as a regular Express server.
 * Vite proxies /api/* requests here during local development.
 */
import express from 'express'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
// Skip JSON parsing for multipart requests (proof uploads use formidable)
app.use((req, res, next) => {
  const ct = req.headers['content-type'] || ''
  if (ct.includes('multipart/form-data')) return next()
  express.json({ limit: '10mb' })(req, res, next)
})

// Map each API route to its Vercel handler
const routes = [
  { method: 'get',  path: '/api/orders',                    handler: '../api/orders/index.js' },
  { method: 'post', path: '/api/orders/import',              handler: '../api/orders/import.js' },
  { method: 'post', path: '/api/orders/research-runner',     handler: '../api/orders/research-runner.js' },
  { method: 'get',  path: '/api/orders/actions',              handler: '../api/orders/actions.js' },
  { method: 'post', path: '/api/orders/actions',              handler: '../api/orders/actions.js' },
  { method: 'post', path: '/api/orders/update',              handler: '../api/orders/update.js' },
  { method: 'post', path: '/api/orders/refresh-weather',     handler: '../api/orders/refresh-weather.js' },
  { method: 'post', path: '/api/orders/refresh-shopify-data', handler: '../api/orders/refresh-shopify-data.js' },
  { method: 'post', path: '/api/orders/refresh-etsy-data',  handler: '../api/orders/refresh-etsy-data.js' },
  { method: 'get',  path: '/api/orders/gift-stats',          handler: '../api/orders/gift-stats.js' },
  { method: 'get',  path: '/api/orders/comments',            handler: '../api/orders/comments.js' },
  { method: 'post', path: '/api/orders/comments',            handler: '../api/orders/comments.js' },
  { method: 'delete', path: '/api/orders/comments',          handler: '../api/orders/comments.js' },
  { method: 'get',  path: '/api/products/artelo-costs',    handler: '../api/products/artelo-costs.js' },
  { method: 'get',  path: '/api/products/pricing',          handler: '../api/products/pricing.js' },
  { method: 'get',  path: '/api/products/bulk-edit',       handler: '../api/products/bulk-edit.js' },
  { method: 'post', path: '/api/products/bulk-edit',       handler: '../api/products/bulk-edit.js' },
  { method: 'get',  path: '/api/etsy/auth',                 handler: '../api/etsy/auth.js' },
  { method: 'get',  path: '/api/admin/lookups-recent',     handler: '../api/admin/lookups-recent.js' },
  // Consolidated Instant Lookup + scraper health (replaces the two panels).
  { method: 'get',  path: '/api/admin/lookup-health',      handler: '../api/admin/lookup-health.js' },
  { method: 'post', path: '/api/admin/lookup-health',      handler: '../api/admin/lookup-health.js' },
  { method: 'get',  path: '/api/admin/photo-signed-url',   handler: '../api/admin/photo-signed-url.js' },
  // Browser auth: login / session-check / logout
  { method: 'get',    path: '/api/auth/login',             handler: '../api/auth/login.js' },
  { method: 'post',   path: '/api/auth/login',             handler: '../api/auth/login.js' },
  { method: 'delete', path: '/api/auth/login',             handler: '../api/auth/login.js' },
  { method: 'get',    path: '/api/auth/accept-invite',     handler: '../api/auth/accept-invite.js' },
  { method: 'post',   path: '/api/auth/accept-invite',     handler: '../api/auth/accept-invite.js' },
  // People + the who-did-what log
  { method: 'get',    path: '/api/admin/users',            handler: '../api/admin/users.js' },
  { method: 'post',   path: '/api/admin/users',            handler: '../api/admin/users.js' },
  { method: 'delete', path: '/api/admin/users',            handler: '../api/admin/users.js' },
  { method: 'get',    path: '/api/admin/audit',            handler: '../api/admin/audit.js' },
  // Storefront stats panel (Shopify-derived)
  { method: 'get',    path: '/api/admin/stats',            handler: '../api/admin/stats.js' },
  // Nightly health sweep (cron runs it; admins can pull the JSON any time)
  { method: 'get',    path: '/api/admin/nightly-sweep',    handler: '../api/admin/nightly-sweep.js' },
  // Trackstar MCP. paramAdapter copies :token into req.query, matching how
  // Vercel resolves the [token] dynamic segment.
  { method: 'get',    path: '/api/mcp',                    handler: '../api/mcp/index.js' },
  { method: 'post',   path: '/api/mcp',                    handler: '../api/mcp/index.js' },
  { method: 'get',    path: '/api/mcp/:token',             handler: '../api/mcp/[token].js', paramAdapter: true },
  { method: 'post',   path: '/api/mcp/:token',             handler: '../api/mcp/[token].js', paramAdapter: true },
  { method: 'post',   path: '/api/admin/nightly-sweep',    handler: '../api/admin/nightly-sweep.js' },
  // Proofs & Approval
  { method: 'get',    path: '/api/proofs',                 handler: '../api/proofs/index.js' },
  { method: 'post',   path: '/api/proofs',                 handler: '../api/proofs/index.js' },
  { method: 'delete', path: '/api/proofs',                 handler: '../api/proofs/index.js' },
  // Public storefront results lookup (gated behind PUBLIC_LOOKUP_ENABLED).
  { method: 'get',    path: '/api/public/results-lookup',  handler: '../api/public/results-lookup.js' },
  // Marathon Monopoly proposal page (gated behind MONOPOLY_PAGE_ENABLED).
  { method: 'get',    path: '/api/public/monopoly',        handler: '../api/public/monopoly.js' },
  { method: 'get',    path: '/api/admin/monopoly-model',   handler: '../api/admin/monopoly-model.js' },
]

// Load all handlers and register routes
for (const route of routes) {
  const mod = await import(route.handler)
  const handler = mod.default

  // Register for the specific method, plus OPTIONS for CORS preflight
  // For dynamic routes (e.g. /api/approve/:token), copy Express params to query
  // so the handler works identically in both Express and Vercel.
  // `route.query` injects static query params, mirroring vercel.json rewrites.
  const adapters = []
  if (route.paramAdapter) {
    adapters.push((req, res, next) => { Object.assign(req.query, req.params); next() })
  }
  if (route.query) {
    adapters.push((req, res, next) => { Object.assign(req.query, route.query); next() })
  }
  const middleware = [...adapters, handler]
  app[route.method](route.path, ...middleware)
  app.options(route.path, (req, res) => {
    // Echo origin (not '*') + allow credentials so cookie-bearing requests
    // pass preflight when a developer points VITE_API_URL at this server.
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret, Cookie')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.status(204).end()
  })
}

const PORT = process.env.API_PORT || 3001
app.listen(PORT, () => {
  console.log(`\n  ⚡ API server running at http://localhost:${PORT}\n`)
})
