/** Shapes from /api/support/*. The server builds them in server/domain/support/threads.js. */

export type ThreadStatus = 'open' | 'waiting' | 'escalated' | 'closed'
/** A built-in view, or `teammate:<id>`. */
export type InboxView = 'inbox' | 'mentions' | 'unassigned' | 'all' | 'waiting' | 'escalated' | 'snoozed' | 'closed' | `teammate:${string}`
export type InboxSort = 'waiting' | 'newest' | 'oldest' | 'priority'
/** Where the conversation happens: the fast@ mailbox, or a DM to @trackstar_art. */
export type Channel = 'email' | 'instagram'

export interface Teammate { id: string; firstName: string; lastName: string }

export interface ThreadRow {
  id: string
  channel: Channel
  /** The customer's Instagram handle, without the @. Empty for email. */
  igUsername: string
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

export interface Attachment { filename: string; mimeType: string; size: number; attachmentId: string; url?: string | null }

export interface Message {
  id: string
  channel: Channel
  gmailMessageId: string | null
  igMessageId: string | null
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

/** Meta's rule for a DM: a reply may go out within 24 hours of the customer's last message (7 days with the human-agent permission). */
export interface ReplyWindow {
  open: boolean
  mode: 'standard' | 'human_agent' | 'closed' | 'none'
  closesAt: string | null
  reason: string | null
}

export interface ThreadDetail extends ThreadRow {
  gmailThreadId: string | null
  createdAt: string
  messages: Message[]
  notes: Note[]
  /** Set on an Instagram thread; null for email, which has no window. */
  replyWindow: ReplyWindow | null
  customer: { email: string; name: string; instagram: string | null; firstSeen: string; conversations: number }
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

export interface InstagramStatus {
  configured: boolean
  connected: boolean
  username: string | null
  accountId: string | null
  expectedHandle: string
  tokenExpiresAt: string | null
  humanAgent: boolean
  webhookConfigured: boolean
  lastImportedAt: string | null
}
export interface InstagramBackfillResult { conversations: number; seen: number; imported: number; failed: number }

export interface SyncResult { imported?: number; failed?: number; mode?: string; seen?: number; skipped?: string }
export interface BackfillResult { done: boolean; imported: number; total: number }
