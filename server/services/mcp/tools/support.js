/**
 * Support: the conversations still open with an order's customer, and a
 * draft reply left on one for a person to read, edit and send from Support.
 * Nothing here sends. Gated on the support capability, like the Support page.
 */
import { z } from 'zod'
import prisma from '../../../../api/_lib/prisma.js'
import { ToolError } from '../server.js'
import { conversationsForOrder } from '../../../domain/support/compose.js'
import { storeDraft } from '../../../domain/support/draft.js'
import { findOrdersByNumber, displayNumber } from './orders.js'

export const supportTools = [
  {
    name: 'order_conversations',
    title: 'Order conversations',
    description: 'Support conversations still open with an order\'s customer: subject, status, a preview, who has it. The thread id is what draft_reply takes.',
    scope: 'read',
    cap: 'support',
    readOnly: true,
    input: { orderNumber: z.string().max(40) },
    async handler({ orderNumber }) {
      const rows = await findOrdersByNumber(orderNumber)
      if (!rows.length) throw new ToolError(`No order matching "${orderNumber}".`)
      const list = await conversationsForOrder(rows[0].id)
      return {
        orderNumber: displayNumber(rows[0]),
        open: list.length,
        conversations: list.map(t => ({ threadId: t.id, subject: t.subject, status: t.status, channel: t.channel, preview: t.snippet.slice(0, 200), lastMessageAt: t.lastMessageAt, snoozed: t.snoozed || undefined, assignee: t.assignee })),
      }
    },
  },
  {
    name: 'draft_reply',
    title: 'Draft a reply',
    description: 'Leave a draft reply on a Support conversation for a person to review and send. Never sends anything.',
    scope: 'write',
    cap: 'support',
    readOnly: false,
    input: {
      threadId: z.string().min(1).max(40).describe('From order_conversations.'),
      body: z.string().trim().min(1).max(10000).describe('The reply as it would go to the customer.'),
      summary: z.string().max(240).optional().describe('One line for the team on what the reply does.'),
    },
    async handler({ threadId, body, summary }, { principal }) {
      const t = await prisma.supportThread.findUnique({ where: { id: threadId }, select: { id: true, subject: true, mergedIntoId: true } })
      if (!t) throw new ToolError(`No Support conversation with id "${threadId}".`)
      if (t.mergedIntoId) throw new ToolError(`That conversation was merged into ${t.mergedIntoId}. Draft there.`)
      const lastIn = await prisma.supportMessage.findFirst({ where: { threadId: t.id, direction: 'in' }, orderBy: { sentAt: 'desc' }, select: { id: true } })
      const note = await storeDraft({
        threadId: t.id,
        body,
        data: { summary: summary || null, forMessageId: lastIn?.id || null, source: `mcp:${principal.name}` },
        actor: principal.user,
      })
      return { summary: `Drafted a reply on "${t.subject || '(no subject)'}"`, threadId: t.id, draftId: note.id, sent: false, next: 'A person reviews and sends it from Support.' }
    },
  },
]
