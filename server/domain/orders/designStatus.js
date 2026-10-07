/**
 * Moving a custom or partner order through design. One place for the rules
 * so the dashboard and the MCP server agree:
 *
 *   - sent_to_production also completes the order; leaving it reopens it.
 *   - back from approved to in_revision un-approves the proof, so the
 *     customer's portal does not stay on the "approved" screen.
 *   - in_progress mints the approval token, so the customer can be messaged
 *     before any proof exists.
 *   - sent_to_production pings the proofs Slack channel.
 */
import prisma from '../../db.js'
import { ensureApprovalToken } from '../../../api/_lib/approvalToken.js'

export const DESIGN_STATUSES = ['not_started', 'in_progress', 'awaiting_review', 'in_revision', 'approved_by_customer', 'final_pdf_uploaded', 'sent_to_production']

export async function setDesignStatus(existing, designStatus) {
  if (!DESIGN_STATUSES.includes(designStatus)) throw new Error(`Invalid designStatus. Must be one of: ${DESIGN_STATUSES.join(', ')}`)
  if (existing.trackstarOrderType !== 'custom' && existing.trackstarOrderType !== 'race_partner') {
    throw new Error('Design status can only be updated for custom or race partner orders')
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
  if (existing.designStatus === 'approved_by_customer' && designStatus === 'in_revision') {
    await prisma.proof.updateMany({ where: { orderId: existing.id, status: 'approved' }, data: { status: 'revision_requested' } })
  }

  const order = await prisma.order.update({ where: { id: existing.id }, data: updateData })
  if (designStatus === 'in_progress') await ensureApprovalToken(existing.id)

  if (designStatus === 'sent_to_production' && process.env.SLACK_PROOF_WEBHOOK_URL) {
    const shopifyData = existing.shopifyOrderData
    const displayNum = (shopifyData && typeof shopifyData === 'object' && 'name' in shopifyData)
      ? String(shopifyData.name) : `#${existing.parentOrderNumber}`
    fetch(process.env.SLACK_PROOF_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `🖨️ <@U09UVEP1N3Y> Final PDF ready for order *${displayNum}* - ready for production!` }),
    }).catch(e => console.warn('[designStatus] Slack failed:', e.message))
  }
  return order
}
