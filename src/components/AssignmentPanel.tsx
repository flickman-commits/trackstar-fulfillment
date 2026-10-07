import { useCallback, useEffect, useState } from 'react'
import { Loader2, Check, Plus, X, Shuffle } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { btnPrimary, btnSecondary, btnGhost, inputBase, fieldLabel, segment, segmentGroup } from '@/lib/ui'

/**
 * Who new orders go to. Admin only: this decides where every future order
 * lands.
 *
 * Each type has a regular person. For a busy stretch, add help: a teammate,
 * the days, and their share. While a shift is on, each new order goes to
 * whoever is furthest below their share of the open queue; when it ends the
 * helper's unfinished orders go back to the regular. "Spread the queue" hands
 * a helper their share of what is already waiting. Server side:
 * server/domain/orders/assignment.js.
 */
type User = { id: string; firstName: string; lastName: string }
type OrderType = 'standard' | 'custom' | 'race_partner' | 'bulk'
type Shift = { id: string; type: OrderType; userId: string; weight: number; from: string; until: string; handedBackAt?: string }

// Help shifts are for the two queues; partners and bulk runs are projects
// with one owner each, so they only have a regular.
const TYPES: { key: OrderType; label: string; blurb: string; help: boolean }[] = [
  { key: 'standard', label: 'Standard orders', blurb: 'Personalized prints from the storefront and Etsy', help: true },
  { key: 'custom', label: 'Custom orders', blurb: 'Any-race and triathlon custom designs', help: true },
  { key: 'race_partner', label: 'Partner orders', blurb: 'Race partner design projects', help: false },
  { key: 'bulk', label: 'Bulk orders', blurb: 'Prepaid co-branded runs for a race', help: false },
]
const SHARES: { weight: number; label: string }[] = [
  { weight: 0.5, label: 'Half' },
  { weight: 1, label: 'Even' },
  { weight: 2, label: 'Double' },
]
const shareWord = (w: number) => SHARES.find(s => s.weight === w)?.label.toLowerCase() || `${w}x`

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function fmt(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export default function AssignmentPanel() {
  const [users, setUsers] = useState<User[] | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Record<string, string>>({})
  const [shifts, setShifts] = useState<Shift[]>([])
  const [open, setOpen] = useState<Partial<Record<OrderType, Record<string, number>>>>({})
  const [today, setToday] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState<OrderType | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await apiFetch('/api/orders/assign').then(r => r.json())
      setUsers(d.users || [])
      setDraft(d.defaults || {})
      setSaved(d.defaults || {})
      setShifts(d.shifts || [])
      setOpen(d.open || {})
      setToday(d.today || new Date().toISOString().slice(0, 10))
    } catch {
      toast.error('Could not load the team.')
    }
  }, [])
  useEffect(() => { load() }, [load])

  const post = async (key: string, body: Record<string, unknown>) => {
    setBusy(key)
    try {
      const res = await apiFetch('/api/orders/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not save')
      return d
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
      return null
    } finally {
      setBusy(null)
    }
  }

  const dirty = TYPES.some(t => (draft[t.key] || '') !== (saved[t.key] || ''))
  const saveRegulars = async () => {
    const d = await post('regulars', { action: 'defaults', ...draft })
    if (d) { setSaved(d.defaults); setDraft(d.defaults); toast.success('Saved. New orders go to these people from now on.') }
  }

  if (!users) return <div className="flex justify-center py-10 text-off-black/40"><Loader2 className="w-5 h-5 animate-spin" /></div>
  const name = (id: string) => users.find(u => u.id === id)?.firstName || 'Someone'

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-off-black/60">
        Every new order goes to one person when it comes in. For a busy stretch, add help: they share new orders with the regular for the days you pick, and anything they have not finished goes back to the regular when it ends.
      </p>

      {TYPES.map(t => {
        const regular = saved[t.key] || ''
        const mine = shifts.filter(s => s.type === t.key && !s.handedBackAt && s.until >= today)
          .sort((a, b) => a.from.localeCompare(b.from))
        const onNow = mine.filter(s => s.from <= today)
        const roster = [
          ...(regular ? [{ userId: regular, weight: 1 }] : []),
          ...onNow.filter(s => s.userId !== regular).map(s => ({ userId: s.userId, weight: s.weight })),
        ]
        const weightSum = roster.reduce((a, r) => a + r.weight, 0)
        return (
          <div key={t.key} className="border border-border-gray rounded-lg">
            <div className="flex items-center justify-between gap-4 p-3">
              <div>
                <div className="text-sm font-semibold text-off-black">{t.label}</div>
                <div className="text-xs text-off-black/50">{t.blurb}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-off-black/45">Regular</span>
                <select value={draft[t.key] || ''} onChange={e => setDraft(d => ({ ...d, [t.key]: e.target.value }))} className={`${inputBase} w-44`}>
                  <option value="">Nobody</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                </select>
              </div>
            </div>

            {t.help && <div className="border-t border-border-gray px-3 py-2.5 space-y-2 bg-subtle-gray/50">
              {roster.length > 1 && (
                <div className="text-xs text-off-black/60">
                  Today new orders split{' '}
                  {roster.map((r, i) => (
                    <span key={r.userId}>
                      {i > 0 && ' · '}
                      <span className="font-medium text-off-black">{name(r.userId)} {Math.round((r.weight / weightSum) * 100)}%</span>
                      <span className="text-off-black/40"> ({open[t.key]?.[r.userId] || 0} open)</span>
                    </span>
                  ))}
                </div>
              )}

              {mine.map(s => {
                const on = s.from <= today
                return (
                  <div key={s.id} className="flex items-center justify-between gap-3 bg-white border border-border-gray rounded-md px-3 py-2">
                    <div className="text-xs">
                      <span className="font-medium text-off-black">{name(s.userId)}</span>
                      <span className="text-off-black/55"> · {shareWord(s.weight)} share · {fmt(s.from)} to {fmt(s.until)}</span>
                      <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${on ? 'bg-green-50 text-green-700' : 'bg-off-black/5 text-off-black/50'}`}>
                        {on ? 'On now' : `Starts ${fmt(s.from)}`}
                      </span>
                      {on && <span className="text-off-black/40"> · {open[t.key]?.[s.userId] || 0} open</span>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {on && (
                        <button
                          className={btnSecondary}
                          disabled={busy === `spread-${s.id}`}
                          title="Move unstarted orders from the queue to them, up to their share"
                          onClick={async () => {
                            const d = await post(`spread-${s.id}`, { action: 'spread', id: s.id })
                            if (d) { toast.success(d.moved ? `${d.moved} waiting order${d.moved === 1 ? '' : 's'} moved to ${name(s.userId)}` : `${name(s.userId)} already has their share`); load() }
                          }}
                        >
                          {busy === `spread-${s.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shuffle className="w-3 h-3" />} Spread the queue
                        </button>
                      )}
                      <button
                        className={btnGhost}
                        disabled={busy === `end-${s.id}`}
                        title={on ? 'End now: their unfinished orders go back to the regular' : 'Cancel this shift'}
                        onClick={async () => {
                          const d = await post(`end-${s.id}`, { action: 'end-shift', id: s.id })
                          if (d) { toast.success(on ? `Ended. ${d.handedBack} unfinished order${d.handedBack === 1 ? '' : 's'} back to ${name(regular)}` : 'Shift cancelled'); load() }
                        }}
                      >
                        <X className="w-3 h-3" /> {on ? 'End' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                )
              })}

              {adding === t.key ? (
                <AddHelp
                  users={users.filter(u => u.id !== regular)}
                  today={today}
                  busy={busy === `add-${t.key}`}
                  onCancel={() => setAdding(null)}
                  onAdd={async (v) => {
                    const d = await post(`add-${t.key}`, { action: 'add-shift', type: t.key, ...v })
                    if (d) {
                      setAdding(null)
                      await load()
                      toast.success(d.shift.from <= today
                        ? `${name(v.userId)} is on. Use Spread the queue to give them some of what is waiting.`
                        : `${name(v.userId)} starts ${fmt(d.shift.from)}`)
                    }
                  }}
                />
              ) : (
                <button className={btnGhost} onClick={() => setAdding(t.key)} disabled={!regular}>
                  <Plus className="w-3 h-3" /> Add help
                </button>
              )}
            </div>}
          </div>
        )
      })}

      <div className="flex items-center gap-3">
        <button onClick={saveRegulars} disabled={!dirty || busy === 'regulars'} className={btnPrimary}>
          {busy === 'regulars' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save regulars
        </button>
        <span className="text-xs text-off-black/45">Help is saved as you add it. Someone new? Invite them from People first.</span>
      </div>
    </div>
  )
}

