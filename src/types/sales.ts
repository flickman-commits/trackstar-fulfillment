/**
 * Shapes returned by /api/sales/*. Attio is the source of truth; these are
 * its records as the server reads them, plus what the send log adds.
 */

export type Pipeline = 'RACE' | 'CHARITY'
export type Motion = 'Race' | 'Charity' | 'Corporate'

/** Attio deal stages, in pipeline order. */
export const STAGES = ['Needs Enrichment', 'Not Contacted', 'Reached Out', 'In Conversation', 'Call Booked', 'Deck Sent', 'Won', 'Revisit Next Year', 'Lost'] as const
export type Stage = typeof STAGES[number]

export interface Person {
  id: string
  firstName: string
  lastName: string
  fullName: string
  email: string | null
  emails: string[]
  title: string | null
  /** Attio's enrichment on the person. */
  description: string | null
  linkedin: string | null
  location: string | null
  lastInteractionAt: string | null
  lastEmailAt: string | null
  webUrl: string | null
}

export interface CompanyRecord {
  id: string
  name: string | null
  domain: string | null
  /** Attio's enrichment on the company. */
  description: string | null
  location: string | null
  employeeRange: string | null
  categories: string[]
  linkedin: string | null
  twitter: string | null
  lastInteractionAt: string | null
  lastEmailAt: string | null
  nextCalendarAt: string | null
  webUrl: string | null
}

export interface Send {
  id: string
  touchNumber: number
  subject: string
  body?: string
  sentAt: string
  sentByEmail: string | null
  gmailThreadId: string | null
  attachments: string[]
  attioOk: boolean
}

/** A deal as the queue shows it. */
export interface Deal {
  id: string
  name: string | null
  stage: Stage | string | null
  motion: Motion | string | null
  pipeline: Pipeline
  ownerId: string | null
  company: CompanyRecord | null
  people: Person[]
  person: Person | null
  hasEmail: boolean
  /** The only address on the deal is a generic inbox, which is never written to. */
  genericOnly?: boolean
  touchCount: number
  nextAction: string | null
  nextActionDate: string | null
  raceDate: string | null
  runners: number | null
  tier: string | null
  sizeTier: string | null
  priority: string | null
  notes: string | null
  value: number | null
  units: number | null
  createdAt: string | null
  webUrl: string | null
  nextTouchNumber: number | null
  nextAngle: string | null
  exhausted: boolean
  lastSentAt: string | null
  lastSubject: string | null
  hasPrep: boolean
  preparedAt: string | null
  skippedUntil: string | null
  overdueDays: number
  reason: string
  /** Only on sentToday rows. */
  sentAt?: string
  sentSubject?: string
  /** Only on the full detail. */
  sends?: Send[]
}

export interface OvernightRun {
  finishedAt: string; prepared: number; followUps: number; fresh: number
  skipped: string[]; notes: string
}

export interface TodayPayload {
  cap: number
  room: number
  scope: 'mine' | 'all'
  member: { id: string; email: string; name: string } | null
  timezone: string
  undoSeconds: number
  sentTodayCount: number
  sentToday: Deal[]
  newOutreach: Deal[]
  newWaiting: number
  followUps: Deal[]
  later: Deal[]
  exhausted: Deal[]
  needsContact: Deal[]
  skipped: Deal[]
  counts: { deals: number; inScope: number; byStage: Record<string, number>; week: { sent: number } }
  overnight: OvernightRun | null
}

export interface Progress {
  days: { day: string; sent: number }[]
  totals: { sent: number; won: number; inConversation: number }
  funnel: { stage: string; count: number }[]
  byStage: Record<string, number>
}

export interface Variant { subject: string; body: string }

export interface DraftResult {
  touchNumber: number
  step: { angle: string; purpose: string; subject: string; nextActionDays: number }
  exhausted: boolean
  variants: Variant[]
  personId: string
  dealId: string
  model: string
  /** Who wrote it: a model now, the cadence template, or the overnight routine ('prepared'). */
  source?: 'model' | 'template' | 'prepared'
  preparedAt?: string
  warning?: string
}

export type AssetKind = 'image' | 'deck' | 'file'

export interface Asset {
  id: string
  name: string
  filename: string
  size: number | null
  contentType: string
  kind: AssetKind
  updatedAt: string | null
  previewUrl: string | null
}

export interface SalesStatus {
  llm: { configured: boolean; provider?: string; model?: string; baseUrl?: string; canSearch?: boolean }
  gmail: { configured: boolean; connected: boolean; email: string | null; canReadReplies?: boolean }
  attio: { configured: boolean; member: { id: string; email: string; name: string } | null }
  library: { configured: boolean }
  me: { id: string; email: string; firstName: string | null; role: string }
  lastRun: OvernightRun | null
}

export interface SalesSettings {
  dailyCap: number
  sender: { name: string; role: string; story: string; partnerCount: number }
  socialProof: string
  /** HTML appended to every sent email. The workspace default; reps override under Me. */
  signature: string
  timezone: string
  undoSeconds: number
}

export interface Sender {
  name: string
  role: string
  story: string
  signature: string
  isDefault: boolean
}

export interface AttioCheck {
  configured: boolean
  ok: boolean
  error?: string
  workspace?: string | null
  missing?: string[]
  stages?: string[] | null
  unknownStages?: string[]
}
