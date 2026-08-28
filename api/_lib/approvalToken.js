/**
 * Approval links for the customer / race partner proof portal.
 *
 * Two things were wrong with how these were issued.
 *
 * ONE: they lasted 7 days. That is a fine window for a standard custom order,
 * where the proof goes out and comes back the same week. It is far too short
 * for a race partner, whose design cycle runs for weeks of back and forth
 * before anyone approves anything. Six partner orders were sitting mid-flight
 * with dead links, including one in "awaiting review" whose link had been
 * expired for nine days - we were asking someone to review a design through a
 * URL that returned an error.
 *
 * TWO, and worse: an expired token was replaced with a NEW random one. So the
 * link in the partner's inbox did not merely lapse, it became permanently
 * wrong. Even re-sending did not revive it, because the new email carried a
 * different URL and the old one stayed dead forever.
 *
 * So: one stable token per order, kept for the life of the order, with the
 * clock pushed forward every time we send or they interact. An active
 * conversation can never expire, and the first link ever sent keeps working.
 *
 * The expiry is not gone. It still closes the door on an order nobody has
 * touched in three months, which is the case it was actually there for. What
 * it no longer does is punish a slow approval.
 *
 * These are bearer tokens in an email, so the long life is a deliberate
 * trade. What they grant is narrow: viewing proofs of your own order,
 * approving or requesting changes, and messaging the designer. The order
 * itself carries no payment details and the token exposes no other order.
 */
import crypto from 'crypto'
import prisma from './prisma.js'

/** Ninety days, refreshed on every send. See the note above on why not seven. */
export const APPROVAL_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000

function freshExpiry() {
  return new Date(Date.now() + APPROVAL_TOKEN_TTL_MS)
}

/**
 * The approval token for an order, creating it if absent.
 *
 * Reuses the existing token rather than minting a new one, so every link we
 * have ever sent for this order keeps resolving. Only the expiry moves.
 */
export async function ensureApprovalToken(orderId) {
  const existing = await prisma.approvalToken.findUnique({ where: { orderId } })

  if (existing) {
    // Slide the window forward. Sending a proof, or a partner opening the
    // portal, is proof the order is live and the link still matters.
    return prisma.approvalToken.update({
      where: { orderId },
      data: { expiresAt: freshExpiry() },
    })
  }

  return prisma.approvalToken.create({
    data: { orderId, token: crypto.randomUUID(), expiresAt: freshExpiry() },
  })
}

/**
 * Replace an order's token, killing every link previously sent for it.
 *
 * Separate from ensureApprovalToken and never the default, because rotation
 * is what broke these links in the first place. For the one case that wants
 * it: a link reaching someone it should not have.
 */
export async function rotateApprovalToken(orderId) {
  return prisma.approvalToken.upsert({
    where: { orderId },
    create: { orderId, token: crypto.randomUUID(), expiresAt: freshExpiry() },
    update: { token: crypto.randomUUID(), expiresAt: freshExpiry() },
  })
}

/**
 * Push an existing token's expiry out because the visitor is right here.
 *
 * Fire and forget: a portal view that works must not fail because the clock
 * could not be updated.
 */
export function touchApprovalToken(orderId) {
  prisma.approvalToken
    .update({ where: { orderId }, data: { expiresAt: freshExpiry() } })
    .catch(err => console.warn('[approvalToken] could not extend expiry:', err.message))
}
