/**
 * /api/sales/today - the morning, as one payload.
 *
 *   GET                       replies waiting, today's stack, what went out today, the counts
 *   GET ?action=progress      sends per day, reply rate, funnel; the last 30 days
 *   GET ?action=check-replies ask Gmail who has written back (throttled; ?force=1 to insist)
 *   POST { action:'skip', id }             hide until tomorrow
 *   POST { action:'unskip', id }
 *
 * The stack is the daily cap, filled in this order: orgs the routine already
 * drafted (follow-ups first), then anything else due with a contact. Sent
 * today are shown checked off and count against the cap, so the page can say
 * "3 of 10" and mean it.
 */
import prisma from '../_lib/prisma.js'
import { setCors } from '../_lib/auth.js'
import { requireAdminOnly } from '../_lib/users.js'
import { getSettings, startOfToday } from '../../server/domain/sales/settings.js'
import { checkReplies } from '../../server/domain/sales/replies.js'
import { nextStepFor } from '../../server/domain/sales/drafting.js'

const OPEN = ['QUEUED', 'SENT', 'FOLLOWED_UP']
const CONTACT_SELECT = { id: true, firstName: true, lastName: true, email: true, emailSource: true, title: true, linkedinUrl: true, isPrimary: true, research: true, researchedAt: true }
const INCLUDE = {
  contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], select: CONTACT_SELECT },
  touches: { orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, kind: true, touchNumber: true, angle: true, subject: true, sentAt: true, createdAt: true, gmailThreadId: true } },
}

function daysAgo(d) {
  if (!d) return null
  return Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 86400000))
}

/** One line that says why this org is in front of you today. */
async function reason(c) {
  const { touchNumber, step, exhausted } = await nextStepFor(c)
  const lastSent = c.touches.find(t => t.kind === 'EMAIL_SENT')
  if (c.replyPending) return { text: `Replied${c.lastReplyAt ? ` ${daysAgo(c.lastReplyAt) === 0 ? 'today' : `${daysAgo(c.lastReplyAt)}d ago`}` : ''} · answer in Gmail`, touchNumber: null, angle: null }
  if (exhausted) return { text: 'Sequence complete · decide next year vs. pass', touchNumber: null, angle: null }
  if (touchNumber === 1) return { text: `New · first touch${c.tier ? ` · ${c.tier}` : ''}`, touchNumber, angle: step.angle }
  const ago = lastSent?.sentAt ? daysAgo(lastSent.sentAt) : (c.lastTouchAt ? daysAgo(c.lastTouchAt) : null)
  return { text: `Touch ${touchNumber} · ${ago != null ? `last emailed ${ago}d ago, no reply` : step.angle}`, touchNumber, angle: step.angle }
}

async function shape(c) {
  const r = await reason(c)
  const { proposedDraft, ...rest } = c
  return {
    ...rest,
    lastTouch: c.touches[0] || null,
    hasProposedDraft: Boolean(proposedDraft),
    reason: r.text,
    nextTouchNumber: r.touchNumber,
    nextAngle: r.angle,
    lastEmailedAt: c.touches.find(t => t.kind === 'EMAIL_SENT')?.sentAt || c.lastTouchAt || null,
  }
}

async function today(actor) {
  const settings = await getSettings()
  const cap = settings.dailyCap
  const now = new Date()
  const dayStart = startOfToday(settings.timezone, now)
  const weekStart = new Date(dayStart.getTime() - 6 * 86400000)
  const scope = actor?.id ? { OR: [{ ownerId: actor.id }, { ownerId: null }] } : {}

  const sentTodayTouches = await prisma.touch.findMany({
    where: { kind: 'EMAIL_SENT', sentAt: { gte: dayStart } },
    orderBy: { sentAt: 'asc' },
    select: { companyId: true, sentAt: true, touchNumber: true },
  })
  const sentIds = [...new Set(sentTodayTouches.map(t => t.companyId))]
  const sentToday = sentIds.length
    ? await prisma.company.findMany({ where: { id: { in: sentIds } }, include: INCLUDE })
    : []
  const sentAtById = Object.fromEntries(sentTodayTouches.map(t => [t.companyId, t.sentAt]))

  const replies = await prisma.company.findMany({
    where: { ...scope, replyPending: true },
    orderBy: { lastReplyAt: 'desc' },
    include: INCLUDE,
  })

  const workable = { ...scope, replyPending: false, id: { notIn: sentIds }, OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }], contacts: { some: { email: { not: null } } } }
  const room = Math.max(0, cap - sentIds.length)

  // Prepared first: the routine ordered these on purpose.
  const prepared = room
    ? await prisma.company.findMany({ where: { ...workable, proposedDraft: { not: null } }, orderBy: [{ nextActionAt: 'asc' }, { proposedAt: 'asc' }], take: room, include: INCLUDE })
    : []
  const preparedIds = prepared.map(c => c.id)
  const remaining = Math.max(0, room - prepared.length)
  const dueMore = remaining
    ? await prisma.company.findMany({ where: { ...workable, id: { notIn: [...sentIds, ...preparedIds] }, stage: { in: OPEN }, nextActionAt: { lte: now } }, orderBy: { nextActionAt: 'asc' }, take: remaining, include: INCLUDE })
    : []
  const stillRoom = Math.max(0, remaining - dueMore.length)
  const fresh = stillRoom
    ? await prisma.company.findMany({ where: { ...workable, id: { notIn: [...sentIds, ...preparedIds, ...dueMore.map(c => c.id)] }, stage: 'NOT_CONTACTED' }, orderBy: [{ tier: 'asc' }, { createdAt: 'desc' }], take: stillRoom, include: INCLUDE })
    : []

  // Follow-ups before first touches, then by how overdue.
  const stack = [...prepared, ...dueMore, ...fresh].sort((a, b) => {
    const fa = a.touchCount > 0 ? 0 : 1, fb = b.touchCount > 0 ? 0 : 1
    if (fa !== fb) return fa - fb
    return new Date(a.nextActionAt || 0) - new Date(b.nextActionAt || 0)
  })

  const [dueLater, needsContact, total, weekSent, weekReplies, weekCalls] = await Promise.all([
    prisma.company.count({ where: { ...scope, stage: { in: OPEN }, nextActionAt: { gt: now } } }),
    prisma.company.count({ where: { ...scope, stage: 'NOT_CONTACTED', contacts: { none: { email: { not: null } } } } }),
    prisma.company.count({ where: scope }),
    prisma.touch.count({ where: { kind: 'EMAIL_SENT', sentAt: { gte: weekStart } } }),
    prisma.touch.count({ where: { kind: 'REPLY', sentAt: { gte: weekStart } } }),
    prisma.company.count({ where: { ...scope, stage: 'CALL_BOOKED', updatedAt: { gte: weekStart } } }),
  ])

  const lastRun = await prisma.systemConfig.findUnique({ where: { key: 'sales_last_run' } })
  let overnight = null
  try { overnight = lastRun?.value ? JSON.parse(lastRun.value) : null } catch { overnight = null }

  return {
    cap,
    timezone: settings.timezone,
    undoSeconds: settings.undoSeconds,
    sentTodayCount: sentIds.length,
    replies: await Promise.all(replies.map(shape)),
    stack: await Promise.all(stack.map(shape)),
    sentToday: (await Promise.all(sentToday.map(shape))).map(c => ({ ...c, sentAt: sentAtById[c.id] })).sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt)),
    counts: { dueLater, needsContact, total, week: { sent: weekSent, replies: weekReplies, calls: weekCalls } },
    overnight,
  }
}

