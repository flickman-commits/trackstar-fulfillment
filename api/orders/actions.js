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
 *   - reopen: Un-complete an order — brings it back into the active queue
 *   - design-status: Update design status of a custom order
 *   - message-customer: Designer asks the customer a question (email + portal Q&A)
 *   - create-discount: Create a one-time Shopify discount code ($ or % off)
 *   - calculate-weather: Compute race-day weather (avg 7am–1pm) via Open-Meteo
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
import { shopifyFetch, shopifyGraphQL } from '../../server/services/shopifyAuth.js'
import { getRaceShorthands } from '../../server/scrapers/index.js'
import WeatherService from '../../server/services/WeatherService.js'
import { Resend } from 'resend'
import { runWeeklyAdsDebrief, isFridayFourPmEastern } from '../../server/services/weeklyAdsDebrief.js'

const APPROVAL_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000

// Ensure an ApprovalToken exists for an order; create one if missing. Returns
// the (existing or new) token row. Mirrors the proofs endpoint's token logic.
async function ensureApprovalToken(orderId) {
  const existing = await prisma.approvalToken.findUnique({ where: { orderId } })
  if (existing && new Date() < existing.expiresAt) return existing
  return prisma.approvalToken.upsert({
    where: { orderId },
    create: { orderId, token: crypto.randomUUID(), expiresAt: new Date(Date.now() + APPROVAL_TOKEN_EXPIRY_MS) },
    update: { token: crypto.randomUUID(), expiresAt: new Date(Date.now() + APPROVAL_TOKEN_EXPIRY_MS) },
  })
}

// Build the customer-facing approval/portal URL. Prod uses the Vercel
// production URL; falls back to APP_BASE_URL for other environments.
function buildPortalUrl(token) {
  const base = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : (process.env.APP_BASE_URL || 'https://trackstar-fulfillment.vercel.app')
  return `${base.replace(/\/$/, '')}/approve/${token}`
}

