/**
 * Weekly Ads Debrief — orchestration.
 *
 * Fires every Friday at 4pm ET. Pulls last-7-days data from:
 *   - Google Sheet (financial tracker) — Daily Scoreboard + The Levers
 *   - Meta Ads API — account totals + ad-level breakdown
 *   - Shopify Admin API — sales by product (via ShopifyQL)
 *   - Notion API — Ad Ops Playbook page
 *
 * Sends all four to Claude with the SKILL.md as system prompt, gets back a
 * Slack-formatted weekly debrief, posts to #trackstar-ads.
 *
 * Phase 1 scope (this commit):
 *   - All data pulls
 *   - Claude API call
 *   - Slack post (with truncation if >40k chars)
 *   - Cost logging
 *
 * Phase 2 (next iteration):
 *   - Persist a weekly history row to Postgres for WoW trending
 *   - Update Notion playbook with current actual financial metrics
 */
import Anthropic from '@anthropic-ai/sdk'

import { readWeekFromTracker, lastNDaysEastern } from './googleSheets.js'
import { pullWeekFromMeta } from './metaAds.js'
import { fetchPlaybookMarkdown } from './notionPlaybook.js'
import { shopifyFetch } from './shopifyAuth.js'
import { WEEKLY_ADS_DEBRIEF_SYSTEM_PROMPT } from '../lib/weeklyAdsDebriefSkill.js'

// Model: Sonnet is the sweet spot for cost/quality on this kind of analysis.
// Bump to Opus if the debriefs start feeling shallow.
const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929'
const CLAUDE_MAX_TOKENS = 4000

// Slack has a 40k char limit per message. Block kit text fields cap at 3000
// chars each. We send the report as a single mrkdwn section, splitting if
// it goes too long.
const SLACK_TEXT_LIMIT = 2900

/**
 * Pull Shopify "sales by product" for a date range via ShopifyQL.
 * Returns one row per product title that had sales.
 */
async function getShopifySalesByProduct(since, until) {
  const store = process.env.SHOPIFY_STORE
  if (!store) throw new Error('SHOPIFY_STORE not set')

  // ShopifyQL via GraphQL Admin API. Matches the pattern from Matt's Apps
  // Script. The 'sales' dataset gives net/gross/discounts/returns per
  // product title.
  const query = `FROM sales SHOW gross_sales, discounts, returns, net_sales, net_items_sold ` +
    `GROUP BY product_title ` +
    `SINCE ${since} UNTIL ${until} ` +
    `ORDER BY net_sales DESC ` +
    `LIMIT 100`

  // Use the dynamic apiVersion approach (we don't have a GraphQL helper yet,
  // so wire it through shopifyFetch with a raw fetch fallback).
  const token = await (await import('./shopifyAuth.js')).getShopifyToken()
  const url = `https://${store}/admin/api/2024-10/graphql.json`
  const graphqlQuery = `{ shopifyqlQuery(query: "${query.replace(/"/g, '\\"')}") { tableData { columns { name dataType } rows } parseErrors } }`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: graphqlQuery }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Shopify GraphQL failed (${res.status}): ${body.slice(0, 200)}`)
  }
  const json = await res.json()
  const qlResult = json.data?.shopifyqlQuery
  if (!qlResult) return []
  if (qlResult.parseErrors && qlResult.parseErrors.length > 0) {
    console.warn('[weeklyAdsDebrief] ShopifyQL parse errors:', qlResult.parseErrors)
    return []
  }
  const rows = qlResult.tableData?.rows || []
  // 2024-10+ returns rows as objects keyed by column name
  return rows.map(r => ({
    product_title: r.product_title || '(no title)',
    gross_sales: parseFloat(r.gross_sales || 0),
    discounts: Math.abs(parseFloat(r.discounts || 0)),
    returns: Math.abs(parseFloat(r.returns || 0)),
    net_sales: parseFloat(r.net_sales || 0),
    net_items_sold: parseInt(r.net_items_sold || 0),
  }))
}

/**
 * Build the user message that goes to Claude. All 4 data sources are
 * stitched together with clear section headers so the model can find what
 * it needs.
 */
function buildUserMessage({ playbook, scoreboard, levers, shopifySales, metaAccount, metaAds, window }) {
  const sections = []

  sections.push(`# Window\n\nDate range (rolling 7 days, ending Thursday):\n  Since: ${window.since}\n  Until: ${window.until}`)

  sections.push(`# Ad Ops Playbook (from Notion)\n\n${playbook || '[playbook unavailable — fall back to defaults]'}`)

  sections.push(`# Financial Tracker — Daily Scoreboard (last 7 days)\n\n${formatRowsForPrompt(scoreboard)}`)
  sections.push(`# Financial Tracker — The Levers (last 7 days)\n\n${formatRowsForPrompt(levers)}`)

  sections.push(`# Shopify — Sales by Product (last 7 days)\n\n${formatShopify(shopifySales)}`)

  sections.push(`# Meta Ads — Account Totals (last 7 days)\n\n${formatMetaAccount(metaAccount)}`)
  sections.push(`# Meta Ads — Ad-level Breakdown (last 7 days)\n\n${formatMetaAds(metaAds)}`)

  return sections.join('\n\n---\n\n')
}

