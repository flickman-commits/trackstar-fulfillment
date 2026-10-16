/**
 * Typed client for /api/support/*. One place that knows the URLs and the
 * shapes, so the Support screens never touch fetch or JSON directly.
 */
import { apiFetch } from '@/lib/api'
import type { BackfillResult, InboxPayload, InboxView, MailboxStatus, SyncResult, ThreadDetail, ThreadRow, ThreadStatus } from '@/types/support'

const API_BASE = import.meta.env.VITE_API_URL || ''

export class SupportApiError extends Error {
  code?: string
  constructor(message: string, code?: string) { super(message); this.code = code }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`${API_BASE}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const d = data as { error?: string; code?: string }
    throw new SupportApiError(d.error || `Request failed (${res.status})`, d.code)
  }
  return data as T
}
const post = <T,>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) })

export const supportApi = {
  status: () => request<MailboxStatus>('/api/support/gmail?action=status'),
  connectUrl: `${API_BASE}/api/support/gmail?action=connect`,
  disconnect: () => post<{ success: boolean }>('/api/support/gmail', { action: 'disconnect' }),
  sync: () => post<SyncResult>('/api/support/sync', {}),
  backfill: () => post<BackfillResult>('/api/support/backfill', {}),
  inbox: (view: InboxView, q = '') => request<InboxPayload>(`/api/support/threads?view=${view}&q=${encodeURIComponent(q)}`),
  thread: (id: string) => request<ThreadDetail>(`/api/support/thread?id=${encodeURIComponent(id)}`),
  assign: (id: string, assigneeId: string | null) => post<ThreadRow>('/api/support/thread', { id, action: 'assign', assigneeId }),
  setStatus: (id: string, status: ThreadStatus) => post<ThreadRow>('/api/support/thread', { id, action: 'status', status }),
  snooze: (id: string, until: string | null) => post<ThreadRow>('/api/support/thread', { id, action: 'snooze', until }),
  reply: (id: string, text: string) => post<ThreadDetail>('/api/support/reply', { id, text }),
}
