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
  { method: 'get',  path: '/api/orders/test-scrapers',      handler: '../api/orders/test-scrapers.js' },
  { method: 'post', path: '/api/orders/test-scrapers',      handler: '../api/orders/test-scrapers.js' },
  { method: 'post', path: '/api/orders/refresh-etsy-data',  handler: '../api/orders/refresh-etsy-data.js' },
  { method: 'get',  path: '/api/orders/comments',            handler: '../api/orders/comments.js' },
  { method: 'post', path: '/api/orders/comments',            handler: '../api/orders/comments.js' },
  { method: 'delete', path: '/api/orders/comments',          handler: '../api/orders/comments.js' },
  { method: 'get',  path: '/api/etsy/auth',                 handler: '../api/etsy/auth.js' },
  // Proofs & Approval
  { method: 'get',    path: '/api/proofs',                 handler: '../api/proofs/index.js' },
  { method: 'post',   path: '/api/proofs',                 handler: '../api/proofs/index.js' },
  { method: 'delete', path: '/api/proofs',                 handler: '../api/proofs/index.js' },
]

// Load all handlers and register routes
for (const route of routes) {
  const mod = await import(route.handler)
  const handler = mod.default

  // Register for the specific method, plus OPTIONS for CORS preflight
  // For dynamic routes (e.g. /api/approve/:token), copy Express params to query
  // so the handler works identically in both Express and Vercel
  const middleware = route.paramAdapter
    ? [(req, res, next) => { Object.assign(req.query, req.params); next() }, handler]
    : [handler]
  app[route.method](route.path, ...middleware)
  app.options(route.path, (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret')
    res.status(204).end()
  })
}

const PORT = process.env.API_PORT || 3001
app.listen(PORT, () => {
  console.log(`\n  ⚡ API server running at http://localhost:${PORT}\n`)
})