function formatRowsForPrompt({ headers, rows, warning }) {
  if (warning) return `(${warning})`
  if (!rows || rows.length === 0) return '(no rows)'
  // CSV-ish — simple for Claude to parse
  const cols = headers.filter(h => h && h !== '')
  const lines = [cols.join(' | ')]
  for (const row of rows) {
    lines.push(cols.map(c => String(row[c] ?? '').slice(0, 60)).join(' | '))
  }
  return lines.join('\n')
}

function formatShopify(rows) {
  if (!rows || rows.length === 0) return '(no product sales)'
  const lines = ['product_title | net_items | net_sales | discounts | returns']
  for (const r of rows) {
    lines.push(`${r.product_title} | ${r.net_items_sold} | $${r.net_sales.toFixed(2)} | $${r.discounts.toFixed(2)} | $${r.returns.toFixed(2)}`)
  }
  return lines.join('\n')
}

function formatMetaAccount(a) {
  return [
    `Spend: $${a.spend.toFixed(2)}`,
    `Purchases: ${a.purchases} (omni)`,
    `Purchase value: $${a.purchaseValue.toFixed(2)}`,
    `CPA: $${a.cpa.toFixed(2)}`,
    `ROAS: ${a.roas.toFixed(2)}x`,
    `Impressions: ${a.impressions.toLocaleString()}`,
    `Clicks: ${a.clicks.toLocaleString()}`,
    `CPC: $${a.cpc.toFixed(2)}`,
    `CTR: ${a.ctr.toFixed(2)}%`,
    `CPM: $${a.cpm.toFixed(2)}`,
    `Reach: ${a.reach.toLocaleString()}`,
    `Frequency: ${a.frequency.toFixed(2)}`,
    `Add-to-carts: ${a.addToCarts}`,
  ].join('\n')
}

function formatMetaAds(ads) {
  if (!ads || ads.length === 0) return '(no ads with spend)'
  const lines = ['campaign | adset | ad | spend | purchases | cpa | roas | ctr% | cpc | impressions']
  for (const a of ads) {
    lines.push([
      a.campaign, a.adset, a.ad,
      `$${a.spend.toFixed(2)}`,
      a.purchases,
      `$${a.cpa.toFixed(2)}`,
      `${a.roas.toFixed(2)}x`,
      a.ctr.toFixed(2),
      `$${a.cpc.toFixed(2)}`,
      a.impressions.toLocaleString(),
    ].join(' | '))
  }
  return lines.join('\n')
}

/**
 * Post the report to Slack. Splits into multiple messages if the report is
 * longer than Slack's per-block text limit.
 */
async function postToSlack(report, summary) {
  const webhook = process.env.SLACK_ADS_DEBRIEF_WEBHOOK_URL
  if (!webhook) {
    console.warn('[weeklyAdsDebrief] SLACK_ADS_DEBRIEF_WEBHOOK_URL not set — skipping Slack post')
    return { posted: false, reason: 'no webhook' }
  }

  // Slack accepts plain text payloads with mrkdwn enabled by default.
  // Split into chunks if too long.
  const chunks = chunkForSlack(report, SLACK_TEXT_LIMIT)
  const header = `📊 *Weekly Ads Debrief* — ${summary.window.since} → ${summary.window.until}\n_Meta spend: $${summary.totalSpend.toFixed(2)} · Purchases: ${summary.purchases} · Avg CPA: $${summary.avgCpa.toFixed(2)} · Cost to run this debrief: $${summary.costUsd.toFixed(3)}_`

  // First post: header + first chunk
  const first = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `${header}\n\n${chunks[0]}` }),
  })
  if (!first.ok) {
    const body = await first.text()
    throw new Error(`Slack post failed (${first.status}): ${body.slice(0, 200)}`)
  }

  // Subsequent chunks
  for (let i = 1; i < chunks.length; i++) {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: chunks[i] }),
    })
    if (!res.ok) console.warn(`[weeklyAdsDebrief] Slack chunk ${i + 1} failed:`, res.status)
  }

  return { posted: true, chunks: chunks.length }
}