async function progress() {
  const settings = await getSettings()
  const now = new Date()
  const start = new Date(startOfToday(settings.timezone, now).getTime() - 29 * 86400000)
  const sent = await prisma.touch.findMany({ where: { kind: 'EMAIL_SENT', sentAt: { gte: start } }, select: { sentAt: true } })
  const replies = await prisma.touch.count({ where: { kind: 'REPLY', sentAt: { gte: start } } })
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: settings.timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const days = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000)
    days.push({ day: fmt.format(d), sent: 0 })
  }
  const idx = Object.fromEntries(days.map((d, i) => [d.day, i]))
  for (const t of sent) { const k = fmt.format(new Date(t.sentAt)); if (k in idx) days[idx[k]].sent++ }

  const byStage = await prisma.company.groupBy({ by: ['stage'], _count: true })
  const n = Object.fromEntries(byStage.map(x => [x.stage, x._count]))
  const at = (...stages) => stages.reduce((a, s) => a + (n[s] || 0), 0)
  const contacted = await prisma.company.count({ where: { touchCount: { gt: 0 } } })
  const funnel = [
    { stage: 'Contacted', count: contacted },
    { stage: 'Replied', count: at('REPLIED', 'CALL_BOOKED', 'PROPOSAL_SENT', 'INTERESTED', 'SIGNED', 'INVOICED', 'PAID') },
    { stage: 'Call booked', count: at('CALL_BOOKED', 'PROPOSAL_SENT', 'INTERESTED', 'SIGNED', 'INVOICED', 'PAID') },
    { stage: 'Proposal', count: at('PROPOSAL_SENT', 'INTERESTED', 'SIGNED', 'INVOICED', 'PAID') },
    { stage: 'Signed', count: at('SIGNED', 'INVOICED', 'PAID') },
  ]
  const totalSent = sent.length
  return {
    days,
    totals: { sent: totalSent, replies, replyRate: totalSent ? Math.round((replies / totalSent) * 1000) / 10 : 0, calls: at('CALL_BOOKED', 'PROPOSAL_SENT', 'INTERESTED', 'SIGNED', 'INVOICED', 'PAID'), signed: at('SIGNED', 'INVOICED', 'PAID') },
    funnel,
    byStage: n,
  }
}

export default async function handler(req, res) {
  if (setCors(req, res, { methods: 'GET, POST, OPTIONS' })) return
  const actor = await requireAdminOnly(req, res)
  if (!actor) return

  try {
    if (req.method === 'GET') {
      const action = String(req.query?.action || '')
      if (action === 'progress') return res.status(200).json(await progress())
      if (action === 'check-replies') return res.status(200).json(await checkReplies(actor.id, { force: req.query?.force === '1' }))
      return res.status(200).json(await today(actor))
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
      if (!body.id) return res.status(400).json({ error: 'id is required' })
      if (body.action === 'skip') {
        const settings = await getSettings()
        const tomorrow = new Date(startOfToday(settings.timezone).getTime() + 86400000)
        await prisma.company.update({ where: { id: String(body.id) }, data: { snoozedUntil: tomorrow } })
        return res.status(200).json({ success: true, until: tomorrow })
      }
      if (body.action === 'unskip') {
        await prisma.company.update({ where: { id: String(body.id) }, data: { snoozedUntil: null } })
        return res.status(200).json({ success: true })
      }
      return res.status(400).json({ error: `Unknown action: ${body.action}` })
    }
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('[API /sales/today]', error)
    return res.status(500).json({ error: error.message })
  }
}
