/**
 * Typed client for /api/support/*. One place that knows the URLs and the
 * shapes, so the Support screens never touch fetch or JSON directly.
 */
import { apiFetch } from '@/lib/api'
import type { SenderFilter, BackfillResult, InboxPayload, InboxSort, InboxView, InstagramBackfillResult, InstagramStatus, Macro, MailboxStatus, Note, SyncResult, ThreadDetail, ThreadRow, ThreadStatus } from '@/types/support'

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
const act = <T,>(id: string, action: string, extra: Record<string, unknown> = {}) => post<T>('/api/support/thread', { id, action, ...extra })

export const supportApi = {
  status: () => request<MailboxStatus>('/api/support/gmail?action=status'),
  connectUrl: `${API_BASE}/api/support/gmail?action=connect`,
  disconnect: () => post<{ success: boolean }>('/api/support/gmail', { action: 'disconnect' }),
  sync: () => post<SyncResult>('/api/support/sync', {}),
  backfill: () => post<BackfillResult>('/api/support/backfill', {}),
  // Instagram: the @trackstar_art connection. DMs arrive by webhook; there is no sync to call.
  instagramStatus: () => request<InstagramStatus>('/api/support/instagram?action=status'),
  instagramConnectUrl: `${API_BASE}/api/support/instagram?action=connect`,
  instagramToken: (accessToken: string) => post<{ success: boolean; username: string }>('/api/support/instagram', { action: 'token', accessToken }),
  instagramBackfill: () => post<InstagramBackfillResult>('/api/support/instagram', { action: 'backfill' }),
  instagramDisconnect: () => post<{ success: boolean }>('/api/support/instagram', { action: 'disconnect' }),
  inbox: (view: InboxView, sort: InboxSort, q = '') => request<InboxPayload>(`/api/support/threads?view=${encodeURIComponent(view)}&sort=${sort}&q=${encodeURIComponent(q)}`),
  thread: (id: string) => request<ThreadDetail>(`/api/support/thread?id=${encodeURIComponent(id)}`),
  assign: (id: string, assigneeId: string | null) => act<ThreadRow>(id, 'assign', { assigneeId }),
  setStatus: (id: string, status: ThreadStatus) => act<ThreadRow>(id, 'status', { status }),
  snooze: (id: string, until: string | null) => act<ThreadRow>(id, 'snooze', { until }),
  setPriority: (id: string, priority: boolean) => act<ThreadRow>(id, 'priority', { priority }),
  setTags: (id: string, tags: string[]) => act<ThreadRow>(id, 'tags', { tags }),
  addNote: (id: string, body: string, mentions: string[]) => act<Note>(id, 'note', { body, mentions }),
  deleteNote: (id: string, noteId: string) => act<{ id: string }>(id, 'deleteNote', { noteId }),
  markUnread: (id: string) => act<{ ok: boolean }>(id, 'unread'),
  reply: (id: string, text: string, close = false, attachments: string[] = []) => post<ThreadDetail>('/api/support/reply', { id, text, close, attachments }),
  settings: () => request<{ defaultAssigneeId: string | null; playbook?: { text: string; edited: boolean; updatedAt: string | null } }>('/api/support/settings'),
  savePlaybook: (text: string) => post<{ playbook: { text: string; edited: boolean } }>('/api/support/settings', { action: 'playbook', text }),
  resetPlaybook: () => post<{ playbook: { text: string; edited: boolean } }>('/api/support/settings', { action: 'playbookReset' }),
  redraft: (id: string, instruction: string) => act<Note>(id, 'redraft', { instruction }),
  saveSettings: (defaultAssigneeId: string | null, applyToOpen = false) => post<{ defaultAssigneeId: string | null; assigned: number }>('/api/support/settings', { defaultAssigneeId, applyToOpen }),
  filters: () => request<{ filters: SenderFilter[] }>('/api/support/filters'),
  addFilter: (pattern: string) => post<{ pattern: string; filed: number; filters: SenderFilter[] }>('/api/support/filters', { action: 'add', pattern }),
  removeFilter: (pattern: string) => post<{ pattern: string; restored: number; filters: SenderFilter[] }>('/api/support/filters', { action: 'remove', pattern }),
  macros: () => request<{ macros: Macro[] }>('/api/support/macros'),
  /** The quick actions beside a conversation (server/domain/support/actions.js). */
  action: <T = Record<string, unknown>,>(action: string, body: Record<string, unknown>) => post<T>('/api/support/actions', { action, ...body }),
  saveMacro: (m: { id?: string; name: string; shortcut?: string; body: string }) => post<Macro>('/api/support/macros', { action: 'save', ...m }),
  deleteMacro: (id: string) => post<{ id: string }>('/api/support/macros', { action: 'delete', id }),
  useMacro: (id: string) => post<{ ok: boolean }>('/api/support/macros', { action: 'use', id }),
}
