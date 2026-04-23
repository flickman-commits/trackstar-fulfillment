/**
 * POST /api/orders/actions
 *
 * Consolidated endpoint for small order actions. Routes by `action` field in body.
 * Reduces serverless function count (Vercel Hobby plan limit: 12).
 *
 * POST Actions (body.action):
 *   - accept-match: Accept a suggested runner match
 *   - clear-race-cache: Clear race-level cached data
 *   - clear-research: Delete runner research records
 *   - complete: Mark an order as completed
 *   - design-status: Update design status of a custom order
 *   - customers-served-info: Get current customers served count
 *   - customers-served-sync: Force sync count to Shopify
 *   - customers-served-set: Manually set the count (for corrections)
 *   - feature-request: Send a bug report or feature request to Slack
 *   - create-race-partner: Create a new race_partner Order row (reuses proofs/approval)
 *
 * GET Actions (query.action):
 *   - monday-pipeline: Vercel cron — sends Monday morning Slack summary to Dan
 */

import crypto from 'crypto'
import prisma from '../_lib/prisma.js'
import { setCors, requireAdmin } from '../_lib/auth.js'
import { alertError } from '../_lib/alerts.js'
import { getCustomersServedInfo, syncCustomersServedToShopify, setCustomersServedCount } from '../../server/services/customersServed.js'
import { getRaceShorthands } from '../../server/scrapers/index.js'

