import { useEffect, useRef, useState } from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { cardLabel, segment, segmentGroup } from '@/lib/ui'
import type { Motion } from '@/types/sales'

const MOTIONS: (Motion | null)[] = [null, 'Race', 'Charity', 'Corporate', 'PR']

/**
 * The queue's filters, tucked into one quiet button under the New Outreach /
 * Follow Ups switch: whose deals (yours or everyone's) and which motion.
 * The button says what is on, so a filtered list is never mistaken for the
 * whole day.
 */
export default function FiltersMenu({ scope, onScope, motion, onMotion, ownerName }: {
  scope: 'mine' | 'all'
  onScope: (s: 'mine' | 'all') => void
  motion: Motion | null
  onMotion: (m: Motion | null) => void
  ownerName: string
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown); window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  const on = [scope === 'all' ? 'Everyone' : null, motion].filter(Boolean)
  return (
    <div ref={box} className="relative normal-case tracking-normal">
      <button
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors ${on.length ? 'text-off-black' : 'text-off-black/50 hover:text-off-black'}`}
        title={`${scope === 'all' ? 'Everyone' : ownerName} · ${motion || 'All motions'}`}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        {on.length ? `Filters · ${on.join(', ')}` : 'Filters'}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 w-[340px] rounded-lg border border-border-gray bg-white shadow-lg z-30 p-3 space-y-3">
          <div>
            <span className={`${cardLabel} block mb-1.5`}>Whose deals</span>
            <div className={segmentGroup}>
              <button onClick={() => onScope('mine')} className={segment(scope === 'mine')}>{ownerName}</button>
              <button onClick={() => onScope('all')} className={segment(scope === 'all')}>Everyone</button>
            </div>
          </div>
          <div>
            <span className={`${cardLabel} block mb-1.5`}>Motion</span>
            <div className={segmentGroup}>
              {MOTIONS.map(m => (
                <button key={m || 'all'} onClick={() => onMotion(m)} className={segment(motion === m)}>{m || 'All'}</button>
              ))}
            </div>
          </div>
          {on.length > 0 && (
            <button onClick={() => { onScope('mine'); onMotion(null) }} className="text-xs text-blue-600 hover:text-blue-700">Clear filters</button>
          )}
        </div>
      )}
    </div>
  )
}
