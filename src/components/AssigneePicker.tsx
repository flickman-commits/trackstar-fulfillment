import { useEffect, useRef, useState } from 'react'
import { Check, UserRound } from 'lucide-react'

/**
 * Who has this order, as a person rather than a dropdown: an initial in a
 * colored circle and a full name. Click to hand it to someone else.
 */
export type Teammate = { id: string; firstName: string; lastName: string }

// One color per person, never shared. A hash into a short palette put two
// people on the same color (Creed and Dan were both orange), so colors are
// handed out in order over the whole team instead: sorted by id, so everyone
// keeps their color across pages and sessions until the team changes.
const COLORS = ['#E5735A', '#5B8DEF', '#4CC38A', '#E8A23B', '#8B6CEF', '#D6618C', '#3BB4C1', '#94A23B', '#C46BD8', '#5A6B7B']
const teamColors = new Map<string, string>()

/** Call with the full team whenever it loads, so each person gets their own color. */
export function setTeamColors(team: { id: string }[]) {
  teamColors.clear()
  ;[...team].sort((a, b) => a.id.localeCompare(b.id)).forEach((u, i) => teamColors.set(u.id, COLORS[i % COLORS.length]))
}

function colorFor(id: string) {
  const known = teamColors.get(id)
  if (known) return known
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}

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

export default function AssigneePicker({ team, value, meId, onChange, readOnly = false, readOnlyReason }: {
  team: Teammate[]
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
            <span className="text-sm font-medium text-off-black">{current.firstName} {current.lastName}</span>
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
export type QueueMember = { userId: string; regular: boolean; until: string | null; share?: number; open?: number }

export function QueuePill({ people, team }: { people?: QueueMember[]; team: Teammate[] }) {
  const shown = (people || []).map(p => ({ ...p, user: team.find(u => u.id === p.userId) })).filter(p => p.user)
  if (!shown.length) return null
  const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return (
    <div className="hidden md:flex flex-col items-end gap-1 whitespace-nowrap">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-off-black/40">Current Team</span>
      <div className="flex items-center gap-1.5">
        {shown.map(p => {
          const facts = [
            shown.length > 1 && p.share != null ? `${p.share}%` : null,
            p.open != null ? `${p.open} order${p.open === 1 ? '' : 's'}` : null,
          ].filter(Boolean).join(' · ')
          return (
            <span
              key={p.userId}
              className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border border-border-gray bg-white text-xs"
              title={p.until ? `Helping until ${day(p.until)}` : 'Regular'}
            >
              <Avatar user={p.user!} size={20} />
              <span className="font-medium text-off-black">{p.user!.firstName}</span>
              {facts && <span className="text-off-black/45">{facts}</span>}
            </span>
          )
        })}
      </div>
    </div>
  )
}
