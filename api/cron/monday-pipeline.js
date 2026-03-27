import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default async function handler(req, res) {
  // Verify this is called by Vercel Cron (or allow manual trigger with secret)
  const authHeader = req.headers['authorization']
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    // Get all custom orders that are NOT sent to production (i.e. still in pipeline)
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

    // Count orders needing revisions (customer sent feedback, Dan needs to revise)
    const revisionCount = pipelineOrders.filter(o => o.designStatus === 'in_revision').length

    // Count orders waiting on customer response
    const awaitingCustomerCount = pipelineOrders.filter(o => o.designStatus === 'awaiting_review').length

    const urgentCount = urgentOrders.length

    // Build the Slack message
    const urgentSection = urgentCount > 0
      ? `\n\n:rotating_light: *Urgent (due within 3 days):*\n${urgentOrders.map(o => `• #${o.displayOrderNumber || '?'} — ${o.runnerName || 'Unknown'} (${o.raceName || 'Custom'}) — due ${formatDate(o.dueDate)}`).join('\n')}`
      : ''

    const message = {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📋 Monday Custom Orders Check-In'
          }
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

    if (!slackResponse.ok) {
      throw new Error('Failed to send Slack message')
    }

    return res.status(200).json({ success: true, total, urgentCount, revisionCount, awaitingCustomerCount })
  } catch (error) {
    console.error('Monday pipeline cron error:', error)
    return res.status(500).json({ error: error.message })
  }
}

function formatDate(dateStr) {
  if (!dateStr) return 'no date'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