export default async function handler(req, res) {
  // Ping is public (UptimeRobot), everything else uses standard CORS
  const isPing = req.query?.action === 'ping'
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS', allowPublic: isPing })) return

  // GET requests — used by Vercel cron (cron uses CRON_SECRET, not ADMIN_SECRET)
  if (req.method === 'GET') {
    const action = req.query?.action
    if (action === 'monday-pipeline') {
      const authHeader = req.headers['authorization']
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' })
      }
      return await handleMondayPipeline(res)
    }
    if (action === 'race-shorthands') {
      if (!requireAdmin(req, res)) return
      return res.status(200).json({ shorthands: getRaceShorthands() })
    }
    if (action === 'creator-home-metrics') {
      if (!requireAdmin(req, res)) return
      return await handleCreatorHomeMetrics(res)
    }
    if (action === 'list-creators') {
      if (!requireAdmin(req, res)) return
      return await handleListCreators(res)
    }
    if (action === 'list-briefs') {
      if (!requireAdmin(req, res)) return
      return await handleListBriefs(res)
    }
    if (action === 'creator-portal-data') {
      // Public — token-gated inside handler. Used by the creator's portal
      // page to hydrate their view.
      return await handleCreatorPortalData(req.query?.token, res)
    }
    if (action === 'health-check') {
      // Cron uses CRON_SECRET, manual uses ADMIN_SECRET
      const cronAuth = req.headers['authorization']
      const isCron = cronAuth === `Bearer ${process.env.CRON_SECRET}`
      if (!isCron && !requireAdmin(req, res)) return
      return await handleHealthCheck(res, { sendSlack: isCron })
    }
    if (action === 'ping') {
      // Public — no auth needed. Used by UptimeRobot to monitor uptime.
      // Only returns status, no sensitive data.
      try {
        const start = Date.now()
        await prisma.order.count()
        return res.status(200).json({ status: 'ok', latency: `${Date.now() - start}ms` })
      } catch {
        return res.status(503).json({ status: 'down' })
      }
    }
    return res.status(400).json({ error: 'Unknown GET action' })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const { action } = body

    if (!action) {
      return res.status(400).json({ error: 'action is required' })
    }

    // Public POST actions — auth'd by the caller's own token inside the
    // handler, not by the admin secret. Everything else requires admin.
    const PUBLIC_POST_ACTIONS = new Set(['creator-onboard'])
    if (!PUBLIC_POST_ACTIONS.has(action)) {
      if (!requireAdmin(req, res)) return
    }

    switch (action) {
      case 'accept-match':
        return await handleAcceptMatch(body, res)
      case 'clear-race-cache':
        return await handleClearRaceCache(res)
      case 'clear-research':
        return await handleClearResearch(body, res)
      case 'complete':
        return await handleComplete(body, res)
      case 'design-status':
        return await handleDesignStatus(body, res)
      case 'customers-served-info':
        return await handleCustomersServedInfo(res)
      case 'customers-served-sync':
        return await handleCustomersServedSync(res)
      case 'customers-served-set':
        return await handleCustomersServedSet(body, res)
      case 'feature-request':
        return await handleFeatureRequest(body, res)
      case 'create-race-partner':
        return await handleCreateRacePartner(body, res)
      case 'update-creator':
        return await handleUpdateCreator(body, res)
      case 'create-brief':
        return await handleCreateBrief(body, res)
      case 'update-brief':
        return await handleUpdateBrief(body, res)
      case 'create-creator-invite':
        return await handleCreateCreatorInvite(body, res)
      case 'creator-onboard':
        return await handleCreatorOnboard(body, res)
      case 'health-check':
        return await handleHealthCheck(res, { sendSlack: body.sendSlack || false })
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` })
    }
  } catch (error) {
    console.error('[actions] Error:', error)
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Order not found' })
    }
    return res.status(500).json({ error: error.message })
  }
}

// --- accept-match ---
async function handleAcceptMatch({ orderNumber, match }, res) {
  if (!orderNumber || !match) {
    return res.status(400).json({ error: 'orderNumber and match are required' })
  }

  const order = await prisma.order.findFirst({ where: { orderNumber } })
  if (!order) return res.status(404).json({ error: `Order not found: ${orderNumber}` })

  const research = await prisma.runnerResearch.findFirst({
    where: { orderId: order.id },
    orderBy: { createdAt: 'desc' }
  })
  if (!research) return res.status(404).json({ error: 'No research record found for this order' })

  const updatedResearch = await prisma.runnerResearch.update({
    where: { id: research.id },
    data: {
      bibNumber: match.bib || null,
      officialTime: match.time || null,
      officialPace: match.pace || null,
      eventType: match.eventType || research.eventType || null,
      resultsUrl: match.resultsUrl || research.resultsUrl || null,
      researchStatus: 'found',
      researchNotes: `Accepted match: "${match.name}" (original search: "${order.runnerName}")`
    }
  })

  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'ready', researchedAt: new Date() }
  })

  console.log(`[actions/accept-match] Match accepted for order ${orderNumber}: ${match.name}`)
  return res.status(200).json({ success: true, research: updatedResearch })
}

// --- clear-race-cache ---
async function handleClearRaceCache(res) {
  const { count } = await prisma.race.updateMany({
    data: { resultsUrl: null, resultsSiteType: null, location: null }
  })
  console.log(`[actions/clear-race-cache] Cleared cache for ${count} races`)
  return res.status(200).json({ success: true, cleared: count })
}

// --- clear-research ---
async function handleClearResearch({ raceName }, res) {
  if (raceName) {
    const race = await prisma.race.findFirst({ where: { raceName } })
    if (!race) return res.status(404).json({ error: `Race not found: ${raceName}` })

    const { count } = await prisma.runnerResearch.deleteMany({
      where: { raceId: race.id }
    })

    await prisma.order.updateMany({
      where: {
        status: { in: ['ready', 'flagged'] },
        raceName: { contains: raceName, mode: 'insensitive' }
      },
      data: { status: 'pending' }
    })

    console.log(`[actions/clear-research] Deleted ${count} research records for ${raceName}`)
    return res.status(200).json({ success: true, deleted: count, raceName })
  }

  const { count } = await prisma.runnerResearch.deleteMany({})
  await prisma.order.updateMany({
    where: { status: { in: ['ready', 'flagged'] } },
    data: { status: 'pending' }
  })

  console.log(`[actions/clear-research] Deleted ${count} research records (all races)`)
  return res.status(200).json({ success: true, deleted: count })
}

// --- complete ---
async function handleComplete({ orderNumber }, res) {
  if (!orderNumber) return res.status(400).json({ error: 'orderNumber is required' })

  const existing = await prisma.order.findFirst({ where: { orderNumber } })
  if (!existing) return res.status(404).json({ error: 'Order not found' })

  const order = await prisma.order.update({
    where: { id: existing.id },
    data: { status: 'completed', researchedAt: new Date() }
  })

  console.log(`[actions/complete] Order ${orderNumber} marked as completed`)
  return res.status(200).json({ success: true, order })
}

// --- design-status ---
const VALID_DESIGN_STATUSES = ['not_started', 'in_progress', 'awaiting_review', 'in_revision', 'approved_by_customer', 'final_pdf_uploaded', 'sent_to_production']

async function handleDesignStatus({ orderNumber, designStatus }, res) {
  if (!orderNumber) return res.status(400).json({ error: 'orderNumber is required' })
  if (!designStatus || !VALID_DESIGN_STATUSES.includes(designStatus)) {
    return res.status(400).json({
      error: `Invalid designStatus. Must be one of: ${VALID_DESIGN_STATUSES.join(', ')}`
    })
  }

  const existing = await prisma.order.findFirst({ where: { orderNumber } })
  if (!existing) return res.status(404).json({ error: 'Order not found' })
  if (existing.trackstarOrderType !== 'custom') {
    return res.status(400).json({ error: 'Design status can only be updated for custom orders' })
  }

  const updateData = { designStatus }
  if (designStatus === 'sent_to_production') {
    updateData.status = 'completed'
    updateData.researchedAt = new Date()
  }
  if (existing.designStatus === 'sent_to_production' && designStatus !== 'sent_to_production') {
    updateData.status = 'pending'
    updateData.researchedAt = null
  }

  // Unapprove: when moving back from approved_by_customer, reset the approved proof
  // so the customer portal doesn't stay stuck on the "approved" screen
  if (existing.designStatus === 'approved_by_customer' && designStatus === 'in_revision') {
    await prisma.proof.updateMany({
      where: { orderId: existing.id, status: 'approved' },
      data: { status: 'revision_requested' }
    })
    console.log(`[actions/design-status] Reset approved proofs to revision_requested for order ${orderNumber}`)
  }

  const order = await prisma.order.update({
    where: { id: existing.id },
    data: updateData
  })

  console.log(`[actions/design-status] Order ${orderNumber} design status → ${designStatus}`)

  // Slack notification when sent to production
  if (designStatus === 'sent_to_production' && process.env.SLACK_PROOF_WEBHOOK_URL) {
    const shopifyData = existing.shopifyOrderData
    const displayNum = (shopifyData && typeof shopifyData === 'object' && 'name' in shopifyData)
      ? String(shopifyData.name) : `#${existing.parentOrderNumber}`
    fetch(process.env.SLACK_PROOF_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🖨️ <@U09UVEP1N3Y> Final PDF ready for order *${displayNum}* — ready for production!`
      })
    }).catch(e => console.warn('[actions] Slack failed:', e.message))
  }

  return res.status(200).json({ success: true, order })
}

// --- customers-served-info ---
async function handleCustomersServedInfo(res) {
  const info = await getCustomersServedInfo(prisma)
  return res.status(200).json({ success: true, ...info })
}

// --- customers-served-sync ---
async function handleCustomersServedSync(res) {
  const info = await getCustomersServedInfo(prisma)
  const synced = await syncCustomersServedToShopify(prisma)
  return res.status(200).json({ success: synced, ...info, syncedToShopify: synced })
}

// --- customers-served-set ---
async function handleCustomersServedSet({ count }, res) {
  if (count === undefined || count === null) {
    return res.status(400).json({ error: 'count is required' })
  }
  const parsedCount = parseInt(count, 10)
  if (isNaN(parsedCount) || parsedCount < 0) {
    return res.status(400).json({ error: 'count must be a non-negative integer' })
  }

  await setCustomersServedCount(prisma, parsedCount)
  const synced = await syncCustomersServedToShopify(prisma)

  console.log(`[actions/customers-served-set] Count set to ${parsedCount.toLocaleString('en-US')} and synced: ${synced}`)
  return res.status(200).json({
    success: true,
    count: parsedCount,
    formatted: parsedCount.toLocaleString('en-US'),
    syncedToShopify: synced
  })
}

// --- feature-request ---
async function handleFeatureRequest({ type, description }, res) {
  if (!type || !description) {
    return res.status(400).json({ error: 'type and description are required' })
  }

  const emoji = type === 'bug' ? '🐛' : '✨'
  const title = type === 'bug' ? 'Bug Report' : 'Feature Request'

  const message = {
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: `${emoji} New ${title}`, emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: description } }
    ]
  }

  try {
    const slackResponse = await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    })

    if (!slackResponse.ok) throw new Error('Failed to send message to Slack')
  } catch (slackErr) {
    console.error(`[actions/feature-request] Slack send failed:`, slackErr.message)
    return res.status(500).json({ error: 'Failed to send request to Slack' })
  }

  console.log(`[actions/feature-request] ${title} submitted`)
  return res.status(200).json({ success: true, message: 'Request submitted successfully' })
}

// --- monday-pipeline (Vercel cron) ---
async function handleMondayPipeline(res) {
  try {
    const pipelineOrders = await prisma.order.findMany({
      where: {
        trackstarOrderType: 'custom',
        designStatus: { not: 'sent_to_production' }
      },
      select: {
        id: true,
        dueDate: true,
        designStatus: true,
        runnerName: true,
        displayOrderNumber: true,
        raceName: true
      }
    })

    const total = pipelineOrders.length
    const now = new Date()

    // Urgent = due within 3 days (same logic as frontend)
    const urgentOrders = pipelineOrders.filter(o => {
      if (!o.dueDate) return false
      const diffDays = Math.ceil((new Date(o.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return diffDays <= 3
    })

    const revisionCount = pipelineOrders.filter(o => o.designStatus === 'in_revision').length
    const awaitingCustomerCount = pipelineOrders.filter(o => o.designStatus === 'awaiting_review').length
    const urgentCount = urgentOrders.length

    const formatDate = (dateStr) => {
      if (!dateStr) return 'no date'
      const d = new Date(dateStr)
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

    const urgentSection = urgentCount > 0
      ? `\n\n:rotating_light: *Urgent (due within 3 days):*\n${urgentOrders.map(o => `• #${o.displayOrderNumber || '?'} — ${o.runnerName || 'Unknown'} (${o.raceName || 'Custom'}) — due ${formatDate(o.dueDate)}`).join('\n')}`
      : ''

    const message = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '📋 Monday Custom Orders Check-In' }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Hey <@U09UVEP1N3Y>! Here's our custom design update for the week:\n\n*${total} custom order${total !== 1 ? 's' : ''}* in the pipeline\n*${urgentCount} urgent* (due within 3 days)\n*${revisionCount}* that we need revisions on\n*${awaitingCustomerCount}* that we are waiting on customers for${urgentSection}\n\nLet's have an epic week, brotha`
          }
        }
      ]
    }

    const slackResponse = await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    })

    if (!slackResponse.ok) throw new Error('Failed to send Slack message')

    console.log(`[actions/monday-pipeline] Sent pipeline summary: ${total} orders, ${urgentCount} urgent`)
    return res.status(200).json({ success: true, total, urgentCount, revisionCount, awaitingCustomerCount })
  } catch (error) {
    console.error('[actions/monday-pipeline] Error:', error)
    return res.status(500).json({ error: error.message })
  }
}

