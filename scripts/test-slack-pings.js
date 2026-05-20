/**
 * One-off: send a test message to both new Slack webhooks so we can confirm
 * the routing is correct before relying on the live cron + onboarding flow.
 *
 *   - #trackstar-creators: a faked "new application" payload that mirrors
 *     what pingSampleRequested() produces.
 *   - #design: the real daily-design-update payload using current DB data,
 *     so you see today's actual counts.
 *
 * Usage: node --env-file=.env.local scripts/test-slack-pings.js
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function postCreatorsTest() {
  const url = process.env.SLACK_CREATORS_WEBHOOK_URL
  if (!url) { console.warn('SLACK_CREATORS_WEBHOOK_URL not set, skipping'); return }
  const mention = process.env.SLACK_USER_ID_MATT ? `<@${process.env.SLACK_USER_ID_MATT}> ` : ''
  const appUrl = process.env.APP_BASE_URL || ''
  const reviewLink = appUrl ? `\n\nReview & approve → ${appUrl}/creators` : ''
  const lines = [
    `${mention}🎬 *New Creator Sample Request* _(test message)_`,
    `Creator: *Jane Test* · @janetest`,
    `Race: Boston Marathon 2026`,
    `Print: 12x18 · Black Oak`,
    `Ships to: Boston, MA`,
    reviewLink,
  ].filter(Boolean)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: lines.join('\n') }),
  })
  console.log(`#trackstar-creators test → ${res.status} ${res.ok ? 'OK' : 'FAIL'}`)
  if (!res.ok) console.error(await res.text())
}

async function postDesignStandup() {
  const url = process.env.SLACK_DESIGN_WEBHOOK_URL
  if (!url) { console.warn('SLACK_DESIGN_WEBHOOK_URL not set, skipping'); return }

  const customOrders = await prisma.order.findMany({
    where: {
      trackstarOrderType: 'custom',
      designStatus: { not: 'sent_to_production' },
    },
    select: {
      dueDate: true,
      designStatus: true,
      runnerName: true,
      orderNumber: true,
      parentOrderNumber: true,
      raceName: true,
    }
  })

  const standardCount = await prisma.order.count({
    where: {
      trackstarOrderType: 'standard',
      status: { in: ['pending', 'ready', 'flagged', 'missing_year'] },
    }
  })

  const now = new Date()
  const endOfWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const overdue = []
  const dueThisWeek = []
  for (const o of customOrders) {
    if (!o.dueDate) continue
    const due = new Date(o.dueDate)
    if (due < now) overdue.push({ ...o, due })
    else if (due <= endOfWeek) dueThisWeek.push({ ...o, due })
  }
  overdue.sort((a, b) => a.due - b.due)
  dueThisWeek.sort((a, b) => a.due - b.due)

  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
  const orderLine = (o) => `• #${o.parentOrderNumber || o.orderNumber || '?'} — ${o.runnerName || 'Unknown'} (${o.raceName || 'Custom'}) — due ${fmt(o.due)}`

  const overdueSection = overdue.length > 0
    ? `\n\n:rotating_light: *Overdue (${overdue.length}):*\n${overdue.map(orderLine).join('\n')}`
    : ''
  const weekSection = dueThisWeek.length > 0
    ? `\n\n:date: *Due this week (${dueThisWeek.length}):*\n${dueThisWeek.map(orderLine).join('\n')}`
    : ''

  const appUrl = process.env.APP_BASE_URL || ''
  const links = appUrl
    ? `\n\nQueues → <${appUrl}/|Standard>  ·  <${appUrl}/?type=custom|Custom>`
    : ''

  const message = {
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '☀️ Daily Design Standup (test)' } },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Good morning! Here's where we stand today:\n\n*${customOrders.length} custom order${customOrders.length === 1 ? '' : 's'}* to fulfill\n*${standardCount} standard order${standardCount === 1 ? '' : 's'}* to fulfill${overdueSection}${weekSection}${links}`
        }
      }
    ]
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  })
  console.log(`#design test → ${res.status} ${res.ok ? 'OK' : 'FAIL'}  (custom: ${customOrders.length}, standard: ${standardCount}, overdue: ${overdue.length}, due-this-week: ${dueThisWeek.length})`)
  if (!res.ok) console.error(await res.text())
}

async function main() {
  await postCreatorsTest()
  await postDesignStandup()
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
