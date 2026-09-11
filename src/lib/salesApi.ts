/**
 * Typed client for /api/sales/*. One place that knows the URLs and shapes,
 * so the Sales screens never touch fetch or JSON directly.
 */
import { apiFetch } from '@/lib/api'
import type { Company, Contact, DraftResult, ImportPreview, ImportResult, Mockup, Pipeline, Research, SalesSettings, SalesStatus, Touch, DealStage } from '@/types/sales'

const API_BASE = import.meta.env.VITE_API_URL || ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
  return data as T
}

const post = <T,>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) })

export type ListView = 'due' | 'new' | 'all' | `stage:${DealStage}`

/** Result of mirroring a change out to Notion or ClickUp. */
export interface SyncResult { target: 'notion' | 'clickup' | null; ok: boolean; skipped?: string; error?: string }

export const salesApi = {
  status: () => request<SalesStatus>('/api/sales/draft'),

  list: (opts: { pipeline: Pipeline | 'all'; view: ListView; q?: string }) => {
    const params = new URLSearchParams({ pipeline: opts.pipeline, view: opts.view })
    if (opts.q) params.set('q', opts.q)
    return request<{ companies: Company[]; counts: { due: number; new: number; total: number } }>(`/api/sales/companies?${params}`)
  },

  company: (id: string) => request<{ company: Company }>(`/api/sales/companies?id=${encodeURIComponent(id)}`),

  create: (body: { pipeline: Pipeline; name: string; contact?: Partial<Contact> } & Partial<Company>) =>
    post<{ company: Company }>('/api/sales/companies', { action: 'create', ...body }),

  update: (id: string, fields: Partial<Company>) =>
    post<{ company: Company }>('/api/sales/companies', { action: 'update', id, ...fields }),

  setStage: (id: string, stage: DealStage) =>
    post<{ company: Company; sync?: SyncResult }>('/api/sales/companies', { action: 'stage', id, stage }),

  addNote: (id: string, text: string, contactId?: string) =>
    post<{ touch: Touch }>('/api/sales/companies', { action: 'note', id, text, contactId }),

  saveContact: (companyId: string, contact: Partial<Contact> & { id?: string }) =>
    post<{ contact: Contact }>('/api/sales/companies', { action: 'contact', companyId, ...contact }),

  markSent: (id: string) =>
    post<{ company: Company; sync?: SyncResult }>('/api/sales/companies', { action: 'mark-sent', id }),

  remove: (id: string) => request<{ success: true }>('/api/sales/companies', { method: 'DELETE', body: JSON.stringify({ id }) }),

  research: (contactId: string, force = false) =>
    post<{ contact: Contact; research: Research; cached: boolean }>('/api/sales/research', { contactId, force }),

  /** `useTemplate` asks for the cadence copy even when a model is available. */
  variants: (companyId: string, contactId?: string, useTemplate = false, force = false) =>
    post<DraftResult>('/api/sales/draft', { action: 'variants', companyId, contactId, useTemplate, force }),

  queue: (body: { companyId: string; contactId: string; subject: string; body: string; mockupId?: string }) =>
    post<{ touch: Touch; gmailDraft: boolean; gmailConnected: boolean; mockup: { id: string; name: string } | null }>('/api/sales/draft', { action: 'queue', ...body }),

  mockups: (companyId?: string) =>
    request<{ configured: boolean; mockups: Mockup[]; selectedId: string | null }>(
      `/api/sales/mockups${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''}`),

  uploadMockup: (file: { filename: string; contentType: string; data: string }) =>
    post<{ mockup: Mockup }>('/api/sales/mockups', { action: 'upload', ...file }),

  deleteMockup: (id: string) => post<{ success: true }>('/api/sales/mockups', { action: 'delete', id }),

  importPreview: (csv: string, pipeline: Pipeline) =>
    post<ImportPreview>('/api/sales/import', { csv, pipeline, dryRun: true }),

  importRun: (csv: string, pipeline: Pipeline, overwrite = false) =>
    post<ImportResult>('/api/sales/import', { csv, pipeline, overwrite }),

  settings: () => request<{ settings: SalesSettings; defaults: SalesSettings }>('/api/sales/settings'),
  saveSettings: (patch: Partial<SalesSettings>) => post<{ settings: SalesSettings }>('/api/sales/settings', patch),

  gmailDisconnect: () => post<{ success: true }>('/api/sales/gmail', { action: 'disconnect' }),
  gmailConnectUrl: `${API_BASE}/api/sales/gmail?action=connect`,
}