// --- health-check ---
async function handleHealthCheck(res, { sendSlack = false } = {}) {
  const results = {
    timestamp: new Date().toISOString(),
    checks: {},
    overall: 'healthy'
  }

  // 1. Database
  results.checks.database = await (async () => {
    const start = Date.now()
    try {
      const count = await prisma.order.count()
      return { status: 'ok', latency: `${Date.now() - start}ms`, detail: `${count} orders in database` }
    } catch (err) {
      return { status: 'error', detail: err.message, latency: `${Date.now() - start}ms` }
    }
  })()

  // 2. Etsy API — token refresh + shop ping
  results.checks.etsy = await (async () => {
    const start = Date.now()
    try {
      const apiKey = process.env.ETSY_API_KEY
      const sharedSecret = process.env.ETSY_SHARED_SECRET
      if (!apiKey || !sharedSecret) return { status: 'error', detail: 'Missing ETSY_API_KEY or ETSY_SHARED_SECRET' }

      const tokenRow = await prisma.systemConfig.findUnique({ where: { key: 'etsy_refresh_token' } })
      if (!tokenRow?.value) return { status: 'error', detail: 'No Etsy refresh token in database' }

      const refreshResp = await fetch('https://api.etsy.com/v3/public/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', client_id: apiKey, refresh_token: tokenRow.value }).toString()
      })
      if (!refreshResp.ok) {
        const errText = await refreshResp.text()
        return { status: 'error', detail: `Token refresh failed (${refreshResp.status}): ${errText}`, latency: `${Date.now() - start}ms` }
      }
      const tokenData = await refreshResp.json()

      // Persist rotated refresh token
      if (tokenData.refresh_token && tokenData.refresh_token !== tokenRow.value) {
        await prisma.systemConfig.upsert({
          where: { key: 'etsy_refresh_token' },
          update: { value: tokenData.refresh_token },
          create: { key: 'etsy_refresh_token', value: tokenData.refresh_token }
        })
      }

      // Quick API test
      const shopId = process.env.ETSY_SHOP_ID
      if (shopId && tokenData.access_token) {
        const testResp = await fetch(`https://openapi.etsy.com/v3/application/shops/${shopId}`, {
          headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'x-api-key': `${apiKey}:${sharedSecret}` }
        })
        if (!testResp.ok) return { status: 'error', detail: `Shop API returned ${testResp.status}`, latency: `${Date.now() - start}ms` }
      }

      return { status: 'ok', detail: 'Token refresh + API call succeeded', latency: `${Date.now() - start}ms` }
    } catch (err) {
      return { status: 'error', detail: err.message, latency: `${Date.now() - start}ms` }
    }
  })()

  // 3. Shopify API — OAuth + shop ping
  results.checks.shopify = await (async () => {
    const start = Date.now()
    try {
      const store = process.env.SHOPIFY_STORE
      const clientId = process.env.SHOPIFY_CLIENT_ID
      const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
      if (!store || !clientId || !clientSecret) return { status: 'error', detail: 'Missing Shopify credentials' }

      const tokenResp = await fetch(`https://${store}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' })
      })
      if (!tokenResp.ok) return { status: 'error', detail: `OAuth failed (${tokenResp.status})`, latency: `${Date.now() - start}ms` }

      const { access_token } = await tokenResp.json()
      const shopResp = await fetch(`https://${store}/admin/api/2024-01/shop.json`, {
        headers: { 'X-Shopify-Access-Token': access_token }
      })
      if (!shopResp.ok) return { status: 'error', detail: `Shop API returned ${shopResp.status}`, latency: `${Date.now() - start}ms` }

      return { status: 'ok', detail: 'OAuth + API call succeeded', latency: `${Date.now() - start}ms` }
    } catch (err) {
      return { status: 'error', detail: err.message, latency: `${Date.now() - start}ms` }
    }
  })()

  // 4. Resend (email)
  results.checks.resend = await (async () => {
    const start = Date.now()
    try {
      const apiKey = process.env.RESEND_API_KEY
      if (!apiKey) return { status: 'error', detail: 'Missing RESEND_API_KEY' }

      const resp = await fetch('https://api.resend.com/domains', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      if (!resp.ok) return { status: 'error', detail: `API returned ${resp.status}`, latency: `${Date.now() - start}ms` }

      const data = await resp.json()
      const domains = data.data?.map(d => `${d.name} (${d.status})`).join(', ') || 'none'
      return { status: 'ok', detail: `Domains: ${domains}`, latency: `${Date.now() - start}ms` }
    } catch (err) {
      return { status: 'error', detail: err.message, latency: `${Date.now() - start}ms` }
    }
  })()

  // 5. Slack webhook
  results.checks.slack = (() => {
    const url = process.env.SLACK_PROOF_WEBHOOK_URL
    if (!url) return { status: 'error', detail: 'Missing SLACK_PROOF_WEBHOOK_URL' }
    if (!url.startsWith('https://hooks.slack.com/')) return { status: 'error', detail: 'Webhook URL format invalid' }
    return { status: 'ok', detail: 'Webhook URL configured' }
  })()

  // 6. Environment variables
  results.checks.envVars = (() => {
    const required = [
      'DATABASE_URL', 'ADMIN_SECRET', 'CRON_SECRET',
      'SHOPIFY_STORE', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET',
      'ETSY_API_KEY', 'ETSY_SHARED_SECRET', 'ETSY_SHOP_ID',
      'RESEND_API_KEY', 'SLACK_PROOF_WEBHOOK_URL', 'SLACK_DM_WEBHOOK_URL',
      'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
    ]
    const missing = required.filter(k => !process.env[k])
    if (missing.length === 0) return { status: 'ok', detail: `All ${required.length} required vars set` }
    return { status: missing.length <= 2 ? 'warn' : 'error', detail: `Missing: ${missing.join(', ')}` }
  })()

  // Determine overall health
  const statuses = Object.values(results.checks).map(c => c.status)
  if (statuses.some(s => s === 'error')) results.overall = 'degraded'
  if (statuses.filter(s => s === 'error').length >= 3) results.overall = 'critical'

  // Send to Slack DM (falls back to team channel if DM webhook not set)
  const slackHealthUrl = process.env.SLACK_DM_WEBHOOK_URL || process.env.SLACK_PROOF_WEBHOOK_URL
  if (sendSlack && slackHealthUrl) {
    const emoji = { healthy: '✅', degraded: '⚠️', critical: '🚨' }
    const checkLines = Object.entries(results.checks).map(([name, check]) => {
      const icon = check.status === 'ok' ? '✅' : check.status === 'warn' ? '⚠️' : '❌'
      return `${icon}  *${name}*: ${check.detail}${check.latency ? ` (${check.latency})` : ''}`
    })
    const text = [
      `${emoji[results.overall] || '❓'} *Weekly System Health Check*`,
      `Status: *${results.overall.toUpperCase()}*`,
      '', ...checkLines, '', `_${results.timestamp}_`
    ].join('\n')

    try {
      await fetch(slackHealthUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      })
    } catch (err) {
      console.error('[health] Failed to send Slack report:', err.message)
    }
  }

  const httpStatus = results.overall === 'healthy' ? 200 : 503
  return res.status(httpStatus).json(results)
}

