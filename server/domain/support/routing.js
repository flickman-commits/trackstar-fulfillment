/**
 * Where a new conversation goes.
 *
 * One setting, kept in SystemConfig: the person every new conversation is
 * assigned to as it arrives, on either channel. Nobody by default. The
 * history import never assigns: a year of closed threads is not anyone's
 * work. Its own file, with no imports from the channels, because both
 * channels read it as they create a thread and threads.js reads from them.
 */
import prisma from '../../db.js'
import { can } from '../../../api/_lib/roles.js'

const KEY = 'support_default_assignee'
const OPENISH = { status: { in: ['open', 'waiting', 'escalated'] } }

/** The id of the person new conversations go to, or null. Checked against the roster each time: someone who left stops receiving. */
export async function defaultAssigneeId() {
  const row = await prisma.systemConfig.findUnique({ where: { key: KEY } })
  const id = row?.value || null
  if (!id) return null
  const u = await prisma.user.findUnique({ where: { id }, select: { isActive: true, role: true } })
  if (!u?.isActive || !(await can(u.role, 'support'))) return null
  return id
}

/**
 * Set it, or clear it with null. With applyToOpen, the open conversations
 * nobody has yet are handed over too, each with an event saying who did it.
 */
export async function setDefaultAssignee(userId, { applyToOpen = false, actor } = {}) {
  let who = null
  if (userId) {
    who = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, firstName: true, lastName: true, isActive: true, role: true } })
    if (!who?.isActive) throw new Error('That teammate is not active')
    if (!(await can(who.role, 'support'))) throw new Error(`${who.firstName}'s role does not include Support`)
    await prisma.systemConfig.upsert({ where: { key: KEY }, update: { value: userId }, create: { key: KEY, value: userId } })
  } else {
    await prisma.systemConfig.deleteMany({ where: { key: KEY } })
  }

  let assigned = 0
  if (who && applyToOpen) {
    const open = await prisma.supportThread.findMany({ where: { assigneeId: null, ...OPENISH }, select: { id: true } })
    if (open.length) {
      const by = [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') || 'Someone'
      await prisma.$transaction([
        prisma.supportThread.updateMany({ where: { id: { in: open.map(t => t.id) } }, data: { assigneeId: who.id } }),
        prisma.supportNote.createMany({ data: open.map(t => ({ threadId: t.id, kind: 'event', body: `${by} routed this to ${who.firstName}`, authorId: actor?.id || null, authorName: by })) }),
      ])
      assigned = open.length
    }
  }
  return { defaultAssigneeId: who?.id || null, assigned }
}
