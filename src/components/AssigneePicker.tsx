import { useEffect, useRef, useState } from 'react'
import { Check, UserRound } from 'lucide-react'

/**
 * Who has this order, as a person rather than a dropdown: an initial in a
 * colored circle and a full name. Click to hand it to someone else.
 */
export type Teammate = { id: string; firstName: string; lastName: string }

// Stable per person, so Eli is always the same color wherever he appears.
const COLORS = ['#4CC38A', '#5B8DEF', '#E8A23B', '#D6618C', '#8B6CEF', '#3BB4C1', '#E5735A']
function colorFor(id: string) {
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

export default function AssigneePicker({ team, value, meId, onChange }: {
  team: Teammate[]
  value: string | null
  meId?: string | null
  onChange: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = team.find(u => u.id === value) || null

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
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-off-black/5 transition-colors"
        title="Who is fulfilling this order"
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