// --- create-race-partner ---
// Creates a "race_partner" Order row used as the parent for proof/approval
// workflows sent to race organizations. These are NOT customer orders; they
// reuse the Order table so the existing Proof + ApprovalToken plumbing works
// unchanged. Race-partner rows are excluded from default all-orders queries.
function slugifyPartner(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'partner'
}

async function handleCreateRacePartner({ partnerName, raceYear, contactName, contactEmail }, res) {
  if (!partnerName || !String(partnerName).trim()) {
    return res.status(400).json({ error: 'partnerName is required' })
  }

  const year = parseInt(raceYear, 10) || new Date().getFullYear()
  const baseOrderNumber = `RP-${slugifyPartner(partnerName)}-${year}`

  // Guarantee uniqueness against the (parentOrderNumber, lineItemIndex) constraint.
  let orderNumber = baseOrderNumber
  let suffix = 0
  while (true) {
    const existing = await prisma.order.findFirst({ where: { parentOrderNumber: orderNumber } })
    if (!existing) break
    suffix += 1
    orderNumber = `${baseOrderNumber}-${suffix}`
  }

  // Reuse existing Order columns (no schema change):
  //   raceName      → partner/race name
  //   customerName  → partner contact name
  //   customerEmail → partner contact email
  const created = await prisma.order.create({
    data: {
      orderNumber,
      parentOrderNumber: orderNumber,
      lineItemIndex: 0,
      source: 'race_partner',
      arteloOrderData: {},
      raceName: String(partnerName).trim(),
      raceYear: year,
      runnerName: '—',
      productSize: '—',
      frameType: '—',
      trackstarOrderType: 'race_partner',
      designStatus: 'not_started',
      status: 'pending',
      customerEmail: contactEmail ? String(contactEmail).trim() : null,
      customerName: contactName ? String(contactName).trim() : null,
    }
  })

  console.log(`[actions/create-race-partner] Created ${created.id} (${orderNumber})`)
  return res.status(201).json({ success: true, order: created })
}

