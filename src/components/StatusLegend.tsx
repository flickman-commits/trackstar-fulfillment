import { useEffect, useRef, useState } from 'react'
import { HelpCircle } from 'lucide-react'

/**
 * What the icon in the Status column means. Opens from the column header.
 * The list mirrors getStatusDisplay in Dashboard.tsx; keep the two together.
 */
const ROWS: [string, string, string][] = [
  ['✅', 'Ready', 'A result is on file. Found by our research, or verified by the customer at checkout.'],
  ['🟣', 'Customer-verified', 'The customer confirmed an official-results match in Instant Lookup. As good as research.'],
  ['✍️', 'Customer-entered', 'The customer typed their own numbers. Never matched against official results. Print as given.'],
  ['🔍', 'Ready to research', 'We have a scraper for this race. Run research.'],
  ['🕵️', 'Not found', 'Research ran and did not find the runner. Needs a manual lookup.'],
  ['❓', 'Multiple matches', 'Several runners share the name. Open the order and pick one.'],
  ['⏱', 'Time missing', 'Runner matched, but the timing site has no time. Enter it by hand.'],
  ['🗓️', 'Race not run yet', 'The race is in the future. Nothing to look up until race day.'],
  ['🌐', 'Timing site down', 'The results site was unreachable. Retry later.'],
  ['🚧', 'No scraper', 'We have no scraper for this race. Research by hand, or ask for one.'],
  ['🛠️', 'Year not configured', 'The scraper exists but this year is not wired up. A developer needs to add it.'],
  ['⚠️', 'Flagged', 'Someone flagged this order for review.'],
  ['📅', 'Missing year', 'No race year on the order. Ask the customer.'],
]

export default function StatusLegend() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <span ref={ref} className="relative inline-flex items-center normal-case tracking-normal">
      <button type="button" onClick={() => setOpen(o => !o)} className="ml-1 text-off-black/35 hover:text-off-black/70" title="What the icons mean" aria-label="What the status icons mean">
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 w-80 bg-white border border-border-gray rounded-lg shadow-lg p-3 text-left font-normal">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-off-black/40 mb-2">Status icons</div>
          <div className="space-y-1.5">
            {ROWS.map(([icon, label, meaning]) => (
              <div key={label} className="flex items-start gap-2 text-xs">
                <span className="w-5 text-center shrink-0 text-sm leading-4">{icon}</span>
                <span className="text-off-black"><span className="font-semibold">{label}.</span> <span className="text-off-black/60">{meaning}</span></span>
              </div>
            ))}
          </div>
        </div>
      )}
    </span>
  )
}
