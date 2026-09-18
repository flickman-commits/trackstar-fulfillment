/**
 * Typed client for /api/sales/*. One place that knows the URLs and shapes,
 * so the Sales screens never touch fetch or JSON directly.
 */
import { apiFetch } from '@/lib/api'
import type { Asset, AttioCheck, Deal, DraftResult, Motion, Progress, SalesSettings, SalesStatus, Sender, Stage, TodayPayload } from '@/types/sales'

const API_BASE = import.meta.env.VITE_API_URL || ''

export class SalesApiError extends Error {
  code?: string
  problems?: string[]
  constructor(message: string, code?: string, problems?: string[]) { super(message); this.code = code; this.problems = problems }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const d = data as { error?: string; code?: string; problems?: string[] }
    throw new SalesApiError(d.error || `Request failed (${res.status})`, d.code, d.problems)
  }
  return data as T
}

const post = <T,>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) })

/** After a send: whether Attio now agrees. */
export interface SyncResult { ok: boolean; skipped?: string; error?: string }

export const salesApi = {
  status: () => request<SalesStatus>('/api/sales/draft'),

  /** The morning in one call. */
  today: (opts: { scope?: 'mine' | 'all'; motion?: Motion | null; refresh?: boolean } = {}) => {
    const params = new URLSearchParams({ scope: opts.scope || 'mine' })
    if (opts.motion) params.set('motion', opts.motion)
    if (opts.refresh) params.set('refresh', '1')
    return request<TodayPayload>(`/api/sales/today?${params}`)
  },
  deal: (id: string, refresh = false) => request<{ deal: Deal }>(`/api/sales/today?action=deal&id=${encodeURIComponent(id)}${refresh ? '&refresh=1' : ''}`),
  progress: (scope: 'mine' | 'all' = 'mine') => request<Progress>(`/api/sales/today?action=progress&scope=${scope}`),
  skip: (id: string, reason?: string) => post<{ success: true; until: string }>('/api/sales/today', { action: 'skip', id, reason }),
  unskip: (id: string) => post<{ success: true }>('/api/sales/today', { action: 'unskip', id }),
  setStage: (id: string, stage: Stage) => post<{ deal: Deal; stage: string }>('/api/sales/today', { action: 'stage', id, stage }),
  addNote: (id: string, text: string) => post<{ success: true }>('/api/sales/today', { action: 'note', id, text }),

  /** `useTemplate` asks for the cadence copy even when a model is available. */
  variants: (dealId: string, personId?: string | null, useTemplate = false, force = false) =>
    post<DraftResult>('/api/sales/draft', { action: 'variants', dealId, personId: personId || undefined, useTemplate, force }),
  check: (body: { dealId: string; subject: string; body: string }) =>
    post<{ touchNumber: number; problems: string[] }>('/api/sales/draft', { action: 'check', ...body }),
  revise: (body: { dealId: string; subject: string; body: string; instruction: string }) =>
    post<{ subject: string; body: string; model: string }>('/api/sales/draft', { action: 'revise', ...body }),
  /** Sends through the connected Gmail. Final; the undo window is the caller's. */
  send: (body: { dealId: string; personId: string; subject: string; body: string; assetIds: string[] }) =>
    post<{ send: { id: string; touchNumber: number; sentAt: string; gmailThreadId: string | null }; attached: string[]; sync: SyncResult }>('/api/sales/draft', { action: 'send', ...body }),

  assets: (dealId?: string, refresh = false) => {
    const params = new URLSearchParams()
    if (dealId) params.set('dealId', dealId)
    if (refresh) params.set('refresh', '1')
    return request<{ configured: boolean; assets: Asset[]; suggestedId: string | null }>(`/api/sales/assets${params.size ? `?${params}` : ''}`)
  },
  /**
   * Upload straight to storage: ask for a signed URL, then PUT the bytes
   * there. The server never sees the file, so decks can be as big as
   * storage allows.
   */
  uploadAsset: async (file: File, onProgress?: (fraction: number) => void) => {
    const { url, id, maxBytes } = await post<{ id: string; filename: string; url: string; token: string; maxBytes: number }>('/api/sales/assets', { action: 'upload-url', filename: file.name, contentType: file.type })
    if (file.size > maxBytes) throw new Error(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${Math.round(maxBytes / 1024 / 1024)} MB.`)
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', url)
      xhr.setRequestHeader('Content-Type', file.type)
      xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total) }
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)))
      xhr.onerror = () => reject(new Error('Upload failed'))
      xhr.send(file)
    })
    return id
  },
  deleteAsset: (id: string) => post<{ success: true }>('/api/sales/assets', { action: 'delete', id }),

  settings: () => request<{ settings: SalesSettings; defaults: SalesSettings; sender: Sender }>('/api/sales/settings'),
  checkAttio: () => request<{ attio: AttioCheck }>('/api/sales/settings?action=check'),
  saveSettings: (patch: Partial<SalesSettings>) => post<{ settings: SalesSettings }>('/api/sales/settings', patch),
  saveSender: (patch: Partial<Sender>) => post<{ sender: Sender }>('/api/sales/settings', { action: 'sender', ...patch }),

  gmailDisconnect: () => post<{ success: true }>('/api/sales/gmail', { action: 'disconnect' }),
  gmailConnectUrl: `${API_BASE}/api/sales/gmail?action=connect`,
}
