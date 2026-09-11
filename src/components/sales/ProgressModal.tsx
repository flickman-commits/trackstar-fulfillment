import { useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { btnGhost, fieldLabel } from '@/lib/ui'
import { useEscape } from '@/lib/useEscape'
import { salesApi } from '@/lib/salesApi'
import type { Progress } from '@/types/sales'

/** Sends per day, reply rate, and the funnel. Everything from touches and stages already in the database. */
export default function ProgressModal({ onClose }: { onClose: () => void }) {
  useEscape(onClose)
  const [p, setP] = useState<Progress | null>(null)
  useEffect(() => { salesApi.progress().then(setP).catch(e => toast.error((e as Error).message)) }, [])

  const max = p ? Math.max(1, ...p.days.map(d => d.sent)) : 1
  const top = p?.funnel[0]?.count || 1

  return (
    <div className="fixed inset-0 z-50 bg-off-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-gray">
          <div>
            <h2 className="text-base font-semibold text-off-black">Progress</h2>
            <p className="text-xs text-off-black/55 mt-0.5">Last 30 days.</p>
          </div>
          <button onClick={onClose} className={btnGhost}><X className="w-4 h-4" /></button>
        </div>
        {!p ? (
          <div className="flex items-center justify-center h-40 text-off-black/40"><Loader2 className="w-4 h-4 animate-spin" /></div>
        ) : (
          <div className="px-5 py-4 overflow-y-auto space-y-5">
            <div>
              <span className={fieldLabel}>Sends per day</span>
              <div className="flex items-end gap-[3px] h-20" aria-label="Sends per day">
                {p.days.map(d => (
                  <div key={d.day} className="flex-1 rounded-t-sm bg-dark-fill" style={{ height: `${Math.max(2, (d.sent / max) * 100)}%`, opacity: d.sent ? 0.85 : 0.12 }} title={`${d.day}: ${d.sent}`} />
                ))}
              </div>
              <div className="flex justify-between font-mono text-[10px] text-off-black/40 mt-1"><span>{p.days[0]?.day}</span><span>{p.days[p.days.length - 1]?.day}</span></div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { n: p.totals.sent, l: 'sent' },
                { n: p.totals.replies, l: `replies · ${p.totals.replyRate}%` },
                { n: p.totals.calls, l: 'calls booked' },
                { n: p.totals.signed, l: 'signed' },
              ].map(k => (
                <div key={k.l} className="rounded-lg border border-border-gray px-3 py-2">
                  <div className="text-lg font-semibold tabular-nums">{k.n}</div>
                  <div className="text-[11px] text-off-black/50">{k.l}</div>
                </div>
              ))}
            </div>
            <div>
              <span className={fieldLabel}>Funnel · all time</span>
              <ul className="space-y-1.5">
                {p.funnel.map(f => (
                  <li key={f.stage} className="grid grid-cols-[100px_1fr_40px] items-center gap-2 text-xs">
                    <span className="text-off-black/65">{f.stage}</span>
                    <span className="h-2.5 rounded bg-dark-fill" style={{ width: `${Math.max(1, (f.count / top) * 100)}%` }} />
                    <span className="text-right tabular-nums text-off-black/60">{f.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
