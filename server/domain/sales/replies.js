/**
 * Did anyone write back?
 *
 * Every email the app sends records its Gmail thread. This asks Gmail, for
 * each open thread, who sent the latest message. If it was not us, the org
 * is marked replyPending, its stage becomes REPLIED, and its cadence stops:
 * a follow-up to someone who has already answered is the single worst email
 * a rep can send, and without this check it is the easiest one to send.
 *
 * Headers only (From and Date). The metadata scope cannot read a body, and
 * the app does not want one; answering happens in Gmail.
 *
 * Runs when the Sales page opens, at most once every few minutes, and on
 * demand. Threads older than the window are left alone.
 */
import prisma from '../../db.js'
import { threadMessages, gmailStatus } from './gmail.js'

const OPEN_STAGES = ['QUEUED', 'SENT', 'FOLLOWED_UP', 'REPLIED', 'CALL_BOOKED', 'PROPOSAL_SENT', 'INTERESTED']
const WINDOW_DAYS = 60
const MIN_INTERVAL_MS = 5 * 60 * 1000
const KEY_LAST = userId => `sales_reply_check:${userId}`

function fromIsUs(from, ourEmail) {
  const a = String(from || '').toLowerCase()
  return ourEmail ? a.includes(String(ourEmail).toLowerCase()) : false
}

/**
 * @returns {{ checked: number, newReplies: string[], cleared: string[], skipped?: string }}
 */
export async function checkReplies(userId, { force = false } = {}) {
  const status = await gmailStatus(userId)
  if (!status.connected) return { checked: 0, newReplies: [], cleared: [], skipped: 'Gmail is not connected' }
  if (!status.canReadReplies) return { checked: 0, newReplies: [], cleared: [], skipped: 'Reconnect Gmail to allow reply detection' }

  const last = await prisma.systemConfig.findUnique({ where: { key: KEY_LAST(userId) } })
  if (!force && last?.value && Date.now() - Number(last.value) < MIN_INTERVAL_MS) {
    return { checked: 0, newReplies: [], cleared: [], skipped: 'checked recently' }
  }

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const touches = await prisma.touch.findMany({
    where: { kind: 'EMAIL_SENT', gmailThreadId: { not: null }, sentAt: { gte: since }, company: { stage: { in: OPEN_STAGES } } },
    orderBy: { sentAt: 'desc' },
    select: { companyId: true, gmailThreadId: true, sentAt: true, company: { select: { id: true, name: true, stage: true, replyPending: true, lastReplyAt: true } } },
  })
  // One thread per org: the newest.
  const byCompany = new Map()
  for (const t of touches) if (!byCompany.has(t.companyId)) byCompany.set(t.companyId, t)

  const newReplies = []
  const cleared = []
  let checked = 0
  for (const t of byCompany.values()) {
    let messages
    try { messages = await threadMessages({ userId, threadId: t.gmailThreadId }) }
    catch (err) { console.warn(`[sales.replies] ${t.company.name}: ${err.message}`); continue }
    checked++
    if (!messages.length) continue
    const latest = messages[messages.length - 1]
    const theirs = messages.filter(m => !fromIsUs(m.from, status.email))
    const latestTheirs = theirs.length ? theirs[theirs.length - 1] : null
    const pending = latest && !fromIsUs(latest.from, status.email)

    if (pending && !t.company.replyPending) {
      const when = latestTheirs?.date || new Date()
      await prisma.$transaction([
        prisma.company.update({
          where: { id: t.companyId },
          data: {
            replyPending: true,
            lastReplyAt: when,
            // A reply ends the cold sequence. Nothing is due until a person decides.
            nextActionAt: null,
            nextAction: 'Reply waiting in Gmail',
            stage: ['QUEUED', 'SENT', 'FOLLOWED_UP'].includes(t.company.stage) ? 'REPLIED' : t.company.stage,
            proposedDraft: null,
            proposedAt: null,
          },
        }),
        prisma.touch.create({
          data: { companyId: t.companyId, kind: 'REPLY', subject: null, body: `Reply from ${latestTheirs?.from || 'them'}`, gmailThreadId: t.gmailThreadId, sentAt: when, createdBy: 'gmail' },
        }),
      ])
      newReplies.push(t.company.name)
    } else if (!pending && t.company.replyPending) {
      await prisma.company.update({ where: { id: t.companyId }, data: { replyPending: false, nextAction: null } })
      cleared.push(t.company.name)
    }
  }

  await prisma.systemConfig.upsert({
    where: { key: KEY_LAST(userId) },
    update: { value: String(Date.now()) },
    create: { key: KEY_LAST(userId), value: String(Date.now()) },
  })
  if (newReplies.length) console.log(`[sales.replies] new replies: ${newReplies.join(', ')}`)
  return { checked, newReplies, cleared }
}
