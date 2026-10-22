/**
 * Feature requests: what the team asks to have built. Sent from the Request
 * feature button in Support or added in Settings > Feature Requests; anyone
 * signed in adds and reads them, an admin marks one done when it ships (or
 * closes it with a note saying why not). Settings lists open ones first.
 */
import prisma from '../db.js'

export class FeatureRequestError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; this.expose = true }
}

const SHOW = { id: true, title: true, detail: true, source: true, status: true, note: true, createdByName: true, createdAt: true, doneAt: true, doneByName: true }

function personName(actor) {
  return actor?.firstName || actor?.name || actor?.email || 'Someone'
}

export async function listFeatureRequests() {
  const [open, done] = await Promise.all([
    prisma.featureRequest.findMany({ where: { status: 'open' }, orderBy: { createdAt: 'asc' }, select: SHOW }),
    prisma.featureRequest.findMany({ where: { status: 'done' }, orderBy: { doneAt: 'desc' }, take: 80, select: SHOW }),
  ])
  return { open, done }
}

export async function addFeatureRequest({ title, detail, source, actor }) {
  const t = String(title || '').trim()
  if (!t) throw new FeatureRequestError('Say what you would like built')
  return prisma.featureRequest.create({
    data: {
      title: t.slice(0, 200), detail: String(detail || '').trim().slice(0, 4000) || null,
      source: source === 'support' ? 'support' : 'settings',
      createdById: actor?.id || null, createdByName: personName(actor),
    },
    select: SHOW,
  })
}

/** Mark done (with an optional note: shipped, or why not), or put back. */
export async function setFeatureDone({ id, done, note, actor }) {
  const row = await prisma.featureRequest.findUnique({ where: { id: String(id || '') } })
  if (!row) throw new FeatureRequestError('That request is gone', 404)
  return prisma.featureRequest.update({
    where: { id: row.id },
    data: done
      ? { status: 'done', doneAt: new Date(), doneByName: personName(actor), note: String(note || '').trim().slice(0, 1000) || null }
      : { status: 'open', doneAt: null, doneByName: null, note: null },
    select: SHOW,
  })
}

export async function deleteFeatureRequest({ id }) {
  await prisma.featureRequest.delete({ where: { id: String(id || '') } }).catch(() => { throw new FeatureRequestError('That request is gone', 404) })
  return { ok: true }
}
