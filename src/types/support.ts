/** Shapes from /api/support/*. The server builds them in server/domain/support/threads.js. */

export type ThreadStatus = 'open' | 'waiting' | 'escalated' | 'closed'
export type InboxView = 'open' | 'mine' | 'waiting' | 'escalated' | 'closed' | 'all'

export interface Teammate { id: string; firstName: string; lastName: string }

export interface ThreadRow {
  id: string
  subject: string
  customerEmail: string
  customerName: string
  status: ThreadStatus
  snoozedUntil: string | null
  assignee: Teammate | null
  snippet: string
  messageCount: number
  lastMessageAt: string
  lastInboundAt: string | null
  lastOutboundAt: string | null
  backfilled: boolean
}

export interface InboxCounts { open: number; mine: number; waiting: number; escalated: number; snoozed: number }

export interface InboxPayload {
  threads: ThreadRow[]
  counts: InboxCounts
  team: Teammate[]
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
  /** Whether our orders table has rows for it yet. */
  imported: boolean
}

export interface PastThread { id: string; subject: string; status: ThreadStatus; lastMessageAt: string; messageCount: number }

export interface ThreadDetail extends ThreadRow {
  gmailThreadId: string
  messages: Message[]
  context: { orders: CustomerOrder[]; shopifyError: string | null }
  pastThreads: PastThread[]
}

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