// --- creator-home-metrics ---
// Aggregates the homepage tiles for /creators.
// Sample-cost is a placeholder for now (user will provide real per-size pricing
// later). Marking the metric as PLACEHOLDER on the frontend is handled there.
const PLACEHOLDER_SAMPLE_COST_USD = 50 // TODO: replace with per-size/frame lookup

async function handleCreatorHomeMetrics(res) {
  // Run aggregations in parallel
  const [
    activeCount,
    invitedCount,
    onboardedCount,
    pausedCount,
    sampleOrders,
    thisMonthOnboards,
  ] = await Promise.all([
    prisma.creator.count({ where: { status: 'active' } }),
    prisma.creator.count({ where: { status: 'invited' } }),
    prisma.creator.count({ where: { status: 'onboarded' } }),
    prisma.creator.count({ where: { status: 'paused' } }),
    prisma.order.findMany({
      where: { source: 'creator_sample' },
      select: { id: true, status: true, productSize: true, frameType: true }
    }),
    prisma.creator.count({
      where: {
        onboardedAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        }
      }
    }),
  ])

  const samplesShipped = sampleOrders.filter(o => o.status === 'completed').length
  const samplesPending = sampleOrders.length - samplesShipped
  const samplesCostEstimatedUsd = sampleOrders.length * PLACEHOLDER_SAMPLE_COST_USD

  return res.status(200).json({
    creators: {
      total: activeCount + invitedCount + onboardedCount + pausedCount,
      active: activeCount,
      invited: invitedCount,
      onboarded: onboardedCount,
      paused: pausedCount,
      onboardedThisMonth: thisMonthOnboards,
    },
    samples: {
      total: sampleOrders.length,
      shipped: samplesShipped,
      pending: samplesPending,
      costEstimatedUsd: samplesCostEstimatedUsd,
      costIsPlaceholder: true,
    },
    // Placeholders for Week 3 when Meta + attribution land
    ads: { running: 0, isPlaceholder: true },
    revenue: { attributedThisMonthUsd: 0, isPlaceholder: true },
    commission: { pendingUsd: 0, isPlaceholder: true },
  })
}

