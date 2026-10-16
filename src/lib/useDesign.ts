import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

/** State for the open order's automated print. Read by the pieces in components/DesignPanel.tsx. */

export type Job = {
  id: string; version: number; status: 'queued' | 'rendering' | 'done' | 'failed'; requestedBy: 'admin' | 'system' | 'customer'
  spec: { file: string; name: string; bib: string; time: string | null; pace: string | null; date: string; condition: string; temp: string; size: string; noTime: boolean; photoPath: string | null; dateSource?: string | null; dateSourceUrl?: string | null; template?: string | null }
  notes: string | null; error: string | null; createdAt: string; finishedAt: string | null
  review: 'pending' | 'approved' | 'rejected'; reviewNote: string | null; reviewer: string | null; reviewedAt: string | null
  deliveredAt: string | null; deliveredPath: string | null; deliveryError: string | null
  pdfUrl: string | null; previewUrl: string | null
}
type State = { eligible: boolean; reasons: string[]; job: Job | null; workersOnline: string[] }

async function post(body: Record<string, unknown>) {
  const res = await apiFetch('/api/render/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

export type Design = ReturnType<typeof useDesign>

/** Everything the design pieces read. Pass null for an order that has no automated print. */
export function useDesign(orderId: string | null, canManage: boolean) {
  const [state, setState] = useState<State | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!orderId) return
    try {
      const res = await apiFetch(`/api/render/jobs?orderId=${encodeURIComponent(orderId)}`)
      if (res.ok) setState(await res.json())
    } catch { /* leave what we have */ }
  }, [orderId])

  useEffect(() => { setState(null); setErr(null); load() }, [load])

  // While a render is in flight, ask again every few seconds.
  const inFlight = state?.job && (state.job.status === 'queued' || state.job.status === 'rendering')
  useEffect(() => {
    if (!inFlight) return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [inFlight, load])

  const create = async () => {
    setBusy(true); setErr(null)
    try { await post({ action: 'create', orderId }); await load() } catch (e) { setErr(e instanceof Error ? e.message : 'Could not start') } finally { setBusy(false) }
  }
  const review = async (decision: 'approved' | 'rejected', note?: string) => {
    if (!state?.job) return false
    setBusy(true); setErr(null)
    try { await post({ action: 'review', jobId: state.job.id, decision, note }); await load(); return true }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save'); return false } finally { setBusy(false) }
  }

  const job = state?.job || null
  // People without orders.render only ever see an approved print.
  const visible = Boolean(orderId && state && (canManage || job?.review === 'approved'))
  return { state, job, busy, err, create, review, canManage, visible, offline: !state || state.workersOnline.length === 0 }
}