export default async function handler(req, res) {
  // Public action (no auth, open CORS): ping (UptimeRobot). The storefront
  // results lookup now lives in api/public/results-lookup.js. Everything else
  // uses the standard locked-down CORS.
  const action = req.query?.action
  const isPing = action === 'ping'
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS', allowPublic: isPing })) return

  // GET requests — used by Vercel cron (cron uses CRON_SECRET, not ADMIN_SECRET)
  if (req.method === 'GET') {
    if (action === 'monday-pipeline') {
      const authHeader = req.headers['authorization']
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' })
      }
      return await handleMondayPipeline(res)
    }
    if (action === 'daily-design-update') {
      // Cron uses CRON_SECRET; manual runs (for debugging) use ADMIN_SECRET.
      const cronAuth = req.headers['authorization']
      const isCron = cronAuth === `Bearer ${process.env.CRON_SECRET}`
      if (!isCron && !requireAdmin(req, res)) return
      return await handleDailyDesignUpdate(res)
    }
    if (action === 'race-shorthands') {
      if (!requireAdmin(req, res)) return
      // Merge user overrides over scraper-config defaults. Overrides win so
      // Matt can correct funky filename mappings without a code change.
      const defaults = getRaceShorthands()
      const overrideRow = await prisma.systemConfig.findUnique({
        where: { key: 'race_shorthand_overrides' }
      })
      let overrides = {}
      try {
        overrides = overrideRow?.value ? JSON.parse(overrideRow.value) : {}
      } catch { overrides = {} }
      return res.status(200).json({ shorthands: { ...defaults, ...overrides }, overrides })
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
    if (action === 'weekly-ads-debrief') {
      // Cron uses CRON_SECRET, manual uses ADMIN_SECRET.
      // Cron fires twice (20:00 + 21:00 UTC Friday) to handle DST; the
      // function checks isFridayFourPmEastern() and skips if not 4pm ET.
      // Manual triggers (?dryRun=1 or just the action) bypass the guard.
      const cronAuth = req.headers['authorization']
      const isCron = cronAuth === `Bearer ${process.env.CRON_SECRET}`
      if (!isCron && !requireAdmin(req, res)) return
      const dryRun = req.query?.dryRun === '1' || req.query?.dryRun === 'true'
      return await handleWeeklyAdsDebrief(res, { isCron, dryRun })
    }
    if (action === 'test-connections') {
      // Detailed Artelo / Shopify / Etsy step-by-step connection diagnostics
      if (!requireAdmin(req, res)) return
      return await handleTestConnections(res)
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
    if (action === 'shopify-products') {
      if (!requireAdmin(req, res)) return
      return await handleShopifyProducts(res)
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
    const PUBLIC_POST_ACTIONS = new Set(['creator-onboard', 'create-public-invite'])
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
      case 'reopen':
        return await handleReopen(body, res)
      case 'design-status':
        return await handleDesignStatus(body, res)
      case 'notify-custom-delay':
        return await handleNotifyCustomDelay(body, res)
      case 'message-customer':
        return await handleMessageCustomer(body, res)
      case 'create-discount':
        return await handleCreateDiscount(body, res)
      case 'calculate-weather':
        return await handleCalculateWeather(body, res)
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
      case 'delete-creator':
        return await handleDeleteCreator(body, res)
      case 'create-brief':
        return await handleCreateBrief(body, res)
      case 'update-brief':
        return await handleUpdateBrief(body, res)
      case 'create-creator-invite':
        return await handleCreateCreatorInvite(body, res)
      case 'create-public-invite':
        return await handleCreatePublicInvite(body, res)
      case 'creator-onboard':
        return await handleCreatorOnboard(body, res)
      case 'approve-creator-sample':
        return await handleApproveCreatorSample(body, res)
      case 'decline-creator-sample':
        return await handleDeclineCreatorSample(body, res)
      case 'set-creator-sample-tracking':
        return await handleSetCreatorSampleTracking(body, res)
      case 'set-race-shorthand':
        return await handleSetRaceShorthand(body, res)
      case 'merge-race':
        return await handleMergeRace(body, res)
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

  // Some scrapers (RTRT, MultiSport Australia, Tokyo) don't include time/pace
  // in their search results — those require a per-runner detail fetch. When
  // a user accepts a match without time data, re-run the scraper with the
  // matched runner's exact name so it can pull the full details (which IS
  // an exact match → returns time + pace).
  let enrichedTime = match.time || null
  let enrichedPace = match.pace || null
  let enrichedEventType = match.eventType || null
  let enrichedResultsUrl = match.resultsUrl || null

  if (!enrichedTime && match.name) {
    try {
      const { getScraperForRace } = await import('../../server/scrapers/index.js')
      const raceName = order.raceNameOverride || order.raceName
      const raceYear = order.yearOverride || order.raceYear
      const scraper = getScraperForRace(raceName, raceYear)
      console.log(`[actions/accept-match] Enriching match by re-searching "${match.name}"`)
      const enriched = await scraper.searchRunner(match.name)
      if (enriched.found) {
        enrichedTime = enriched.officialTime || enrichedTime
        enrichedPace = enriched.officialPace || enrichedPace
        enrichedEventType = enriched.eventType || enrichedEventType
        enrichedResultsUrl = enriched.resultsUrl || enrichedResultsUrl
        console.log(`[actions/accept-match] Enriched: time=${enrichedTime} pace=${enrichedPace}`)
      } else {
        console.log(`[actions/accept-match] Re-search did not return a unique match — saving with available data`)
      }
    } catch (err) {
      // Don't fail the accept — just save with what we have
      console.warn(`[actions/accept-match] Enrichment failed: ${err.message}`)
    }
  }

  const updatedResearch = await prisma.runnerResearch.update({
    where: { id: research.id },
    data: {
      bibNumber: match.bib || null,
      officialTime: enrichedTime,
      officialPace: enrichedPace,
      eventType: enrichedEventType || research.eventType || null,
      resultsUrl: enrichedResultsUrl || research.resultsUrl || null,
      researchStatus: 'found',
      // Keep the order's runnerName as the customer's original — don't change it.
      // The match name only goes in researchNotes for the audit trail.
      researchNotes: `Accepted match: "${match.name}" (original search: "${order.runnerName}")`,
      // Clear the persisted candidate list so the picker stops showing on this order
      possibleMatches: null,
    }
  })

  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'ready', researchedAt: new Date() }
  })

  console.log(`[actions/accept-match] Match accepted for order ${orderNumber}: ${match.name} (time: ${enrichedTime || 'n/a'})`)
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
  // Only clear research for orders that haven't shipped to production yet.
  // Completed orders keep their cached result so the finished poster's data
  // stays intact and auditable.
  if (raceName) {
    const race = await prisma.race.findFirst({ where: { raceName } })
    if (!race) return res.status(404).json({ error: `Race not found: ${raceName}` })

    const { count } = await prisma.runnerResearch.deleteMany({
      where: { raceId: race.id, order: { status: { not: 'completed' } } }
    })

    await prisma.order.updateMany({
      where: {
        status: { in: ['ready', 'flagged'] },
        raceName: { contains: raceName, mode: 'insensitive' }
      },
      data: { status: 'pending' }
    })

    console.log(`[actions/clear-research] Deleted ${count} research records for ${raceName} (excluding completed orders)`)
    return res.status(200).json({ success: true, deleted: count, raceName })
  }

  const { count } = await prisma.runnerResearch.deleteMany({
    where: { order: { status: { not: 'completed' } } }
  })
  await prisma.order.updateMany({
    where: { status: { in: ['ready', 'flagged'] } },
    data: { status: 'pending' }
  })

  console.log(`[actions/clear-research] Deleted ${count} research records (all races, excluding completed orders)`)
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

// --- reopen ---
// Un-completes an order. Restores status based on whether we have research
// data: 'ready' if found, otherwise 'pending'. This brings the order back
// into the active queue so it can be edited / re-researched / re-fulfilled.
async function handleReopen({ orderNumber }, res) {
  if (!orderNumber) return res.status(400).json({ error: 'orderNumber is required' })

  const existing = await prisma.order.findFirst({
    where: { orderNumber },
    include: { runnerResearch: { orderBy: { id: 'desc' }, take: 1 } }
  })
  if (!existing) return res.status(404).json({ error: 'Order not found' })
  if (existing.status !== 'completed') {
    return res.status(400).json({ error: `Order is not completed (current status: ${existing.status})` })
  }

  const research = existing.runnerResearch[0]
  const newStatus = research?.researchStatus === 'found' ? 'ready' : 'pending'

  const order = await prisma.order.update({
    where: { id: existing.id },
    data: { status: newStatus }
  })

  console.log(`[actions/reopen] Order ${orderNumber} re-opened (status: completed → ${newStatus})`)
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
  if (existing.trackstarOrderType !== 'custom' && existing.trackstarOrderType !== 'race_partner') {
    return res.status(400).json({ error: 'Design status can only be updated for custom or race partner orders' })
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

  // Mint an approval token as soon as design work begins, so Dan can message
  // the customer (and share the portal) even before any proofs exist.
  if (designStatus === 'in_progress') {
    await ensureApprovalToken(existing.id)
  }

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

// --- notify-custom-delay ---
// Sends Dan's "we're a bit behind" email to a custom-order customer.
// Doesn't change the order's dueDate — instead records that the notice was
// sent so the dashboard shows a "delay notice sent" badge. Pings Matt in
// Slack each time, so we have visibility into how often this is used (the
// goal is "rarely").
async function handleNotifyCustomDelay({ orderNumber, daysLate }, res) {
  if (!orderNumber) return res.status(400).json({ error: 'orderNumber is required' })
  const days = parseInt(daysLate, 10)
  if (!Number.isFinite(days) || days < 1 || days > 60) {
    return res.status(400).json({ error: 'daysLate must be an integer between 1 and 60' })
  }

  const existing = await prisma.order.findFirst({ where: { orderNumber } })
  if (!existing) return res.status(404).json({ error: 'Order not found' })
  if (existing.trackstarOrderType !== 'custom') {
    return res.status(400).json({ error: 'Delay notice is only for custom orders' })
  }
  if (!existing.customerEmail) {
    return res.status(400).json({ error: 'No customer email on file for this order — cannot send delay notice' })
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'Email service not configured (RESEND_API_KEY missing)' })
  }

  // Format the original due date in ET so it reads naturally to the customer
  const TZ = 'America/New_York'
  const originalDueDate = existing.dueDate
    ? new Date(existing.dueDate).toLocaleDateString('en-US', { timeZone: TZ, month: 'long', day: 'numeric' })
    : null

  // Display number on the email (matches what's shown in the dashboard)
  const shopifyData = existing.shopifyOrderData
  const displayNum = (shopifyData && typeof shopifyData === 'object' && 'name' in shopifyData)
    ? String(shopifyData.name) : `#${existing.parentOrderNumber}`

  const firstName = existing.customerName || 'there'
  const dueDateLine = originalDueDate
    ? `your mockup may arrive about <strong>${days} days after the ${originalDueDate}</strong> date we originally quoted.`
    : `your mockup may arrive about <strong>${days} days later</strong> than we originally quoted.`

  // On-brand email template — matches the proof email style (cream bg, dark
  // text, purple accent). Helvetica Neue for consistency.
  const emailHtml = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#F7F5F0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F5F0;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <!-- Logo -->
        <tr><td style="padding:0 0 32px;text-align:center;">
          <img src="https://www.trackstar.art/cdn/shop/files/Trackstar_Logo_Cropped.png?height=28&v=1757377797" alt="Trackstar" height="28" style="height:28px;" />
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;background-color:#FFFFFF;border:1px solid #E8E6E1;">
          <h1 style="margin:0 0 20px;font-size:22px;color:#1A1A1A;font-weight:700;letter-spacing:0.02em;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">A quick heads-up on your order</h1>
          <p style="margin:0 0 14px;font-size:15px;color:#555555;line-height:1.6;">Hey ${firstName},</p>
          <p style="margin:0 0 14px;font-size:15px;color:#555555;line-height:1.6;">
            Quick update — we've been swamped with custom orders the past couple of weeks, and things are running slightly behind where we'd hoped.
          </p>
          <p style="margin:0 0 14px;font-size:15px;color:#555555;line-height:1.6;">
            We haven't forgotten you. We refuse to put out a design we're not proud of, so ${dueDateLine}
          </p>
          <p style="margin:0 0 14px;font-size:15px;color:#555555;line-height:1.6;">
            We're sorry for the wait, and we promise it'll be worth it. We believe in keeping you in the loop, so we wanted to tell you personally. Excited to share your design soon.
          </p>
          <p style="margin:24px 0 0;font-size:15px;color:#555555;line-height:1.6;">
            Thanks for your patience,<br/>
            <strong>The Trackstar Design Team</strong>
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 0 0;text-align:center;">
          <p style="margin:0;font-size:11px;color:#999999;letter-spacing:0.05em;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Trackstar — Celebrating athletic achievement.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  const resend = new Resend(process.env.RESEND_API_KEY)
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Trackstar <proofs@orders.trackstar.art>'

  try {
    await resend.emails.send({
      from: fromEmail,
      to: [existing.customerEmail],
      cc: ['fast@trackstar.art'],
      subject: 'A quick heads-up on your Trackstar order',
      html: emailHtml,
    })
  } catch (emailErr) {
    console.error('[actions/notify-custom-delay] Email send failed:', emailErr)
    await alertError('Custom-order delay email', emailErr, { orderNumber, customerEmail: existing.customerEmail })
    return res.status(500).json({ error: 'Failed to send delay email. Please try again.' })
  }

  // Record that we sent the notice (don't change the dueDate itself)
  const order = await prisma.order.update({
    where: { id: existing.id },
    data: {
      delayNoticeSentAt: new Date(),
      delayNoticeDaysLate: days,
    }
  })

  // Slack DM to Matt — fire-and-forget. Uses the DM webhook if set, falls
  // back to the proof channel webhook.
  const slackUrl = process.env.SLACK_DM_WEBHOOK_URL || process.env.SLACK_PROOF_WEBHOOK_URL
  if (slackUrl) {
    const dueDateText = originalDueDate ? ` (was due ${originalDueDate})` : ''
    const text = `⏰ *Custom-order delay notice sent* — order *${displayNum}* for ${existing.customerName || 'customer'} (${existing.raceName || 'custom design'}). Promised *${days} day${days === 1 ? '' : 's'}* late${dueDateText}. Email went to ${existing.customerEmail}.`
    fetch(slackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).catch(e => console.warn('[actions/notify-custom-delay] Slack notify failed:', e.message))
  }

  console.log(`[actions/notify-custom-delay] Order ${orderNumber}: delay email sent (${days} days late)`)
  return res.status(200).json({ success: true, order })
}

// --- message-customer ---
// Dan asks a custom-order customer a question. Records the question as an
// OrderMessage, ensures the order has an approval token, emails the customer a
// short "your designer has a question — action required" note linking to the
// portal (where they answer inline), and pings Slack so we have visibility.
// The customer's reply comes back through api/proofs (action=customer-message).
async function handleMessageCustomer({ orderId, body }, res) {
  if (!orderId) return res.status(400).json({ error: 'orderId is required' })
  const text = (body || '').toString().trim()
  if (!text) return res.status(400).json({ error: 'Message body is required' })
  if (text.length > 2000) return res.status(400).json({ error: 'Message is too long (max 2000 chars)' })

  const existing = await prisma.order.findUnique({ where: { id: orderId } })
  if (!existing) return res.status(404).json({ error: 'Order not found' })
  if (existing.trackstarOrderType !== 'custom' && existing.trackstarOrderType !== 'race_partner') {
    return res.status(400).json({ error: 'Messaging is only for custom or race partner orders' })
  }
  if (!existing.customerEmail) {
    return res.status(400).json({ error: 'No customer email on file for this order' })
  }
  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'Email service not configured (RESEND_API_KEY missing)' })
  }

  // Make sure a portal token exists, then record the designer's question.
  const approvalToken = await ensureApprovalToken(orderId)
  const portalUrl = buildPortalUrl(approvalToken.token)

  const message = await prisma.orderMessage.create({
    data: { orderId, sender: 'designer', body: text, readByDesigner: true },
  })

  const shopifyData = existing.shopifyOrderData
  const displayNum = (shopifyData && typeof shopifyData === 'object' && 'name' in shopifyData)
    ? String(shopifyData.name) : `#${existing.parentOrderNumber}`
  const firstName = existing.customerName || 'there'

  // On-brand email — mirrors the proof/delay templates (cream bg, purple CTA,
  // Helvetica Neue). Intentionally does NOT include the question text: we want
  // the customer to answer in the portal, not reply by email.
  const emailHtml = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#F7F5F0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F5F0;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="padding:0 0 32px;text-align:center;">
          <img src="https://www.trackstar.art/cdn/shop/files/Trackstar_Logo_Cropped.png?height=28&v=1757377797" alt="Trackstar" height="28" style="height:28px;" />
        </td></tr>
        <tr><td style="padding:32px;background-color:#FFFFFF;border:1px solid #E8E6E1;">
          <h1 style="margin:0 0 16px;font-size:22px;color:#1A1A1A;font-weight:700;letter-spacing:0.02em;">Your designer has a question</h1>
          <p style="margin:0 0 14px;font-size:15px;color:#555555;line-height:1.6;">Hey ${firstName},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#555555;line-height:1.6;">
            We're working on your custom design for order ${displayNum} and our designer has a quick question for you. Tap below to read it and reply — it only takes a moment, and it helps us get your design just right.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0 0 8px;">
            <a href="${portalUrl}" style="display:inline-block;background-color:#4600D6;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;letter-spacing:0.03em;">VIEW &amp; REPLY</a>
          </td></tr></table>
          <p style="margin:20px 0 0;font-size:13px;color:#999999;line-height:1.6;text-align:center;">
            Please reply in the portal rather than to this email so nothing gets lost.
          </p>
        </td></tr>
        <tr><td style="padding:24px 0 0;text-align:center;">
          <p style="margin:0;font-size:11px;color:#999999;letter-spacing:0.05em;">Trackstar — Celebrating athletic achievement.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  const resend = new Resend(process.env.RESEND_API_KEY)
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Trackstar <proofs@orders.trackstar.art>'

  try {
    await resend.emails.send({
      from: fromEmail,
      to: [existing.customerEmail],
      subject: `A question about your Trackstar Order ${displayNum} (Action Required)`,
      html: emailHtml,
    })
  } catch (emailErr) {
    console.error('[actions/message-customer] Email send failed:', emailErr)
    await alertError('Customer question email', emailErr, { orderId, customerEmail: existing.customerEmail })
    // Roll back the recorded message so the thread doesn't show a question the
    // customer never received.
    await prisma.orderMessage.delete({ where: { id: message.id } }).catch(() => {})
    return res.status(500).json({ error: 'Failed to send the email. Please try again.' })
  }

  // Note: we intentionally do NOT change designStatus here. A question is
  // orthogonal to design progress — the order stays in Dan's queue until he
  // actually sends proofs.
  const slackUrl = process.env.SLACK_PROOF_WEBHOOK_URL
  if (slackUrl) {
    fetch(slackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `💬 Question sent to *${existing.customerName || 'customer'}* for order *${displayNum}* — emailed ${existing.customerEmail}. I'll ping you here when they reply.`,
      }),
    }).catch(e => console.warn('[actions/message-customer] Slack notify failed:', e.message))
  }

  console.log(`[actions/message-customer] Order ${existing.orderNumber}: question sent to ${existing.customerEmail}`)
  return res.status(200).json({ success: true, message, portalUrl })
}