// --- list-creators ---
// Returns all creators with their sample-order status joined in. Ordered by
// invite date descending so the most recent shows up first.
async function handleListCreators(res) {
  const creators = await prisma.creator.findMany({
    orderBy: { invitedAt: 'desc' },
    include: {
      sampleOrder: {
        select: { id: true, orderNumber: true, status: true, createdAt: true }
      },
      briefAssignments: {
        include: { brief: { select: { id: true, title: true, status: true } } }
      }
    }
  })
  return res.status(200).json({ creators })
}

// --- update-creator ---
// Updates editable fields on a creator. Only allow-listed fields can be
// changed through this endpoint — protects against accidental overwrite of
// inviteToken, onboardedAt, sampleOrderId, etc.
const CREATOR_EDITABLE_FIELDS = [
  'name', 'email', 'instagramHandle', 'tiktokHandle',
  'commissionModel', 'commissionConfig', 'commissionNotes',
  'whitelistingEnabled', 'metaPageId',
  'status',
]

async function handleUpdateCreator({ creatorId, updates }, res) {
  if (!creatorId) {
    return res.status(400).json({ error: 'creatorId is required' })
  }
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'updates object is required' })
  }

  const data = {}
  for (const key of CREATOR_EDITABLE_FIELDS) {
    if (key in updates) data[key] = updates[key]
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'no editable fields provided' })
  }

  const updated = await prisma.creator.update({
    where: { id: creatorId },
    data,
    include: {
      sampleOrder: {
        select: { id: true, orderNumber: true, status: true, createdAt: true }
      }
    }
  })

  console.log(`[actions/update-creator] Updated creator ${creatorId}: ${Object.keys(data).join(', ')}`)
  return res.status(200).json({ success: true, creator: updated })
}

