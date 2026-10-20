/**
 * Posting to Slack incoming webhooks.
 *
 * Fire-and-forget by intent (a ping must never break the request it rides
 * on), but bounded: a hung Slack request used to hold a serverless function
 * open until its time limit.
 */
import { fetchWithTimeout } from './fetchWithTimeout.js'

/**
 * Text someone outside the team typed (a customer, a creator applicant).
 * Slack mrkdwn treats < > & as markup, so <!channel> or <https://x|label>
 * would otherwise render as a mention or a disguised link.
 */
export function slackText(value, max = 500) {
  return String(value ?? '').slice(0, max).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Post `text` to a webhook. Never throws; returns whether Slack accepted it. */
export async function postSlack(webhookUrl, text, { timeoutMs = 5000 } = {}) {
  if (!webhookUrl) return false
  try {
    const res = await fetchWithTimeout(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }, timeoutMs)
    return res.ok
  } catch (err) {
    console.warn(`[slack] post failed: ${err.name === 'TimeoutError' ? 'timed out' : err.message}`)
    return false
  }
}