// --- create-discount ---
// Creates a one-time ($ off or % off) Shopify discount code so customer support
// can quickly comp a customer. Uses the GraphQL discountCodeBasicCreate mutation
// (needs the write_discounts scope). Not logged locally — the record lives in
// Shopify (Discounts admin).
function generateDiscountCode() {
  // Readable random suffix — no ambiguous chars (0/O/1/I).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let suffix = ''
  const bytes = crypto.randomBytes(6)
  for (let i = 0; i < 6; i++) suffix += alphabet[bytes[i] % alphabet.length]
  return `TS-${suffix}`
}

async function handleCreateDiscount({ valueType, value, code, expiresInDays }, res) {
  if (!['percentage', 'fixed_amount'].includes(valueType)) {
    return res.status(400).json({ error: "valueType must be 'percentage' or 'fixed_amount'" })
  }
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'value must be a positive number' })
  }
  if (valueType === 'percentage' && amount > 100) {
    return res.status(400).json({ error: 'Percentage cannot exceed 100' })
  }

  const days = Number.isFinite(Number(expiresInDays)) && Number(expiresInDays) > 0
    ? Math.min(Number(expiresInDays), 365)
    : 30

  // Custom code (uppercased, sanitized) or an auto-generated one.
  const finalCode = (typeof code === 'string' && code.trim())
    ? code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '')
    : generateDiscountCode()
  if (!finalCode) return res.status(400).json({ error: 'Invalid code' })

  const startsAt = new Date().toISOString()
  const endsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

  // customerGets.value differs by type: percentage is a 0–1 decimal;
  // fixed_amount is a money amount off the order total.
  const valueField = valueType === 'percentage'
    ? { percentage: amount / 100 }
    : { discountAmount: { amount: amount.toFixed(2), appliesOnEachItem: false } }

  const mutation = `
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode { id }
        userErrors { field message }
      }
    }`

  const input = {
    title: finalCode,
    code: finalCode,
    startsAt,
    endsAt,
    usageLimit: 1, // one-time use
    customerSelection: { all: true },
    customerGets: {
      value: valueField,
      items: { all: true }, // applies to the whole order
    },
  }

  try {
    const data = await shopifyGraphQL(mutation, { basicCodeDiscount: input })
    const userErrors = data?.discountCodeBasicCreate?.userErrors || []
    if (userErrors.length > 0) {
      const msg = userErrors.map(e => e.message).join('; ')
      // A duplicate code is the common one — surface it cleanly.
      return res.status(400).json({ error: msg })
    }

    const label = valueType === 'percentage' ? `${amount}% off` : `$${amount.toFixed(2)} off`
    console.log(`[actions/create-discount] Created ${finalCode} (${label}, expires ${endsAt})`)
    return res.status(200).json({
      success: true,
      code: finalCode,
      valueType,
      value: amount,
      label,
      endsAt,
    })
  } catch (err) {
    console.error('[actions/create-discount] Failed:', err.message)
    return res.status(500).json({ error: `Failed to create discount: ${err.message}` })
  }
}

