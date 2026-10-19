import { useEffect, useState } from 'react'
import { Instagram, Loader2, Mail, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { supportApi } from '@/lib/supportApi'
import { segment, segmentGroup, btnSecondary } from '@/lib/ui'
import { Avatar } from '@/components/AssigneePicker'
import type { RoutingRule, RoutingRules as Rules, Teammate } from '@/types/support'

/**
 * Who new conversations go to, a rule per channel, like order assignment:
 * one person, split across several (whoever is furthest below their share
 * of open conversations gets the next one), or nobody. Server side:
 * server/domain/support/routing.js.
 */
const CHANNELS: { key: keyof Rules; label: string; icon: typeof Mail }[] = [
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'instagram', label: 'Instagram DMs', icon: Instagram },
]
const SHARES = [{ weight: 0.5, label: 'Half' }, { weight: 1, label: 'Even' }, { weight: 2, label: 'Double' }]

function RuleEditor({ rule, team, onChange }: { rule: RoutingRule; team: Teammate[]; onChange: (r: RoutingRule) => void }) {
  const [adding, setAdding] = useState('')
  const free = team.filter(u => !rule.people.some(p => p.userId === u.id))
  const setMode = (mode: RoutingRule['mode']) => {
    if (mode === 'none') return onChange({ mode, people: [] })
    if (mode === 'person') return onChange({ mode, people: rule.people.slice(0, 1).length ? rule.people.slice(0, 1) : team[0] ? [{ userId: team[0].id, weight: 1 }] : [] })
    return onChange({ mode, people: rule.people.length ? rule.people : team.slice(0, 2).map(u => ({ userId: u.id, weight: 1 })) })
  }
  return (
    <div className="space-y-2">
      <div className={segmentGroup}>
        {([['person', 'One person'], ['split', 'Split'], ['none', 'Nobody']] as const).map(([m, label]) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={segment(rule.mode === m)}>{label}</button>
        ))}
      </div>
      {rule.mode === 'person' && (
        <select value={rule.people[0]?.userId || ''} onChange={e => onChange({ mode: 'person', people: [{ userId: e.target.value, weight: 1 }] })}
          className="w-full text-xs bg-white border border-border-gray rounded px-1.5 py-1 focus:outline-none">
          {team.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
        </select>
      )}
      {rule.mode === 'split' && (
        <div className="space-y-1.5">
          {rule.people.map(p => {
            const u = team.find(x => x.id === p.userId)
            return (
              <div key={p.userId} className="flex items-center gap-2">
                {u && <Avatar user={u} size={18} />}
                <span className="flex-1 text-xs text-off-black/80 truncate">{u ? `${u.firstName} ${u.lastName}` : 'Someone who left'}</span>
                <div className={segmentGroup}>
                  {SHARES.map(s => <button key={s.weight} type="button" onClick={() => onChange({ ...rule, people: rule.people.map(x => x.userId === p.userId ? { ...x, weight: s.weight } : x) })} className={segment(p.weight === s.weight)}>{s.label}</button>)}
                </div>
                <button type="button" onClick={() => onChange({ ...rule, people: rule.people.filter(x => x.userId !== p.userId) })} className="text-off-black/35 hover:text-off-black" title="Remove"><X className="w-3.5 h-3.5" /></button>
              </div>
            )
          })}
          {free.length > 0 && (
            <div className="flex items-center gap-1.5">
              <select value={adding} onChange={e => setAdding(e.target.value)} className="flex-1 text-xs bg-white border border-border-gray rounded px-1.5 py-1 focus:outline-none">
                <option value="">Add a teammate…</option>
                {free.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
              </select>
              <button type="button" disabled={!adding} onClick={() => { onChange({ ...rule, people: [...rule.people, { userId: adding, weight: 1 }] }); setAdding('') }} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-border-gray bg-white hover:bg-subtle-gray disabled:opacity-50"><Plus className="w-3 h-3" />Add</button>
            </div>
          )}
          <p className="text-[11px] text-off-black/45">Each new one goes to whoever is furthest below their share of open conversations.</p>
        </div>
      )}
      {rule.mode === 'none' && <p className="text-[11px] text-off-black/45">New ones wait in All open for someone to take.</p>}
    </div>
  )
}

export default function RoutingRules({ team, unassignedCount, onChanged }: { team: Teammate[]; unassignedCount: number; onChanged: () => void }) {
  const [saved, setSaved] = useState<Rules | null>(null)
  const [rules, setRules] = useState<Rules | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { supportApi.settings().then(r => { if (r.routing) { setSaved(r.routing); setRules(r.routing) } }).catch(() => {}) }, [])
  if (!rules || !saved) return null
  const dirty = JSON.stringify(rules) !== JSON.stringify(saved)
  const save = async (applyToOpen: boolean) => {
    setBusy(true)
    try {
      const out = await supportApi.saveRouting(rules, applyToOpen)
      setSaved(out.routing); setRules(out.routing)
      toast.success(applyToOpen && out.assigned ? `Saved, and ${out.assigned} open ${out.assigned === 1 ? 'one' : 'ones'} handed out` : 'Routing saved')
      onChanged()
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  return (
    <div className="border-b border-border-gray px-4 py-3 space-y-3">
      <div>
        <div className="text-[12px] font-semibold text-off-black">Routing</div>
        <p className="text-[11px] text-off-black/50">Who new conversations go to as they arrive. History imports stay unassigned.</p>
      </div>
      {CHANNELS.map(c => (
        <div key={c.key} className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-off-black/70"><c.icon className="w-3.5 h-3.5" />{c.label}</div>
          <RuleEditor rule={rules[c.key]} team={team} onChange={r => setRules({ ...rules, [c.key]: r })} />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button disabled={busy || !dirty} onClick={() => save(false)} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-dark-fill text-white hover:bg-off-black/85 disabled:opacity-50">{busy && <Loader2 className="w-3 h-3 animate-spin" />}Save</button>
        {unassignedCount > 0 && <button disabled={busy} onClick={() => save(true)} className={btnSecondary}>Save and hand out the {unassignedCount} open unassigned</button>}
        {dirty && <button disabled={busy} onClick={() => setRules(saved)} className="text-xs text-off-black/45 hover:text-off-black">Undo changes</button>}
      </div>
    </div>
  )
}
