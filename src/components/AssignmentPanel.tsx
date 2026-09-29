import { useEffect, useState } from 'react'
import { Loader2, Check } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { btnPrimary, inputBase } from '@/lib/ui'

/**
 * Who new orders go to. Admin only: this decides where every future order
 * lands. Existing orders keep their assignee; move those from the order.
 */
type User = { id: string; firstName: string; lastName: string }
const TYPES: { key: 'standard' | 'custom'; label: string; blurb: string }[] = [
  { key: 'standard', label: 'Standard orders', blurb: 'Personalized prints from the storefront and Etsy' },
  { key: 'custom', label: 'Custom orders', blurb: 'Any-race and triathlon custom designs' },
]

export default function AssignmentPanel() {
  const [users, setUsers] = useState<User[] | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    apiFetch('/api/orders/assign').then(r => r.json()).then(d => {
      setUsers(d.users || [])
      setDraft(d.defaults || {})
      setSaved(d.defaults || {})
    }).catch(() => setMsg({ ok: false, text: 'Could not load the team.' }))
  }, [])

  const dirty = TYPES.some(t => (draft[t.key] || '') !== (saved[t.key] || ''))

  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      const res = await apiFetch('/api/orders/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'defaults', ...draft }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not save')
      setSaved(d.defaults); setDraft(d.defaults)
      setMsg({ ok: true, text: 'Saved. New orders go to these people from now on.' })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not save' })
    } finally { setBusy(false) }
  }

  if (!users) return <div className="flex justify-center py-10 text-off-black/40"><Loader2 className="w-5 h-5 animate-spin" /></div>

  return (
    <div className="space-y-4 max-w-lg">
      <p className="text-sm text-off-black/60">Every new order is assigned to one person when it comes in. Orders already in the queue keep their assignee; reassign those from the order itself.</p>
      {TYPES.map(t => (
        <div key={t.key} className="flex items-center justify-between gap-4 border border-border-gray rounded-lg p-3">
          <div>
            <div className="text-sm font-semibold text-off-black">{t.label}</div>
            <div className="text-xs text-off-black/50">{t.blurb}</div>
          </div>
          <select value={draft[t.key] || ''} onChange={e => setDraft(d => ({ ...d, [t.key]: e.target.value }))} className={`${inputBase} w-44`}>
            <option value="">Nobody</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
          </select>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={!dirty || busy} className={btnPrimary}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save</button>
        {msg && <span className={`text-xs ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</span>}
      </div>
    </div>
  )
}