// --- list-briefs ---
async function handleListBriefs(res) {
  const briefs = await prisma.brief.findMany({
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    include: {
      _count: { select: { assignments: true } }
    }
  })
  return res.status(200).json({ briefs })
}

// --- create-brief ---
const BRIEF_EDITABLE_FIELDS = [
  'title', 'description', 'styleOfVideo', 'angle',
  'targetLength', 'hooks', 'persona', 'examplesNotes', 'status',
]

async function handleCreateBrief(body, res) {
  if (!body.title || !String(body.title).trim()) {
    return res.status(400).json({ error: 'title is required' })
  }
  const data = { title: String(body.title).trim() }
  for (const key of BRIEF_EDITABLE_FIELDS) {
    if (key !== 'title' && key in body) data[key] = body[key]
  }
  const created = await prisma.brief.create({ data })
  console.log(`[actions/create-brief] Created ${created.id}: ${created.title}`)
  return res.status(201).json({ success: true, brief: created })
}

// --- update-brief ---
async function handleUpdateBrief({ briefId, updates }, res) {
  if (!briefId) return res.status(400).json({ error: 'briefId is required' })
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'updates object is required' })
  }
  const data = {}
  for (const key of BRIEF_EDITABLE_FIELDS) {
    if (key in updates) data[key] = updates[key]
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'no editable fields provided' })
  }
  const updated = await prisma.brief.update({ where: { id: briefId }, data })
  console.log(`[actions/update-brief] Updated ${briefId}: ${Object.keys(data).join(', ')}`)
  return res.status(200).json({ success: true, brief: updated })
}

// --- create-creator-invite ---
// Creates a new Creator row in "invited" state. Matt picks which briefs
// should appear in the creator's onboarding (optional multi-select).
//
// Token is URL-safe random 20 chars — short enough to DM, long enough to
// resist guessing. Doubles as the creator's persistent portal access token.
function makeInviteToken() {
  return crypto.randomBytes(15).toString('base64url')
}

async function handleCreateCreatorInvite({ name, email, instagramHandle, briefIds }, res) {
  // All fields optional except the implicit token. Matt may not know the
  // creator's name yet when generating the link.
  const data = {
    inviteToken: makeInviteToken(),
    status: 'invited',
  }
  if (name && String(name).trim()) data.name = String(name).trim()
  if (email && String(email).trim()) data.email = String(email).trim()
  if (instagramHandle && String(instagramHandle).trim()) {
    data.instagramHandle = String(instagramHandle).trim()
  }

  const created = await prisma.creator.create({ data })

  // Attach brief assignments if any were picked
  if (Array.isArray(briefIds) && briefIds.length > 0) {
    await prisma.briefAssignment.createMany({
      data: briefIds.map(briefId => ({ creatorId: created.id, briefId })),
      skipDuplicates: true,
    })
  }

  console.log(`[actions/create-creator-invite] Created ${created.id} with ${briefIds?.length || 0} brief(s)`)
  return res.status(201).json({ success: true, creator: created })
}

// --- creator-portal-data (PUBLIC) ---
// Token-gated. Returns enough info for the creator's portal to render:
// their own profile + assigned briefs (full detail) + sample status.
async function handleCreatorPortalData(token, res) {
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'token is required' })
  }

  const creator = await prisma.creator.findUnique({
    where: { inviteToken: token },
    include: {
      briefAssignments: {
        include: { brief: true },
        orderBy: { assignedAt: 'asc' }
      },
      sampleOrder: {
        select: { id: true, orderNumber: true, status: true, createdAt: true }
      }
    }
  })

  if (!creator) {
    return res.status(404).json({ error: 'Invite not found or revoked' })
  }

  // Filter assigned briefs to active ones only — archived briefs shouldn't
  // surface to the creator even if they were assigned historically.
  const briefs = creator.briefAssignments
    .map(a => a.brief)
    .filter(b => b.status === 'active')

  // Don't leak admin-only fields (commission, notes, etc.) to the creator.
  return res.status(200).json({
    creator: {
      id: creator.id,
      name: creator.name,
      email: creator.email,
      instagramHandle: creator.instagramHandle,
      tiktokHandle: creator.tiktokHandle,
      raceName: creator.raceName,
      raceYear: creator.raceYear,
      bibNumber: creator.bibNumber,
      finishTime: creator.finishTime,
      productSize: creator.productSize,
      frameType: creator.frameType,
      shippingName: creator.shippingName,
      shippingAddress1: creator.shippingAddress1,
      shippingAddress2: creator.shippingAddress2,
      shippingCity: creator.shippingCity,
      shippingState: creator.shippingState,
      shippingZip: creator.shippingZip,
      shippingCountry: creator.shippingCountry,
      status: creator.status,
      onboardedAt: creator.onboardedAt,
    },
    briefs,
    sampleOrder: creator.sampleOrder,
  })
}

