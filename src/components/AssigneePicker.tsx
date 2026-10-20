import { useEffect, useRef, useState } from 'react'
import { Check, UserRound } from 'lucide-react'
import { colorFor, setTeamColors } from '@/lib/teamColors'

/**
 * Who has this order, as a person rather than a dropdown: an initial in a
 * colored circle and a full name. Click to hand it to someone else.
 */
export type Teammate = { id: string; firstName: string; lastName: string }

export function Avatar({ user, size = 24 }: { user: Teammate; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-white font-semibold shrink-0"
      style={{ width: size, height: size, backgroundColor: colorFor(user.id), fontSize: Math.round(size * 0.46) }}
      aria-hidden
    >
      {(user.firstName || '?').charAt(0).toUpperCase()}
    </span>
  )
}

export default function AssigneePicker({ team, value, meId, onChange, readOnly = false, readOnlyReason, firstNameOnly = false }: {
  team: Teammate[]
  /** Just "Matt", for a tight header. */
  firstNameOnly?: boolean
  value: string | null
  meId?: string | null
  onChange: (id: string | null) => void
  /** Shows who has it without letting this person change it. */
  readOnly?: boolean
  readOnlyReason?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = team.find(u => u.id === value) || null
  setTeamColors(team)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  const pick = (id: string | null) => { setOpen(false); if (id !== value) onChange(id) }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => { if (!readOnly) setOpen(o => !o) }}
        className={`inline-flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors ${readOnly ? 'cursor-default' : 'hover:bg-off-black/5'}`}
        title={readOnly ? (readOnlyReason || 'Who is fulfilling this order') : 'Who is fulfilling this order'}
      >
        <UserRound className="w-4 h-4 text-off-black/40" />
        {current ? (
          <>
            <Avatar user={current} />
            <span className="text-sm font-medium text-off-black">{firstNameOnly ? current.firstName : `${current.firstName} ${current.lastName}`}</span>
          </>
        ) : (
          <span className="text-sm text-off-black/40">Unassigned</span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-56 bg-white border border-border-gray rounded-lg shadow-lg py-1">
          {team.map(u => (
            <button key={u.id} type="button" onClick={() => pick(u.id)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-subtle-gray">
              <Avatar user={u} size={22} />
              <span className="flex-1 truncate">{u.firstName} {u.lastName}{u.id === meId ? <span className="text-off-black/40"> (me)</span> : null}</span>
              {u.id === value && <Check className="w-4 h-4 text-off-black/50" />}
            </button>
          ))}
          <div className="border-t border-border-gray my-1" />
          <button type="button" onClick={() => pick(null)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-off-black/55 hover:bg-subtle-gray">
            <span className="w-[22px] h-[22px] rounded-full border border-dashed border-off-black/25" />
            <span className="flex-1">Unassigned</span>
            {!value && <Check className="w-4 h-4 text-off-black/50" />}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * "Current Team": who new orders in this view go to today. The regular, plus
 * anyone helping on a shift (with their last day). Admins also see each
 * person's share and open count. Set in Settings > Admin > Order Assignment.
 */
export type QueueMember = { userId: string; regular: boolean; until: string | null; share?: number; open?: number; races?: string[]; holding?: boolean }

export function QueuePill({ people, team, selected, onSelect }: {
  people?: QueueMember[]
  team: Teammate[]
  /** Admin: the teammate whose orders are showing; clicking a chip toggles it. */
  selected?: string
  onSelect?: (userId: string) => void
}) {
  const shown = (people || []).map(p => ({ ...p, user: team.find(u => u.id === p.userId) })).filter(p => p.user)
  if (!shown.length) return null
  const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return (
    <div className="hidden md:flex flex-col items-end gap-1 whitespace-nowrap">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-off-black/40">Current Team</span>
      <div className="flex items-center gap-1.5">
        {shown.map(p => {
          // Each person's share of the open queue, so the split reads at a glance
          // and the chips add up to 100%. (Admins only: counts are theirs.)
          const totalOpen = shown.reduce((n, x) => n + (x.open || 0), 0)
          const facts = [
            shown.length > 1 && totalOpen > 0 && p.open != null ? `${Math.round(((p.open || 0) / totalOpen) * 100)}%` : null,
            p.open != null ? `${p.open} order${p.open === 1 ? '' : 's'}` : null,
          ].filter(Boolean).join(' · ')
          return (
            <span
              key={p.userId}
              onClick={onSelect ? () => onSelect(p.userId) : undefined}
              className={`inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border text-xs ${selected === p.userId ? 'border-off-black bg-off-black/5' : 'border-border-gray bg-white'} ${onSelect ? 'cursor-pointer hover:border-off-black/40' : ''}`}
              title={[
                p.races?.length ? `All ${p.races.join(' and ')} orders` : null,
                p.until ? `Helping until ${day(p.until)}` : p.regular ? 'Regular: everything else' : p.holding ? 'Assigned by hand (not getting new orders)' : null,
              ].filter(Boolean).join(' · ')}
            >
              <Avatar user={p.user!} size={20} />
              <span className="font-medium text-off-black">{p.user!.firstName}</span>
              {p.races?.length ? <span className="text-off-black/60">{p.races.map(r => r.replace(/ Marathon$/, '')).join(', ')}</span> : null}
              {facts && <span className="text-off-black/45">{facts}</span>}
            </span>
          )
        })}
      </div>
    </div>
  )
}

/**
 * "Team Member" filter above the order lists: whose orders are showing, as a
 * name with its avatar. '' is everyone, 'none' is unassigned.
 */
export function PersonFilter({ team, value, meId, onChange }: {
  team: Teammate[]
  value: string
  meId?: string | null
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  setTeamColors(team)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  const current = team.find(u => u.id === value) || null
  const pick = (v: string) => { setOpen(false); onChange(v) }
  const row = 'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-subtle-gray'
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 pl-3 md:pl-4 pr-9 py-2.5 md:py-3 bg-subtle-gray border border-border-gray rounded-md text-sm text-off-black text-left focus:outline-none focus:ring-2 focus:ring-off-black/10"
      >
        {current ? <><Avatar user={current} size={20} /><span className="truncate">{current.firstName} {current.lastName}</span></>
          : <span className="truncate">{value === 'none' ? 'Unassigned' : 'Everyone'}</span>}
        <svg className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-off-black/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 min-w-[200px] bg-white border border-border-gray rounded-lg shadow-lg py-1">
          {team.map(u => (
            <button key={u.id} type="button" onClick={() => pick(u.id)} className={row}>
              <Avatar user={u} size={22} />
              <span className="flex-1 truncate">{u.firstName} {u.lastName}{u.id === meId ? <span className="text-off-black/40"> (me)</span> : null}</span>
              {u.id === value && <Check className="w-4 h-4 text-off-black/50" />}
            </button>
          ))}
          <div className="border-t border-border-gray my-1" />
          <button type="button" onClick={() => pick('')} className={row}>
            <span className="flex-1">Everyone</span>{!value && <Check className="w-4 h-4 text-off-black/50" />}
          </button>
          <button type="button" onClick={() => pick('none')} className={row}>
            <span className="w-[22px] h-[22px] rounded-full border border-dashed border-off-black/25" />
            <span className="flex-1">Unassigned</span>{value === 'none' && <Check className="w-4 h-4 text-off-black/50" />}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Team grid on Standard Orders: one row per person with what they sent to
 * production in the last 24 hours (who pressed the button) and the orders
 * still left for them to fulfill, plus a total row when there is more than
 * one person. Clicking a person shows only their orders.
 */
export function TeamPanel({ team, sent, toApprove, selected, onSelect }: {
  team: Teammate[]
  sent: { name: string; count: number }[] | null
  toApprove: { userId: string; count: number }[]
  selected?: string
  onSelect?: (userId: string) => void
}) {
  type Row = { key: string; user?: Teammate; name: string; userId?: string; sent: number; left: number }
  const rows: Row[] = []
  for (const p of toApprove) {
    const user = team.find(u => u.id === p.userId)
    rows.push({ key: `u-${p.userId}`, user, name: user?.firstName || 'Unassigned', userId: user ? p.userId : undefined, sent: 0, left: p.count })
  }
  for (const p of sent || []) {
    const row = rows.find(r => r.name === p.name)
    if (row) row.sent += p.count
    else rows.push({ key: `s-${p.name}`, user: team.find(u => u.firstName === p.name), name: p.name, sent: p.count, left: 0 })
  }
  const sentTotal = rows.reduce((n, r) => n + r.sent, 0)
  const leftTotal = rows.reduce((n, r) => n + r.left, 0)
  const num = 'text-right tabular-nums'
  return (
    <table className="hidden md:table text-xs whitespace-nowrap border-separate border-spacing-x-0 border-spacing-y-0.5">
      <thead>
        <tr className="text-[11px] text-off-black/50">
          <th />
          <th className="font-normal text-right pl-4">Sent to production in last 24h</th>
          <th className="font-normal text-right pl-4">Orders still left to fulfill</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const active = !!r.userId && selected === r.userId
          const click = onSelect && r.userId ? () => onSelect(r.userId!) : undefined
          return (
            <tr key={r.key} onClick={click} className={`${click ? 'cursor-pointer hover:bg-off-black/5' : ''} ${active ? 'bg-off-black/5' : ''}`}>
              <td className="py-0.5 pr-2 rounded-l-md">
                <span className="inline-flex items-center gap-1.5 pl-1">
                  {r.user ? <Avatar user={r.user} size={18} /> : <span className="w-[18px]" />}
                  <span className={active ? 'font-semibold text-off-black' : 'text-off-black/70'}>{r.name}</span>
                </span>
              </td>
              <td className={`${num} pl-4 font-semibold text-off-black`}>{r.sent}</td>
              <td className={`${num} pl-4 pr-1 font-semibold text-off-black rounded-r-md`}>{r.left}</td>
            </tr>
          )
        })}
        {rows.length > 1 && (
          <tr className="text-off-black">
            <td className="pt-1 pl-1 border-t border-border-gray text-off-black/50">Total</td>
            <td className={`${num} pt-1 pl-4 border-t border-border-gray text-sm font-semibold`}>{sentTotal}</td>
            <td className={`${num} pt-1 pl-4 pr-1 border-t border-border-gray text-sm font-semibold`}>{leftTotal}</td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
