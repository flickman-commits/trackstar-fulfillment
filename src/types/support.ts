/** Shapes from /api/support/*. The server builds them in server/domain/support/threads.js. */

export type ThreadStatus = 'open' | 'waiting' | 'escalated' | 'closed'
/** A built-in view, or `teammate:<id>`. */
export type InboxView = 'inbox' | 'mentions' | 'unassigned' | 'all' | 'waiting' | 'escalated' | 'snoozed' | 'closed' | `teammate:${string}`
export type InboxSort = 'waiting' | 'newest' | 'oldest' | 'priority'

export interface Teammate { id: string; firstName: string; lastName: string }

export interface ThreadRow {
  id: string
  subject: string
  customerEmail: string
  customerName: string
  status: ThreadStatus
  snoozedUntil: string | null
  assignee: Teammate | null
  priority: boolean
  tags: string[]
  snippet: string
  messageCount: number
  lastMessageAt: string
  lastInboundAt: string | null
  lastOutboundAt: string | null
  backfilled: boolean
  /** The customer wrote since you last opened it. */
  unread: boolean
}

export interface InboxCounts {
  inbox: number; mentions: number; unassigned: number; all: number
  waiting: number; escalated: number; snoozed: number
  byAssignee: Record<string, number>
}

export interface InboxPayload {
  threads: ThreadRow[]
  counts: InboxCounts
  team: Teammate[]
  tagSuggestions: string[]
  me: Teammate & { role: string }
}

export interface Attachment { filename: string; mimeType: string; size: number; attachmentId: string }

export interface Message {
  id: string
  gmailMessageId: string
  direction: 'in' | 'out'
  fromEmail: string
  fromName: string
  toEmails: string
  ccEmails: string
  subject: string
  /** What the person wrote, with the quoted thread underneath removed. */
  text: string
  /** The quoted part, for a "show quoted text" toggle. */
  quoted: string
  attachments: Attachment[]
  sentAt: string
  sentBy: Teammate | null
}

/** An internal note, or an event the system wrote (assigned, closed, snoozed). */
export interface Note {
  id: string
  kind: 'note' | 'event'
  body: string
  author: Teammate | null
  authorName: string
  mentions: string[]
  createdAt: string
}

export interface OrderItem {
  orderId: string
  orderNumber: string
  item: number
  type: string
  status: string
  designStatus: string | null
  runner: string
  race: string
  year: number
  size: string
  frame: string
  isRush: boolean
  dueDate: string | null
  proofSentAt: string | null
  approvalUrl: string | null
  assignee: Teammate | null
  lookupVerified: boolean | null
  customerBib: string | null
  customerFinishTime: string | null
  tracking: { number: string; carrier: string | null } | null
  hasPhoto: boolean
}

export interface CustomerOrder {
  number: string
  source: string
  shopifyOrderId: string | null
  adminUrl: string | null
  createdAt: string
  financialStatus: string | null
  fulfillmentStatus: string | null
  total: string | null
  currency: string | null
  discountCodes: string[]
  shipTo: string
  tracking: { url: string | null; number: string | null; company: string | null; status: string | null; at: string | null }[]
  lineItems: { title: string; variant: string | null; quantity: number; properties: Record<string, string> }[]
  items: OrderItem[]
  imported: boolean
}

export interface PastThread { id: string; subject: string; status: ThreadStatus; lastMessageAt: string; messageCount: number }

export interface ThreadDetail extends ThreadRow {
  gmailThreadId: string
  createdAt: string
  messages: Message[]
  notes: Note[]
  customer: { email: string; name: string; firstSeen: string; conversations: number }
  context: { orders: CustomerOrder[]; shopifyError: string | null }
  pastThreads: PastThread[]
}

export interface Macro { id: string; name: string; body: string; uses: number; updatedAt: string; createdBy: { id: string; firstName: string } | null }

export interface MailboxStatus {
  configured: boolean
  connected: boolean
  email: string | null
  expectedEmail: string
  backfill: { done: boolean; count: number; inProgress: boolean }
  lastImportedAt: string | null
}

export interface SyncResult { imported?: number; failed?: number; mode?: string; seen?: number; skipped?: string }
export interface BackfillResult { done: boolean; imported: number; total: number }
