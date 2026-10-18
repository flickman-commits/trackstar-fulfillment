/**
 * A person's yes or no on a finished render, and what an approval sets off.
 * Used by api/render/jobs.js and the MCP design tools, so both do the same thing.
 */
import prisma from '../../db.js'
import { recordAudit } from '../../../api/_lib/users.js'
import { reviewJob } from './jobs.js'
import { uploadApprovedToArtelo } from './artelo.js'
import { deliverApproved } from './deliver.js'
import { markRacePrinted } from '../races/verification.js'

/** Copy an approved print to the Drive Orders folder, then upload it to the Artelo library. Never throws. */
export async function deliverEverywhere(job) {
  try {
    let j = job.deliveredAt ? job : await deliverApproved(job)
    if (!j.arteloUploadedAt) j = await uploadApprovedToArtelo(j)
    return j
  } catch (e) { console.error('[render/review] background delivery', job.id, e.message) }
}

/**
 * Approve or reject a finished render as `user`. On approve: the race year is
 * locked (printed), other renders of the order waiting for review are closed,
 * and `delivery` is the Drive + Artelo upload, already started, for the caller
 * to keep alive (inBackground) or await. A failed delivery shows on the order
 * and is retried by the import. The order is not completed here: the file
 * still has to be attached to the item in Artelo by hand.
 * @returns {Promise<{ job: object, delivery: Promise|null }>}
 */
export async function reviewRender({ jobId, decision, note, user }) {
  const job = await reviewJob({ jobId, decision, note, reviewerId: user?.id || null })
  let delivery = null
  if (job.review === 'approved') {
    if (job.spec?.raceId) await markRacePrinted(job.spec.raceId)
    delivery = deliverEverywhere(job)
    await prisma.renderJob.updateMany({ where: { orderId: job.orderId, review: 'pending', id: { not: job.id } }, data: { review: 'closed', reviewNote: 'Another version was approved', reviewedAt: new Date() } })
  }
  await recordAudit({ action: `render.${job.review}`, summary: `${job.review === 'approved' ? 'Approved' : 'Rejected'} the render of ${job.spec?.file || job.orderId} (v${job.version})${job.reviewNote ? `: ${job.reviewNote}` : ''}`, detail: { jobId: job.id, orderId: job.orderId }, actor: user })
  return { job, delivery }
}