// --- creator-onboard (PUBLIC) ---
// Token-gated. Creator submits the onboarding wizard — we save everything
// to their Creator row and flip status → 'onboarded'.
// Sample-order creation lands in the next commit (Elí's queue integration).
const CREATOR_ONBOARD_FIELDS = [
  'name', 'email', 'instagramHandle', 'tiktokHandle',
  'raceName', 'raceYear', 'bibNumber', 'finishTime',
  'productSize', 'frameType',
  'shippingName', 'shippingAddress1', 'shippingAddress2',
  'shippingCity', 'shippingState', 'shippingZip', 'shippingCountry',
]

async function handleCreatorOnboard({ token, data }, res) {
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'token is required' })
  }
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'data object is required' })
  }

  const creator = await prisma.creator.findUnique({ where: { inviteToken: token } })
  if (!creator) return res.status(404).json({ error: 'Invite not found or revoked' })

  // Build the update. Only allow-listed fields are accepted.
  const updates = {}
  for (const key of CREATOR_ONBOARD_FIELDS) {
    if (key in data) updates[key] = data[key]
  }
  if (updates.raceYear != null) updates.raceYear = parseInt(updates.raceYear, 10) || null

  // Flip status + stamp onboardedAt on first-pass onboarding. Re-submits
  // from an already-onboarded creator just update their profile fields —
  // we don't reset onboardedAt (and don't re-create the sample order).
  const isFirstOnboard = !creator.onboardedAt
  if (isFirstOnboard) {
    updates.onboardedAt = new Date()
    updates.status = 'onboarded'
  }

  const updated = await prisma.creator.update({
    where: { id: creator.id },
    data: updates,
  })

  // On first onboarding, create the sample Order and link it. This drops
  // the creator's sample into Elí's Standard queue so he can fulfill it
  // like any other standard order (the "Creator" badge in the list view
  // identifies it as a free creator sample, not a paying customer).
  if (isFirstOnboard && !creator.sampleOrderId) {
    await createCreatorSampleOrder(updated)
  }

  console.log(`[actions/creator-onboard] ${creator.id} onboarded (or updated): ${Object.keys(updates).join(', ')}`)
  return res.status(200).json({ success: true, creator: { id: updated.id, status: updated.status } })
}

// Helper — create the Standard Order that Elí will fulfill as the creator's
// sample print. Reuses the existing Order table so the whole fulfillment
// pipeline (queue, drawer, completion) works unchanged.
async function createCreatorSampleOrder(creator) {
  const shortId = creator.id.slice(-6).toUpperCase()
  const orderNumber = `CREATOR-${shortId}`

  const order = await prisma.order.create({
    data: {
      orderNumber,
      parentOrderNumber: orderNumber,
      lineItemIndex: 0,
      source: 'creator_sample',
      trackstarOrderType: 'standard',
      status: 'pending',

      // Race + product (all required NOT NULL — populated from onboarding)
      raceName: creator.raceName || 'Unknown Race',
      raceYear: creator.raceYear || new Date().getFullYear(),
      runnerName: creator.name || 'Creator',
      productSize: creator.productSize || '—',
      frameType: creator.frameType || '—',

      // Everything Elí needs to actually produce + ship this lives here.
      // She'll manually mirror this into Artelo. Keeping it in a single
      // JSON blob avoids schema changes on Order.
      arteloOrderData: {
        creatorSample: true,
        creatorId: creator.id,
        bibNumber: creator.bibNumber || null,
        finishTime: creator.finishTime || null,
        shipping: {
          name: creator.shippingName || creator.name || null,
          address1: creator.shippingAddress1 || null,
          address2: creator.shippingAddress2 || null,
          city: creator.shippingCity || null,
          state: creator.shippingState || null,
          zip: creator.shippingZip || null,
          country: creator.shippingCountry || 'US',
        },
        instagramHandle: creator.instagramHandle || null,
      },

      // Contact on the Order (mirrors race_partner pattern so the drawer's
      // existing "customer" fields render sensibly).
      customerName: creator.name || null,
      customerEmail: creator.email || null,
    }
  })

  // Link it back to the Creator
  await prisma.creator.update({
    where: { id: creator.id },
    data: { sampleOrderId: order.id },
  })

  console.log(`[actions/creator-onboard] Created sample order ${order.orderNumber} for creator ${creator.id}`)
  return order
}