// --- calculate-weather ---
// Computes race-window weather (avg temp 7am–1pm + dominant condition) for a
// date + city via Open-Meteo, and — when a raceId is given — saves it to the
// Race so the poster's weather + the info breakdown persist.
async function handleCalculateWeather({ raceId, city, date }, res) {
  const cityStr = (city || '').toString().trim()
  const dateStr = (date || '').toString().trim()
  if (!cityStr) return res.status(400).json({ error: 'city is required' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' })

  const weatherService = new WeatherService()
  let result
  try {
    result = await weatherService.calculateRaceWeather(dateStr, cityStr)
  } catch (err) {
    console.error('[actions/calculate-weather] Error:', err.message)
    return res.status(500).json({ error: `Weather lookup failed: ${err.message}` })
  }

  if (!result.temp || !result.condition) {
    return res.status(422).json({ error: result.error || 'Could not determine weather for that date and city' })
  }

  // Persist to the race (so the poster weather + info breakdown stick).
  if (raceId) {
    try {
      await prisma.race.update({
        where: { id: parseInt(raceId, 10) },
        data: {
          weatherTemp: result.temp,
          weatherCondition: result.condition,
          weatherFetchedAt: new Date(),
          weatherDetails: JSON.stringify(result.breakdown),
        },
      })
    } catch (err) {
      console.error('[actions/calculate-weather] Save failed:', err.message)
      // Still return the computed result even if the save failed.
    }
  }

  console.log(`[actions/calculate-weather] ${cityStr} ${dateStr} → ${result.temp}, ${result.condition}`)
  return res.status(200).json({
    success: true,
    temp: result.temp,
    condition: result.condition,
    breakdown: result.breakdown,
  })
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
        orderNumber: true,
        parentOrderNumber: true,
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
      ? `\n\n:rotating_light: *Urgent (due within 3 days):*\n${urgentOrders.map(o => `• #${o.parentOrderNumber || o.orderNumber || '?'} — ${o.runnerName || 'Unknown'} (${o.raceName || 'Custom'}) — due ${formatDate(o.dueDate)}`).join('\n')}`
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

// --- daily-design-update (Vercel cron, every morning) ---
// Posts a daily standup to #design organized into two sections — custom
// orders (with overdue + due-this-week breakouts) and standard orders.
// Uses the human-readable Shopify display number (e.g. "2585") rather
// than the internal parentOrderNumber (e.g. "7161307431195").
async function handleDailyDesignUpdate(res) {
  try {
    // Custom orders that still need design work. Restricted to the two
    // statuses where Dan is the one holding the ball — once a proof has
    // been sent to the customer or further, the standup doesn't need to
    // surface it anymore.
    const customOrders = await prisma.order.findMany({
      where: {
        trackstarOrderType: 'custom',
        designStatus: { in: ['not_started', 'in_progress'] },
      },
      select: {
        dueDate: true,
        designStatus: true,
        runnerName: true,
        orderNumber: true,
        parentOrderNumber: true,
        raceName: true,
        shopifyOrderData: true,  // for the display number
      }
    })

    // Standard orders still in flight (not completed)
    const standardCount = await prisma.order.count({
      where: {
        trackstarOrderType: 'standard',
        status: { in: ['pending', 'ready', 'flagged', 'missing_year'] },
      }
    })

    const now = new Date()
    const endOfWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    // Pull the Shopify display number ("#2585" → "2585") with fallbacks.
    const displayNum = (o) => {
      const name = o.shopifyOrderData?.name
      if (typeof name === 'string') return name.replace(/^#/, '')
      return o.parentOrderNumber || o.orderNumber || '?'
    }

    const overdue = []
    const dueNext7Days = []
    for (const o of customOrders) {
      if (!o.dueDate) continue
      const due = new Date(o.dueDate)
      if (due < now) overdue.push({ ...o, due })
      else if (due <= endOfWeek) dueNext7Days.push({ ...o, due })
    }
    overdue.sort((a, b) => a.due - b.due)
    dueNext7Days.sort((a, b) => a.due - b.due)

    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
    const orderLine = (o) => `• #${displayNum(o)} — ${o.runnerName || 'Unknown'} (${o.raceName || 'Custom'}) — due ${fmt(o.due)}`

    const appUrl = process.env.APP_BASE_URL || ''
    const dashboardFooter = appUrl
      ? `\n\nDashboard → <${appUrl}/|Standard>  ·  <${appUrl}/?type=custom|Custom>`
      : ''

    // Standard above Custom — Eli's section gets eyes first, then Dan's.
    const standardSection = [
      `*📦 STANDARD ORDERS*`,
      `*${standardCount}* to fulfill`,
    ].join('\n')

    const customSection = [
      `*🎨 CUSTOM ORDERS*`,
      `*${customOrders.length}* in the queue${overdue.length > 0 ? ` · *${overdue.length} overdue*` : ''}${dueNext7Days.length > 0 ? ` · ${dueNext7Days.length} due in the next 7 days` : ''}`,
      overdue.length > 0 ? `\n:rotating_light: *Overdue (${overdue.length}):*\n${overdue.map(orderLine).join('\n')}` : '',
      dueNext7Days.length > 0 ? `\n:date: *Due in the next 7 days (${dueNext7Days.length}):*\n${dueNext7Days.map(orderLine).join('\n')}` : '',
    ].filter(Boolean).join('\n')

    const message = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '☀️ Daily Design Standup' }
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: standardSection }
        },
        { type: 'divider' },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: customSection }
        },
        ...(dashboardFooter ? [{
          type: 'section',
          text: { type: 'mrkdwn', text: dashboardFooter }
        }] : []),
      ]
    }

    const webhookUrl = process.env.SLACK_DESIGN_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL
    if (!webhookUrl) {
      console.warn('[actions/daily-design-update] No webhook URL configured — skipping post')
      return res.status(200).json({ success: false, error: 'no webhook configured' })
    }

    const slackResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })
    if (!slackResponse.ok) throw new Error(`Slack post failed: ${slackResponse.status}`)

    console.log(`[actions/daily-design-update] Posted standup: ${customOrders.length} custom (${overdue.length} overdue, ${dueNext7Days.length} due next 7 days), ${standardCount} standard`)
    return res.status(200).json({
      success: true,
      customTotal: customOrders.length,
      standardTotal: standardCount,
      overdue: overdue.length,
      dueNext7Days: dueNext7Days.length,
    })
  } catch (error) {
    console.error('[actions/daily-design-update] Error:', error)
    return res.status(500).json({ error: error.message })
  }
}

