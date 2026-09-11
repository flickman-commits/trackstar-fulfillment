/**
 * Shapes returned by /api/sales/*. Mirrors prisma/schema.prisma; keep in step.
 */

export type Pipeline = 'RACE' | 'CHARITY'

export type DealStage =
  | 'NOT_CONTACTED' | 'QUEUED' | 'SENT' | 'FOLLOWED_UP' | 'REPLIED' | 'CALL_BOOKED'
  | 'PROPOSAL_SENT' | 'INTERESTED' | 'SIGNED' | 'INVOICED' | 'PAID' | 'NEXT_YEAR'
  | 'PASSED' | 'NOT_INTERESTED'

export const STAGE_LABEL: Record<DealStage, string> = {
  NOT_CONTACTED: 'Not contacted',
  QUEUED: 'Draft ready',
  SENT: 'Sent',
  FOLLOWED_UP: 'Followed up',
  REPLIED: 'Replied',
  CALL_BOOKED: 'Call booked',
  PROPOSAL_SENT: 'Proposal sent',
  INTERESTED: 'Interested',
  SIGNED: 'Signed',
  INVOICED: 'Invoiced',
  PAID: 'Paid',
  NEXT_YEAR: 'Next year',
  PASSED: 'Passed',
  NOT_INTERESTED: 'Not interested',
}

export interface Research {
  title?: string
  personInfo?: string[]
  companyInfo?: string[]
  sources?: string[]
  researchedAt?: string
}

export interface Contact {
  id: string
  firstName: string
  lastName: string
  email: string | null
  title: string | null
  linkedinUrl: string | null
  isPrimary: boolean
  research: Research | null
  researchedAt: string | null
}

export type TouchKind = 'EMAIL_DRAFT' | 'EMAIL_SENT' | 'REPLY' | 'CALL' | 'NOTE'

export interface Touch {
  id: string
  kind: TouchKind
  touchNumber: number | null
  angle?: string | null
  subject: string | null
  body?: string | null
  gmailDraftId?: string | null
  sentAt: string | null
  createdAt: string
  createdBy?: string | null
}

export interface Company {
  id: string
  pipeline: Pipeline
  name: string
  domain: string | null
  website: string | null
  city: string | null
  state: string | null
  runnerCount: number | null
  raceDate: string | null
  identityTags: string[]
  courseLandmark: string | null
  tier: string | null
  dealValueCents: number | null
  units: number | null
  stage: DealStage
  touchCount: number
  lastTouchAt: string | null
  nextActionAt: string | null
  nextAction: string | null
  notes: string | null
  source: string
  ownerId?: string | null
  proposedAt?: string | null
  hasProposedDraft?: boolean
  contacts: Contact[]
  lastTouch?: Touch | null
  touches?: Touch[]
}

export interface Variant { subject: string; body: string }

export interface DraftResult {
  touchNumber: number
  step: { angle: string; purpose: string; subject: string; nextActionDays: number }
  exhausted: boolean
  variants: Variant[]
  contactId: string
  companyId: string
  model: string
  /** Who wrote it: a model now, the cadence template, or the overnight routine ('prepared'). */
  source?: 'model' | 'template' | 'prepared'
  preparedAt?: string
  /** Set when the model was meant to write it and could not. */
  warning?: string
}

export interface Mockup {
  id: string
  name: string
  size: number | null
  contentType: string
  previewUrl: string | null
}

export interface SalesStatus {
  llm: { configured: boolean; provider?: string; model?: string; baseUrl?: string; canSearch?: boolean }
  research: { configured: boolean; provider: 'anthropic' | 'perplexity' | null }
  gmail: { configured: boolean; connected: boolean; email: string | null }
  lastRun: { finishedAt: string; prepared: number; followUps: number; fresh: number; leadsAdded: number; researched: number; skipped: string[]; notes: string } | null
}

export interface ImportPreview {
  headers: string[]
  mapped: Record<string, string>
  unmapped: string[]
  total: number
  withContact: number
  withEmail: number
  sample: Array<{ line: number; company: { name: string }; contact: { firstName: string; lastName: string; email: string | null } | null }>
  skipped: Array<{ line?: number; reason: string }>
}

export interface ImportResult {
  companiesCreated: number
  companiesUpdated: number
  contactsCreated: number
  contactsUpdated: number
  skipped: Array<{ line?: number; company?: string; reason: string }>
}

export interface SalesSettings {
  dailyCap: number
  sender: { name: string; role: string; story: string; partnerCount: number }
  socialProof: string
  priorityRaces: string[]
}
