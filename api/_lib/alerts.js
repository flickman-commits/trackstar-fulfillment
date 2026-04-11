/**
 * Real-time error alerting to Slack.
 * Call alertError() when a critical operation fails — sends immediately to Slack.
 */

/**
 * Send an alert to Slack when something breaks in production.
 * @param {string} context - Where the error happened (e.g., "etsy-token-refresh", "proof-email")
 * @param {Error|string} error - The error object or message
 * @param {Object} [meta] - Optional metadata (orderId, etc.)
 */
export async function alertError(context, error, meta = {}) {
  const webhookUrl = process.env.SLACK_PROOF_WEBHOOK_URL
  if (!webhookUrl) {
    console.error(`[alert] No Slack webhook configured. Error in ${context}:`, error)
    return
  }

  const errorMsg = error instanceof Error ? error.message : String(error)
  const metaStr = Object.keys(meta).length
    ? '\n' + Object.entries(meta).map(([k, v]) => `• ${k}: ${v}`).join('\n')
    : ''

  const text = `🚨 *System Alert — ${context}*\n\`${errorMsg}\`${metaStr}`

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    })
  } catch (slackErr) {
    // If Slack itself is down, just log — don't throw
    console.error('[alert] Failed to send Slack alert:', slackErr.message)
  }
}