function chunkForSlack(text, limit) {
  if (text.length <= limit) return [text]
  const chunks = []
  const lines = text.split('\n')
  let current = ''
  for (const line of lines) {
    if (current.length + line.length + 1 > limit) {
      chunks.push(current)
      current = line
    } else {
      current = current ? current + '\n' + line : line
    }
  }
  if (current) chunks.push(current)
  return chunks
}

/**
 * Main entry point — runs the full debrief end to end.
 * Returns a summary object describing what happened (and what was posted).
 */
export async function runWeeklyAdsDebrief({ dryRun = false } = {}) {
  const startedAt = Date.now()
  console.log('[weeklyAdsDebrief] Starting run...')

  // Window: last 7 *completed* days. Cron runs Friday afternoon → window
  // is the previous Friday through Thursday (yesterday).
  const dates = lastNDaysEastern(7, { includeToday: false })
  const since = dates[0]
  const until = dates[dates.length - 1]
  console.log(`[weeklyAdsDebrief] Window: ${since} → ${until}`)

  // Pull everything in parallel — these all hit external APIs, no point
  // serializing them.
  const [playbook, sheetData, metaData, shopifySales] = await Promise.all([
    fetchPlaybookMarkdown().catch(e => {
      console.warn('[weeklyAdsDebrief] Playbook fetch failed:', e.message)
      return null
    }),
    readWeekFromTracker(dates).catch(e => {
      console.error('[weeklyAdsDebrief] Sheet read failed:', e.message)
      throw new Error(`Google Sheet read failed: ${e.message}`)
    }),
    pullWeekFromMeta(since, until).catch(e => {
      console.error('[weeklyAdsDebrief] Meta pull failed:', e.message)
      throw new Error(`Meta Ads pull failed: ${e.message}`)
    }),
    getShopifySalesByProduct(since, until).catch(e => {
      console.warn('[weeklyAdsDebrief] Shopify pull failed (non-fatal):', e.message)
      return []
    }),
  ])

  console.log(`[weeklyAdsDebrief] Data pulled: playbook=${playbook ? 'yes' : 'NO'}, scoreboard rows=${sheetData.scoreboard.rows.length}, levers rows=${sheetData.levers.rows.length}, meta ads=${metaData.adLevel.length}, shopify products=${shopifySales.length}`)

  const userMessage = buildUserMessage({
    playbook,
    scoreboard: sheetData.scoreboard,
    levers: sheetData.levers,
    shopifySales,
    metaAccount: metaData.accountTotals,
    metaAds: metaData.adLevel,
    window: { since, until },
  })

  if (dryRun) {
    return {
      dryRun: true,
      window: { since, until },
      userMessageLength: userMessage.length,
      userMessagePreview: userMessage.slice(0, 2000),
      meta: metaData.accountTotals,
      sheetDates: sheetData.scoreboard.rows.map(r => r._rawDate),
    }
  }

  // Call Claude
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  console.log(`[weeklyAdsDebrief] Calling Claude (model=${CLAUDE_MODEL}, user message ${userMessage.length} chars)`)

  const completion = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: CLAUDE_MAX_TOKENS,
    system: WEEKLY_ADS_DEBRIEF_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  const report = completion.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
  const inputTokens = completion.usage?.input_tokens || 0
  const outputTokens = completion.usage?.output_tokens || 0
  // Sonnet 4.5 pricing as of 2026-05: $3/M input, $15/M output
  const costUsd = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15

  console.log(`[weeklyAdsDebrief] Claude returned ${report.length} chars; tokens in=${inputTokens} out=${outputTokens}; cost ~$${costUsd.toFixed(4)}`)

  const elapsedMs = Date.now() - startedAt
  const summary = {
    window: { since, until },
    totalSpend: metaData.accountTotals.spend,
    purchases: metaData.accountTotals.purchases,
    avgCpa: metaData.accountTotals.cpa,
    inputTokens,
    outputTokens,
    costUsd,
    elapsedMs,
  }

  const slack = await postToSlack(report, summary)
  console.log(`[weeklyAdsDebrief] Done. Posted to Slack: ${slack.posted}. Elapsed: ${elapsedMs}ms`)

  return { ...summary, report, slack }
}

/**
 * Guard for the DST-aware cron schedule. The cron runs twice per Friday
 * (20:00 and 21:00 UTC) to cover EDT and EST. This function returns true
 * only when "now" is actually 4pm in New York — so only one of the two
 * fires actually runs the debrief.
 *
 * For manual triggers (admin-only), this guard is bypassed.
 */
export function isFridayFourPmEastern() {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', hour12: false, weekday: 'short',
  })
  // .formatToParts gives us { weekday: 'Fri', hour: '16' } cleanly
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]))
  const isFriday = parts.weekday === 'Fri'
  const hour = parseInt(parts.hour, 10)
  // Accept 16:00 ± 30min window in case of cron jitter
  return isFriday && (hour === 16)
}
