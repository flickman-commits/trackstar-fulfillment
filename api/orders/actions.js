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
 *
 * GET Actions (query.action):
 *   - monday-pipeline: Vercel cron — sends Monday morning Slack summary to Dan
 */

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

  // All POST actions require admin auth
  if (!requireAdmin(req, res)) return

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const { action } = body

    if (!action) {
      return res.status(400).json({ error: 'action is required' })
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