function AddHelp({ users, today, busy, onAdd, onCancel }: {
  users: User[]
  today: string
  busy: boolean
  onAdd: (v: { userId: string; weight: number; from: string; until: string }) => void
  onCancel: () => void
}) {
  const [userId, setUserId] = useState(users[0]?.id || '')
  const [weight, setWeight] = useState(1)
  const [from, setFrom] = useState(today)
  const [until, setUntil] = useState(addDays(today, 6))
  const days = Math.round((new Date(until).getTime() - new Date(from).getTime()) / 86400000) + 1

  return (
    <div className="bg-white border border-border-gray rounded-md p-3 space-y-3">
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div>
          <label className={fieldLabel}>Who</label>
          <select value={userId} onChange={e => setUserId(e.target.value)} className={`${inputBase} w-full`}>
            {users.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
          </select>
        </div>
        <div>
          <label className={fieldLabel}>Their share</label>
          <div className={segmentGroup}>
            {SHARES.map(s => <button key={s.weight} type="button" onClick={() => setWeight(s.weight)} className={segment(weight === s.weight)}>{s.label}</button>)}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={fieldLabel}>First day</label>
          <input type="date" value={from} min={today} onChange={e => { setFrom(e.target.value); if (until < e.target.value) setUntil(e.target.value) }} className={inputBase} />
        </div>
        <div>
          <label className={fieldLabel}>Last day</label>
          <input type="date" value={until} min={from} onChange={e => setUntil(e.target.value)} className={inputBase} />
        </div>
        <div className="flex gap-1 pb-0.5">
          {[3, 7, 14].map(n => (
            <button key={n} type="button" onClick={() => setUntil(addDays(from, n - 1))} className={segment(days === n)}>
              {n === 7 ? '1 week' : n === 14 ? '2 weeks' : `${n} days`}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-off-black/45">
        {weight === 1 ? 'They and the regular each get about half of new orders' : weight === 2 ? 'They get about two of every three new orders' : 'They get about one of every three new orders'}, balanced against what each has open, for {days} day{days === 1 ? '' : 's'}.
      </p>
      <div className="flex items-center gap-2">
        <button className={btnPrimary} disabled={!userId || busy} onClick={() => onAdd({ userId, weight, from, until })}>
          {busy && <Loader2 className="w-3 h-3 animate-spin" />} Add help
        </button>
        <button className={btnSecondary} onClick={onCancel}>Cancel</button>
      </div>
      {!users.length && <p className="text-xs text-amber-700">Nobody else is on the team yet. Invite them from People first.</p>}
    </div>
  )
}
