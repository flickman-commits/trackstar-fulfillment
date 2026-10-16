import { HelpCircle } from 'lucide-react'

/**
 * What the icon in the Status column means. A hover key off the column
 * header, one short line per stage (server/domain/orders/pipeline.js).
 */
const ROWS: [string, string][] = [
  ['🖼️', 'Ready for review: approve or reject the design'],
  ['⚠️', 'Needs action: the script is stuck, the label says why'],
  ['🔍', 'Needs research: the lookup has not run yet'],
  ['⏳', 'Waiting: race day, results, a worker or a payment'],
  ['✅', 'Done'],
]

export default function StatusLegend() {
  return (
    <span className="relative inline-flex items-center normal-case tracking-normal group">
      <HelpCircle className="w-3.5 h-3.5 ml-1 text-off-black/35 group-hover:text-off-black/70 cursor-help" aria-label="Status icon key" />
      <div className="pointer-events-none absolute left-0 top-full mt-2 z-50 w-56 bg-white border border-border-gray rounded-lg shadow-lg p-2.5 text-left font-normal opacity-0 group-hover:opacity-100 transition-opacity">
        {ROWS.map(([icon, label]) => (
          <div key={label} className="flex items-center gap-2 text-xs text-off-black py-0.5">
            <span className="w-5 text-center shrink-0 text-sm leading-4">{icon}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </span>
  )
}