// --- test-connections ---
// Granular, step-by-step diagnostics for Artelo + Shopify + Etsy. Each provider
// runs a sequence of steps and we report exactly which one passed/failed and
// why — so when something breaks, the user can see which credential or call is
// the actual culprit instead of getting a generic "Etsy: error" message.
async function handleTestConnections(res) {
  const results = {
    timestamp: new Date().toISOString(),
    providers: {
      artelo: { status: 'pending', steps: [] },
      shopify: { status: 'pending', steps: [] },
      etsy: { status: 'pending', steps: [] },
    }
  }

  // Helper that times a step and records it on the provider
  const runStep = async (provider, name, fn) => {
    const start = Date.now()
    try {
      const result = await fn()
      const latency = Date.now() - start
      const step = {
        name,
        status: result?.status || 'ok',
        message: result?.message || 'ok',
        detail: result?.detail || null,
        latency: `${latency}ms`
      }
      results.providers[provider].steps.push(step)
      return step.status !== 'error'
    } catch (err) {
      results.providers[provider].steps.push({
        name,
        status: 'error',
        message: err.message || 'Unknown error',
        detail: err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : null,
        latency: `${Date.now() - start}ms`
      })
      return false
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // ARTELO — fetch a small page of orders
  // ─────────────────────────────────────────────────────────────────
  await runStep('artelo', 'API key configured', async () => {
    if (!process.env.ARTELO_API_KEY) {
      return { status: 'error', message: 'ARTELO_API_KEY env var is missing' }
    }
    return { status: 'ok', message: `Key present (${process.env.ARTELO_API_KEY.length} chars)` }
  })

  let arteloOrdersCount = 0
  await runStep('artelo', 'GET /api/open/orders/get', async () => {
    if (!process.env.ARTELO_API_KEY) return { status: 'error', message: 'Skipped (no key)' }
    const params = new URLSearchParams({ limit: '5', allOrders: 'true' })
    const resp = await fetch(`https://www.artelo.io/api/open/orders/get?${params}`, {
      headers: { 'Authorization': `Bearer ${process.env.ARTELO_API_KEY}`, 'Content-Type': 'application/json' }
    })
    if (!resp.ok) {
      const body = await resp.text()
      return { status: 'error', message: `HTTP ${resp.status}`, detail: body.slice(0, 300) }
    }
    const data = await resp.json()
    arteloOrdersCount = Array.isArray(data) ? data.length : (data.orders?.length || 0)
    return { status: 'ok', message: `HTTP 200 — ${arteloOrdersCount} order(s) in sample` }
  })

  await runStep('artelo', 'Response shape valid', async () => {
    if (arteloOrdersCount === 0) {
      return { status: 'warn', message: 'API returned 0 orders — could be empty store, but worth verifying' }
    }
    return { status: 'ok', message: `Got ${arteloOrdersCount} order(s) with the expected JSON shape` }
  })

  // ─────────────────────────────────────────────────────────────────
  // SHOPIFY — OAuth + shop + orders
  // ─────────────────────────────────────────────────────────────────
  await runStep('shopify', 'Env vars present', async () => {
    const missing = []
    if (!process.env.SHOPIFY_STORE) missing.push('SHOPIFY_STORE')
    if (!process.env.SHOPIFY_CLIENT_ID) missing.push('SHOPIFY_CLIENT_ID')
    if (!process.env.SHOPIFY_CLIENT_SECRET) missing.push('SHOPIFY_CLIENT_SECRET')
    if (missing.length) return { status: 'error', message: `Missing: ${missing.join(', ')}` }
    return { status: 'ok', message: `Store: ${process.env.SHOPIFY_STORE}` }
  })

  let shopifyToken = null
  await runStep('shopify', 'OAuth client_credentials exchange', async () => {
    if (!process.env.SHOPIFY_CLIENT_ID || !process.env.SHOPIFY_CLIENT_SECRET) {
      return { status: 'error', message: 'Skipped (missing credentials)' }
    }
    const resp = await fetch(`https://${process.env.SHOPIFY_STORE}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        grant_type: 'client_credentials'
      })
    })
    if (!resp.ok) {
      const body = await resp.text()
      return { status: 'error', message: `HTTP ${resp.status}`, detail: body.slice(0, 300) }
    }
    const data = await resp.json()
    shopifyToken = data.access_token
    const scopes = data.scope ? data.scope.split(',').join(', ') : 'unknown'
    return { status: 'ok', message: `Token issued. Scopes: ${scopes}` }
  })

  await runStep('shopify', 'GET /shop.json', async () => {
    if (!shopifyToken) return { status: 'error', message: 'Skipped (no access token)' }
    const resp = await fetch(`https://${process.env.SHOPIFY_STORE}/admin/api/2024-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': shopifyToken }
    })
    if (!resp.ok) {
      const body = await resp.text()
      return { status: 'error', message: `HTTP ${resp.status}`, detail: body.slice(0, 300) }
    }
    const data = await resp.json()
    return { status: 'ok', message: `Shop: ${data.shop?.name || '?'} (${data.shop?.email || '?'})` }
  })

  await runStep('shopify', 'GET /orders.json (verify read_orders scope)', async () => {
    if (!shopifyToken) return { status: 'error', message: 'Skipped (no access token)' }
    const resp = await fetch(`https://${process.env.SHOPIFY_STORE}/admin/api/2024-01/orders.json?limit=1&status=any&fields=id,name,created_at`, {
      headers: { 'X-Shopify-Access-Token': shopifyToken }
    })
    if (!resp.ok) {
      const body = await resp.text()
      return { status: 'error', message: `HTTP ${resp.status} (likely scope issue)`, detail: body.slice(0, 300) }
    }
    const data = await resp.json()
    const sample = data.orders?.[0]
    return { status: 'ok', message: sample ? `Latest order: ${sample.name} (${sample.created_at?.slice(0, 10)})` : 'Endpoint reachable, no orders returned' }
  })

  // ─────────────────────────────────────────────────────────────────
  // ETSY — env + token refresh + shop + transactions
  // ─────────────────────────────────────────────────────────────────
  await runStep('etsy', 'Env vars present', async () => {
    const missing = []
    if (!process.env.ETSY_API_KEY) missing.push('ETSY_API_KEY')
    if (!process.env.ETSY_SHARED_SECRET) missing.push('ETSY_SHARED_SECRET')
    if (!process.env.ETSY_SHOP_ID) missing.push('ETSY_SHOP_ID')
    if (missing.length) return { status: 'error', message: `Missing: ${missing.join(', ')}` }
    return { status: 'ok', message: `Shop ID: ${process.env.ETSY_SHOP_ID}` }
  })

  let etsyRefreshTokenRow = null
  await runStep('etsy', 'Refresh token in database', async () => {
    etsyRefreshTokenRow = await prisma.systemConfig.findUnique({ where: { key: 'etsy_refresh_token' } })
    if (!etsyRefreshTokenRow?.value) {
      return { status: 'error', message: 'No refresh token in DB — visit /api/etsy/auth to re-authenticate' }
    }
    return { status: 'ok', message: `Token stored (${etsyRefreshTokenRow.value.length} chars)` }
  })

  let etsyAccessToken = null
  await runStep('etsy', 'Refresh access token', async () => {
    if (!etsyRefreshTokenRow?.value || !process.env.ETSY_API_KEY) {
      return { status: 'error', message: 'Skipped (missing key or refresh token)' }
    }
    const resp = await fetch('https://api.etsy.com/v3/public/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.ETSY_API_KEY,
        refresh_token: etsyRefreshTokenRow.value
      }).toString()
    })
    if (!resp.ok) {
      const body = await resp.text()
      return { status: 'error', message: `Refresh failed (HTTP ${resp.status}) — visit /api/etsy/auth to re-authenticate`, detail: body.slice(0, 300) }
    }
    const data = await resp.json()
    etsyAccessToken = data.access_token
    // Persist rotated refresh token if Etsy issued a new one
    if (data.refresh_token && data.refresh_token !== etsyRefreshTokenRow.value) {
      await prisma.systemConfig.upsert({
        where: { key: 'etsy_refresh_token' },
        update: { value: data.refresh_token },
        create: { key: 'etsy_refresh_token', value: data.refresh_token }
      })
      return { status: 'ok', message: `Access token issued (expires in ${data.expires_in}s). Refresh token rotated and saved.` }
    }
    return { status: 'ok', message: `Access token issued (expires in ${data.expires_in}s)` }
  })

  await runStep('etsy', 'GET /shops/{shopId}', async () => {
    if (!etsyAccessToken) return { status: 'error', message: 'Skipped (no access token)' }
    const resp = await fetch(`https://openapi.etsy.com/v3/application/shops/${process.env.ETSY_SHOP_ID}`, {
      headers: {
        'Authorization': `Bearer ${etsyAccessToken}`,
        'x-api-key': `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}`
      }
    })
    if (!resp.ok) {
      const body = await resp.text()
      return { status: 'error', message: `HTTP ${resp.status}`, detail: body.slice(0, 300) }
    }
    const data = await resp.json()
    return { status: 'ok', message: `Shop: ${data.shop_name || '?'} (${data.title || '?'})` }
  })

  await runStep('etsy', 'GET /shops/{shopId}/receipts (verify transactions_r scope)', async () => {
    if (!etsyAccessToken) return { status: 'error', message: 'Skipped (no access token)' }
    const resp = await fetch(`https://openapi.etsy.com/v3/application/shops/${process.env.ETSY_SHOP_ID}/receipts?limit=1`, {
      headers: {
        'Authorization': `Bearer ${etsyAccessToken}`,
        'x-api-key': `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}`
      }
    })
    if (!resp.ok) {
      const body = await resp.text()
      return { status: 'error', message: `HTTP ${resp.status} (likely scope issue — need transactions_r)`, detail: body.slice(0, 300) }
    }
    const data = await resp.json()
    const sample = data.results?.[0]
    return { status: 'ok', message: sample ? `Latest receipt: #${sample.receipt_id} (${data.count} total)` : `Endpoint reachable, ${data.count || 0} receipts` }
  })

  // ─────────────────────────────────────────────────────────────────
  // Roll up overall status per provider
  // ─────────────────────────────────────────────────────────────────
  for (const provider of Object.keys(results.providers)) {
    const steps = results.providers[provider].steps
    if (steps.some(s => s.status === 'error')) {
      results.providers[provider].status = 'error'
    } else if (steps.some(s => s.status === 'warn')) {
      results.providers[provider].status = 'warn'
    } else {
      results.providers[provider].status = 'ok'
    }
  }

  return res.status(200).json(results)
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

  // 5b. Scrapers (chip-time fixtures) — catches gun-time regressions early
  results.checks.scrapers = await (async () => {
    const start = Date.now()
    try {
      const [{ CHIP_TIME_FIXTURES }, { getScraperForRace }] = await Promise.all([
        import('../../server/scrapers/__tests__/chip-time-fixtures.js'),
        import('../../server/scrapers/index.js')
      ])
      const norm = (t) => (t || '').toString().replace(/^0+/, '').replace(/^:/, '').trim()
      const failures = []
      for (const fx of CHIP_TIME_FIXTURES) {
        try {
          const scraper = getScraperForRace(fx.race, fx.year)
          const r = await scraper.searchRunner(fx.runner)
          if (!r.found) { failures.push(`${fx.race} ${fx.year}: not found`); continue }
          if (norm(r.officialTime) !== norm(fx.expectedChipTime)) {
            failures.push(`${fx.race} ${fx.year}: got ${r.officialTime} expected ${fx.expectedChipTime}`)
          }
        } catch (err) {
          failures.push(`${fx.race} ${fx.year}: ${err.message}`)
        }
      }
      const latency = `${Date.now() - start}ms`
      if (failures.length === 0) {
        return { status: 'ok', latency, detail: `All ${CHIP_TIME_FIXTURES.length} chip-time fixtures pass` }
      }
      return { status: 'error', latency, detail: `${failures.length} fixture(s) failing: ${failures.slice(0, 3).join('; ')}` }
    } catch (err) {
      return { status: 'error', detail: `Failed to load fixtures: ${err.message}` }
    }
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

// Internal-only sample COGS by size + frame. Do not surface to creators.
// Source: 2026 vendor pricing from Matt.
const SAMPLE_COST_USD = {
  '8x10':  { unframed: 10.40, framed: 31.94 },
  '12x18': { unframed: 13.42, framed: 44.81 },
}
function sampleCostUsd(size, frame) {
  const sizeRow = SAMPLE_COST_USD[size]
  if (!sizeRow) return 0
  const isFramed = frame && frame !== 'Unframed'
  return isFramed ? sizeRow.framed : sizeRow.unframed
}

async function handleCreatorHomeMetrics(res) {
  // Run aggregations in parallel
  const [
    activeCount,
    invitedCount,
    appliedCount,
    pausedCount,
    sampleOrders,
    thisMonthApplications,
  ] = await Promise.all([
    prisma.creator.count({ where: { status: 'active' } }),
    // Exclude unfinished public applications (blank rows) from the invited count
    // so they don't inflate the "total in program" rollup.
    prisma.creator.count({ where: { status: 'invited', NOT: { source: 'public_apply', onboardedAt: null } } }),
    prisma.creator.count({ where: { status: 'applied' } }),
    prisma.creator.count({ where: { status: 'paused' } }),
    prisma.order.findMany({
      where: { source: 'creator_sample' },
      select: { id: true, status: true, productSize: true, frameType: true }
    }),
    prisma.creator.count({
      where: {
        // onboardedAt column name preserved — it stamps when the wizard
        // is submitted, which under the new naming is the "applied" moment.
        onboardedAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        }
      }
    }),
  ])

  const samplesShipped = sampleOrders.filter(o => o.status === 'completed').length
  const samplesPending = sampleOrders.length - samplesShipped
  const samplesCostEstimatedUsd = sampleOrders.reduce(
    (sum, o) => sum + sampleCostUsd(o.productSize, o.frameType),
    0
  )

  return res.status(200).json({
    creators: {
      total: activeCount + invitedCount + appliedCount + pausedCount,
      active: activeCount,
      invited: invitedCount,
      applied: appliedCount,
      paused: pausedCount,
      appliedThisMonth: thisMonthApplications,
    },
    samples: {
      total: sampleOrders.length,
      shipped: samplesShipped,
      pending: samplesPending,
      costEstimatedUsd: samplesCostEstimatedUsd,
      costIsPlaceholder: false,
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
    // Hide abandoned public applications — someone clicked "Apply" on the public
    // landing page but never submitted the wizard. They're blank rows (no name,
    // never onboarded) and only clutter the table. Once they submit, onboardedAt
    // is set and they reappear in the Applied queue.
    where: {
      NOT: { source: 'public_apply', onboardedAt: null },
    },
    orderBy: { invitedAt: 'desc' },
    include: {
      sampleOrder: {
        select: {
          id: true, orderNumber: true, status: true, createdAt: true,
          trackingNumber: true, trackingCarrier: true, shippedAt: true,
        }
      },
      briefAssignments: {
        include: { brief: { select: { id: true, title: true, status: true } } }
      }
    }
  })
  // Attach internal-only sample cost per creator. Drives the COGS rollup
  // in the admin drawer; never surfaced in the creator-facing portal.
  const enriched = creators.map(c => ({
    ...c,
    sampleCostUsd: sampleCostUsd(c.productSize, c.frameType),
  }))
  return res.status(200).json({ creators: enriched })
}

// --- update-creator ---
// Updates editable fields on a creator. Only allow-listed fields can be
// changed through this endpoint — protects against accidental overwrite of
// inviteToken, onboardedAt, sampleOrderId, etc.
const CREATOR_EDITABLE_FIELDS = [
  // Profile
  'name', 'email', 'instagramHandle', 'tiktokHandle',
  // Application questions — editable post-application so Matt can fix typos
  'bestContentLinks', 'whyWorkWithUs',
  // Sample details — editable after onboarding in case the creator emails
  // a correction (different race, size, bib, etc.)
  'raceName', 'raceYear', 'bibNumber', 'finishTime',
  'productSize', 'frameType',
  // Shipping — these get re-mirrored onto the linked fulfillment Order below
  // so the dashboard reflects the corrected address.
  'shippingName', 'shippingAddress1', 'shippingAddress2',
  'shippingCity', 'shippingState', 'shippingZip', 'shippingCountry',
  // Commissions / whitelisting / lifecycle
  'commissionModel', 'commissionConfig', 'commissionNotes',
  'whitelistingEnabled', 'metaPageId',
  'status', 'contentStatus',
  // Free-form admin notes
  'notes',
]

// Shipping-field subset — used to detect when we also need to mirror the
// change onto the linked fulfillment Order so Elí ships to the right place.
const CREATOR_SHIPPING_FIELDS = [
  'shippingName', 'shippingAddress1', 'shippingAddress2',
  'shippingCity', 'shippingState', 'shippingZip', 'shippingCountry',
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

  // Coerce raceYear to an int if present — frontend may send it as string.
  if (data.raceYear != null && data.raceYear !== '') {
    data.raceYear = parseInt(data.raceYear, 10) || null
  } else if (data.raceYear === '') {
    data.raceYear = null
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'no editable fields provided' })
  }

  const updated = await prisma.creator.update({
    where: { id: creatorId },
    data,
    include: {
      sampleOrder: {
        select: {
          id: true, orderNumber: true, status: true, createdAt: true,
          trackingNumber: true, trackingCarrier: true, shippedAt: true,
        }
      },
      briefAssignments: {
        include: { brief: { select: { id: true, title: true, status: true } } }
      }
    }
  })

  // If shipping changed AND there's a linked fulfillment Order, re-mirror the
  // address into arteloOrderData.shipping so the Dashboard's creator banner
  // and Elí's queue both reflect the corrected destination.
  const shippingTouched = CREATOR_SHIPPING_FIELDS.some(k => k in updates)
  if (shippingTouched && updated.sampleOrderId) {
    const existing = await prisma.order.findUnique({
      where: { id: updated.sampleOrderId },
      select: { arteloOrderData: true }
    })
    const nextArtelo = {
      ...(existing?.arteloOrderData || {}),
      shipping: {
        name: updated.shippingName || updated.name || null,
        address1: updated.shippingAddress1 || null,
        address2: updated.shippingAddress2 || null,
        city: updated.shippingCity || null,
        state: updated.shippingState || null,
        zip: updated.shippingZip || null,
        country: updated.shippingCountry || 'US',
      },
    }
    await prisma.order.update({
      where: { id: updated.sampleOrderId },
      data: { arteloOrderData: nextArtelo },
    })
    console.log(`[actions/update-creator] Mirrored shipping → order ${updated.sampleOrderId}`)
  }

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
  'targetLength', 'hooks', 'emotion', 'fomo', 'persona',
  'examplesNotes', 'status',
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
    source: 'admin_invite',
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

// --- create-public-invite (PUBLIC) ---
// Hit by the public /apply landing page. Mints a fresh Creator row and
// returns the inviteToken so the client can redirect into the onboarding
// wizard at /creator/<token>. Auto-assigns every currently-active brief so
// the creator sees content directives during onboarding — no admin step
// required between Apply Now and onboarding.
async function handleCreatePublicInvite(_body, res) {
  const created = await prisma.creator.create({
    data: {
      inviteToken: makeInviteToken(),
      status: 'invited',
      source: 'public_apply',
    }
  })

  const activeBriefs = await prisma.brief.findMany({
    where: { status: 'active' },
    select: { id: true }
  })
  if (activeBriefs.length > 0) {
    await prisma.briefAssignment.createMany({
      data: activeBriefs.map(b => ({ creatorId: created.id, briefId: b.id })),
      skipDuplicates: true,
    })
  }

  console.log(`[actions/create-public-invite] Public apply → creator ${created.id} (token ${created.inviteToken})`)
  // Don't leak the whole row — just the token the client needs to redirect.
  return res.status(201).json({ success: true, inviteToken: created.inviteToken })
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
        select: {
          id: true, orderNumber: true, status: true, createdAt: true,
          trackingNumber: true, trackingCarrier: true, shippedAt: true,
        }
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

  // Race options for the onboarding dropdown. Sorted newest first so recent
  // races appear at the top. Only expose the minimum fields the portal needs.
  const races = await prisma.race.findMany({
    orderBy: [{ year: 'desc' }, { raceName: 'asc' }],
    select: { id: true, raceName: true, year: true },
  })

  // Don't leak admin-only fields (commission, notes, etc.) to the creator.
  return res.status(200).json({
    creator: {
      id: creator.id,
      name: creator.name,
      email: creator.email,
      instagramHandle: creator.instagramHandle,
      tiktokHandle: creator.tiktokHandle,
      bestContentLinks: creator.bestContentLinks,
      whyWorkWithUs: creator.whyWorkWithUs,
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
    races,
  })
}

// --- creator-onboard (PUBLIC) ---
// Token-gated. Creator submits the application wizard — we save everything
// to their Creator row and flip status → 'applied'.
// Sample-order creation lands in the next commit (Elí's queue integration).
const CREATOR_ONBOARD_FIELDS = [
  'name', 'email', 'instagramHandle', 'tiktokHandle',
  'bestContentLinks', 'whyWorkWithUs',
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

  // Flip status + stamp onboardedAt on first-pass application submit.
  // Re-submits from an already-applied creator just update their profile
  // fields — we don't reset onboardedAt (and don't re-create the sample
  // order). The `onboardedAt` column name is preserved to avoid churning
  // the schema; semantically it now records the time the application was
  // submitted ("applied at").
  const isFirstOnboard = !creator.onboardedAt
  if (isFirstOnboard) {
    updates.onboardedAt = new Date()
    updates.status = 'applied'
  }

  const updated = await prisma.creator.update({
    where: { id: creator.id },
    data: updates,
  })

  // Onboarding no longer auto-creates the Order. The submission sits as a
  // Sample Request on Matt's dashboard and only becomes a fulfillment order
  // once he approves via `approve-creator-sample`.
  console.log(`[actions/creator-onboard] ${creator.id} onboarded (or updated): ${Object.keys(updates).join(', ')}`)

  // First-time onboard → ping Matt that there's a new sample request waiting
  // for his approval. Best-effort; failures don't block the response.
  if (isFirstOnboard) {
    await pingSampleRequested(updated)
  }

  return res.status(200).json({ success: true, creator: { id: updated.id, status: updated.status } })
}

// --- Slack helpers ---
// Best-effort POST. Webhook URLs are pre-bound to a destination channel/DM,
// so the caller picks the audience by env var, not by message content.
async function postSlack(webhookUrl, text) {
  if (!webhookUrl) return
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch (err) {
    console.error('[slack] webhook post failed:', err.message)
  }
}

// Sent to #trackstar-creators when a creator finishes onboarding. Matt sees
// this (he's mentioned by user ID) and reviews the request on /creators.
// Falls back to the general team webhook if the creators-specific one isn't
// set so we don't lose the ping during transition.
async function pingSampleRequested(creator) {
  const webhookUrl = process.env.SLACK_CREATORS_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) return
  const mention = process.env.SLACK_USER_ID_MATT ? `<@${process.env.SLACK_USER_ID_MATT}> ` : ''
  const appUrl = process.env.APP_BASE_URL || ''
  const reviewLink = appUrl ? `\n\nReview & approve → ${appUrl}/creators` : ''
  const lines = [
    `${mention}🎬 *New Creator Sample Request*`,
    `Creator: *${creator.name || '(unnamed)'}*${creator.instagramHandle ? ` · ${creator.instagramHandle}` : ''}`,
    `Race: ${creator.raceName || 'Unknown'}${creator.raceYear ? ` ${creator.raceYear}` : ''}`,
    `Print: ${creator.productSize || '—'} · ${creator.frameType || '—'}`,
    `Ships to: ${[creator.shippingCity, creator.shippingState].filter(Boolean).join(', ') || 'address on file'}`,
    reviewLink,
  ].filter(Boolean)
  await postSlack(webhookUrl, lines.join('\n'))
}

// DM'd to Elí (via SLACK_ELI_DM_WEBHOOK_URL) once Matt clicks Approve. We
// inline everything he needs to manually mirror this into Artelo: full
// shipping address, race, print spec, runner details, contact info — so he
// doesn't have to log into the dashboard to fulfill.
async function pingSampleApprovedToEli(creator, order) {
  const webhookUrl = process.env.SLACK_ELI_DM_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) return

  const fullAddress = [
    creator.shippingName || creator.name,
    creator.shippingAddress1,
    creator.shippingAddress2,
    [creator.shippingCity, creator.shippingState, creator.shippingZip].filter(Boolean).join(', '),
    creator.shippingCountry || 'US',
  ].filter(Boolean).join('\n')

  const runnerDetails = [
    creator.bibNumber ? `Bib #${creator.bibNumber}` : null,
    creator.finishTime ? `Time: ${creator.finishTime}` : null,
  ].filter(Boolean).join(' · ')

  const lines = [
    `🎁 *New Creator Sample to Build* — ${order.orderNumber}`,
    `Please create this order manually in Artelo.`,
    ``,
    `*Creator:* ${creator.name || '(unnamed)'}${creator.instagramHandle ? ` · ${creator.instagramHandle}` : ''}`,
    creator.email ? `*Email:* ${creator.email}` : null,
    ``,
    `*Race:* ${creator.raceName || 'Unknown'}${creator.raceYear ? ` ${creator.raceYear}` : ''}`,
    runnerDetails ? `*Runner:* ${runnerDetails}` : null,
    `*Print:* ${creator.productSize || '—'} · ${creator.frameType || '—'}`,
    ``,
    `*Ship to:*`,
    '```',
    fullAddress || '(no address on file)',
    '```',
  ].filter(Boolean)
  await postSlack(webhookUrl, lines.join('\n'))
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

// --- approve-creator-sample ---
// Admin clicks "Approve" on a Sample Request in the /creators dashboard.
// We create the fulfillment Order, flip the Creator to active, and ping
// the team Slack so Elí knows there's a new creator sample to produce.
async function handleApproveCreatorSample({ creatorId }, res) {
  if (!creatorId) return res.status(400).json({ error: 'creatorId is required' })

  const creator = await prisma.creator.findUnique({ where: { id: creatorId } })
  if (!creator) return res.status(404).json({ error: 'Creator not found' })
  if (!creator.onboardedAt) return res.status(400).json({ error: 'Creator has not onboarded yet' })
  if (creator.sampleOrderId) return res.status(400).json({ error: 'Sample already approved for this creator' })

  const order = await createCreatorSampleOrder(creator)
  await prisma.creator.update({
    where: { id: creatorId },
    data: { status: 'active' }
  })

  // Slack — DM Elí with everything he needs to manually build the order in
  // Artelo. We send the full address and contact details inline so he doesn't
  // have to context-switch into the dashboard. Best-effort; non-blocking.
  await pingSampleApprovedToEli(creator, order)

  console.log(`[actions/approve-creator-sample] Approved ${creatorId} → order ${order.orderNumber}`)
  return res.status(200).json({ success: true, orderNumber: order.orderNumber })
}

// --- decline-creator-sample ---
// Admin clicks "Decline" on a Sample Request. Marks the creator 'denied' — they
// drop out of the admin table but stay in the DB so they can be un-denied later.
async function handleDeclineCreatorSample({ creatorId }, res) {
  if (!creatorId) return res.status(400).json({ error: 'creatorId is required' })

  const creator = await prisma.creator.findUnique({ where: { id: creatorId } })
  if (!creator) return res.status(404).json({ error: 'Creator not found' })
  if (creator.sampleOrderId) return res.status(400).json({ error: 'Sample already approved — cannot decline' })

  await prisma.creator.update({
    where: { id: creatorId },
    data: { status: 'denied' }
  })

  console.log(`[actions/decline-creator-sample] Declined sample for ${creatorId} (${creator.name || 'unnamed'})`)
  return res.status(200).json({ success: true })
}

// --- set-creator-sample-tracking ---
// Admin pastes a tracking # in the creator drawer. Setting it = "shipped"
// in the creator portal (no separate status flip). Empty string clears it.
async function handleSetCreatorSampleTracking({ creatorId, trackingNumber, trackingCarrier }, res) {
  if (!creatorId) return res.status(400).json({ error: 'creatorId is required' })

  const creator = await prisma.creator.findUnique({
    where: { id: creatorId },
    select: { sampleOrderId: true }
  })
  if (!creator) return res.status(404).json({ error: 'Creator not found' })
  if (!creator.sampleOrderId) return res.status(400).json({ error: 'No sample order yet — approve first' })

  const trimmed = (trackingNumber || '').trim()
  const carrier = (trackingCarrier || '').trim()

  const order = await prisma.order.update({
    where: { id: creator.sampleOrderId },
    data: {
      trackingNumber: trimmed || null,
      trackingCarrier: carrier || null,
      shippedAt: trimmed ? new Date() : null,
    },
    select: { orderNumber: true, trackingNumber: true, trackingCarrier: true, shippedAt: true }
  })

  console.log(`[actions/set-creator-sample-tracking] ${creatorId} → ${trimmed || '(cleared)'}`)
  return res.status(200).json({ success: true, order })
}

// --- set-race-shorthand ---
// Admin sets/clears the filename shorthand for a given race name. Stored as
// a JSON map in SystemConfig (key: race_shorthand_overrides). Empty string
// or null removes the override and falls back to scraper-config default.
async function handleSetRaceShorthand({ raceName, shorthand }, res) {
  if (!raceName || typeof raceName !== 'string') {
    return res.status(400).json({ error: 'raceName is required' })
  }

  const existing = await prisma.systemConfig.findUnique({
    where: { key: 'race_shorthand_overrides' }
  })

  let overrides = {}
  try {
    overrides = existing?.value ? JSON.parse(existing.value) : {}
  } catch { overrides = {} }

  const trimmed = (shorthand || '').trim()
  if (trimmed) {
    overrides[raceName] = trimmed
  } else {
    delete overrides[raceName]
  }

  const payload = JSON.stringify(overrides)
  if (existing) {
    await prisma.systemConfig.update({
      where: { key: 'race_shorthand_overrides' },
      data: { value: payload }
    })
  } else {
    await prisma.systemConfig.create({
      data: { key: 'race_shorthand_overrides', value: payload }
    })
  }

  console.log(`[actions/set-race-shorthand] ${raceName} → ${trimmed || '(cleared)'}`)
  return res.status(200).json({ success: true, overrides })
}

// --- merge-race ---
// Consolidates a variant raceName under a canonical one. Three-part operation:
//   1. Persist the alias in SystemConfig so future imports normalize.
//   2. Rewrite all Order.raceName rows from variant -> canonical.
//   3. Reconcile Race rows by year (merge or rename).
// Safe to re-run — idempotent if the alias is already in place.
async function handleMergeRace({ aliasName, canonicalName }, res) {
  const variant = (aliasName || '').trim()
  const canonical = (canonicalName || '').trim()
  if (!variant || !canonical) {
    return res.status(400).json({ error: 'aliasName and canonicalName are required' })
  }
  if (variant === canonical) {
    return res.status(400).json({ error: 'aliasName and canonicalName must differ' })
  }

  // --- 1) Persist alias map ---
  const existing = await prisma.systemConfig.findUnique({
    where: { key: 'race_name_aliases' }
  })
  let aliases = {}
  try {
    aliases = existing?.value ? JSON.parse(existing.value) : {}
  } catch { aliases = {} }
  aliases[variant] = canonical
  // If canonical was itself an alias of something else, that's wrong — bail.
  if (aliases[canonical] && aliases[canonical] !== canonical) {
    return res.status(400).json({ error: `Target "${canonical}" is itself aliased to "${aliases[canonical]}". Merge into that instead.` })
  }

  const payload = JSON.stringify(aliases)
  if (existing) {
    await prisma.systemConfig.update({
      where: { key: 'race_name_aliases' },
      data: { value: payload }
    })
  } else {
    await prisma.systemConfig.create({
      data: { key: 'race_name_aliases', value: payload }
    })
  }

  // --- 2) Backfill Order rows ---
  const orderResult = await prisma.order.updateMany({
    where: { raceName: variant },
    data: { raceName: canonical },
  })

  // --- 3) Reconcile Race rows by year. RunnerResearch.raceId is a hard FK,
  //        so we must reparent before deleting variant Race rows. ---
  const variantRaces = await prisma.race.findMany({ where: { raceName: variant } })
  let renamed = 0
  let merged = 0
  for (const aliasRace of variantRaces) {
    const target = await prisma.race.findFirst({
      where: { raceName: canonical, year: aliasRace.year }
    })
    if (!target) {
      // No collision — just rename in place.
      await prisma.race.update({
        where: { id: aliasRace.id },
        data: { raceName: canonical }
      })
      renamed++
    } else {
      // Collision — merge fields into the canonical row (only fill nulls,
      // never overwrite existing canonical data), reparent research, drop alias.
      const mergeData = {}
      if (!target.raceDate && aliasRace.raceDate) mergeData.raceDate = aliasRace.raceDate
      if (!target.location && aliasRace.location) mergeData.location = aliasRace.location
      if (!target.resultsUrl && aliasRace.resultsUrl) mergeData.resultsUrl = aliasRace.resultsUrl
      if (!target.resultsSiteType && aliasRace.resultsSiteType) mergeData.resultsSiteType = aliasRace.resultsSiteType
      if (!target.weatherCondition && aliasRace.weatherCondition) mergeData.weatherCondition = aliasRace.weatherCondition
      if (!target.weatherTemp && aliasRace.weatherTemp) mergeData.weatherTemp = aliasRace.weatherTemp
      if (!target.weatherFetchedAt && aliasRace.weatherFetchedAt) mergeData.weatherFetchedAt = aliasRace.weatherFetchedAt
      if (Object.keys(mergeData).length > 0) {
        await prisma.race.update({ where: { id: target.id }, data: mergeData })
      }
      await prisma.runnerResearch.updateMany({
        where: { raceId: aliasRace.id },
        data: { raceId: target.id },
      })
      await prisma.race.delete({ where: { id: aliasRace.id } })
      merged++
    }
  }

  console.log(`[actions/merge-race] "${variant}" → "${canonical}"  orders=${orderResult.count}  races=${renamed} renamed, ${merged} merged`)
  return res.status(200).json({
    success: true,
    ordersUpdated: orderResult.count,
    racesRenamed: renamed,
    racesMerged: merged,
    aliases,
  })
}


// --- delete-creator ---
// Removes a creator. BriefAssignment rows cascade away with them. If they
// have a linked sample Order that hasn't shipped yet (no tracking number, not
// completed), we delete that too so it stops cluttering Elí's queue. If the
// order is already shipped or completed, we keep it for fulfillment history
// — only the creator's back-pointer goes.
async function handleDeleteCreator({ creatorId }, res) {
  if (!creatorId) return res.status(400).json({ error: 'creatorId is required' })

  const creator = await prisma.creator.findUnique({
    where: { id: creatorId },
    include: {
      sampleOrder: {
        select: { id: true, orderNumber: true, status: true, trackingNumber: true, shippedAt: true }
      }
    }
  })
  if (!creator) return res.status(404).json({ error: 'Creator not found' })

  const sampleOrder = creator.sampleOrder
  const isShipped = !!(sampleOrder?.trackingNumber || sampleOrder?.shippedAt)
  const isCompleted = sampleOrder?.status === 'completed'
  const shouldDeleteOrder = sampleOrder && !isShipped && !isCompleted

  // Order is deleted first so the Creator's FK doesn't block deletion. The
  // Order's cascades (comments, proofs, research) handle their own cleanup.
  if (shouldDeleteOrder) {
    // Detach the back-pointer before deleting the Order to avoid the FK conflict.
    await prisma.creator.update({
      where: { id: creatorId },
      data: { sampleOrderId: null }
    })
    await prisma.order.delete({ where: { id: sampleOrder.id } })
  }

  await prisma.creator.delete({ where: { id: creatorId } })

  console.log(`[actions/delete-creator] Deleted ${creatorId} (${creator.name || 'unnamed'})${shouldDeleteOrder ? ` + order ${sampleOrder.orderNumber}` : ''}`)
  return res.status(200).json({
    success: true,
    deletedOrderNumber: shouldDeleteOrder ? sampleOrder.orderNumber : null,
    orderKept: sampleOrder && !shouldDeleteOrder ? sampleOrder.orderNumber : null,
  })
}

// --- shopify-products ---
// Fetch all Shopify products for populating the product catalog
async function handleShopifyProducts(res) {
  console.log('[actions/shopify-products] Fetching all products...')

  const products = []
  let pageNum = 1

  // Fetch all products (Shopify paginates at 250)
  while (true) {
    const params = new URLSearchParams({ limit: '250' })
    const response = await shopifyFetch(`/products.json?${params}`)
    products.push(...response.products)

    console.log(`[actions/shopify-products] Page ${pageNum}: ${response.products.length} products (total: ${products.length})`)

    if (response.products.length < 250) break
    pageNum++
    break // safety: only one page for now
  }

  // Format for easy catalog entry creation
  const catalogEntries = products.map(p => ({
    productId: String(p.id),
    title: p.title,
    heroImageUrl: p.images?.[0]?.src || null,
    slug: slugify(p.title),
  }))

  // Output ready-to-paste JS
  const catalogJS = products.map(p => {
    const heroImage = p.images?.[0]?.src || null
    return `  // ${p.title}
  '${p.id}': {
    designVariant: '${slugify(p.title)}',
    label: '${p.title.replace(/'/g, "\\'")}',
    heroImageUrl: ${heroImage ? `'${heroImage}'` : 'null'},
  },`
  }).join('\n\n')

  console.log(`[actions/shopify-products] Returning ${products.length} products`)

  return res.status(200).json({
    count: products.length,
    products: catalogEntries,
    catalogJS,
  })
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// --- weekly-ads-debrief (Vercel cron — Fridays at 4pm ET) ---
// Pulls last 7 days of Meta Ads + Shopify sales + the financial tracker,
// fetches the Ad Ops Playbook from Notion, runs analysis through Claude,
// posts the report to #trackstar-ads.
async function handleWeeklyAdsDebrief(res, { isCron, dryRun }) {
  try {
    // Cron fires twice per Friday (20:00 + 21:00 UTC) to cover DST. Only
    // run when it's actually 4pm in New York. Manual triggers (isCron=false)
    // bypass this guard so Matt can test any time.
    if (isCron && !isFridayFourPmEastern()) {
      console.log('[actions/weekly-ads-debrief] Skipping — not 4pm ET right now')
      return res.status(200).json({ skipped: true, reason: 'not_4pm_eastern' })
    }

    const result = await runWeeklyAdsDebrief({ dryRun: !!dryRun })
    return res.status(200).json({ success: true, ...result })
  } catch (e) {
    console.error('[actions/weekly-ads-debrief] FAILED:', e)
    await alertError('Weekly Ads Debrief', e, {})
    // Also try to ping the debrief channel so Matt knows it failed
    const webhook = process.env.SLACK_ADS_DEBRIEF_WEBHOOK_URL
    if (webhook) {
      fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `⚠️ *Weekly ads debrief failed*: ${e.message}` })
      }).catch(() => {})
    }
    return res.status(500).json({ error: e.message })
  }
}
