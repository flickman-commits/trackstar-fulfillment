import { useEffect, useRef, useState } from 'react'
import { Loader2, Mail, Search } from 'lucide-react'
import { inputBase } from '@/lib/ui'
import { useEscape } from '@/lib/useEscape'
import { salesApi, type DealHit } from '@/lib/salesApi'

/**
 * Write to anyone: a deal at any stage in Attio, found by name, company,
 * person or address, or a bare email address with no deal behind it. Picks
 * land in the same composer as the queue.
 */
export default function NewEmail({ onPickDeal, onPickAddress, onClose }: {
  onPickDeal: (hit: DealHit) => void
  onPickAddress: (email: string) => void
  onClose: () => void
}) {
  useEscape(onClose)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<DealHit[]>([])
  const [searching, setSearching] = useState(false)
  const timer = useRef<number | null>(null)
  const isAddress = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.trim())

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    if (q.trim().length < 2) { setHits([]); return }
    timer.current = window.setTimeout(async () => {
      setSearching(true)
      try { setHits((await salesApi.search(q.trim())).deals) } catch { setHits([]) } finally { setSearching(false) }
    }, 220)
    return () => { if (timer.current) window.clearTimeout(timer.current) }
  }, [q])

  return (
    <div className="fixed inset-0 z-50 bg-off-black/30 flex items-start justify-center pt-[12vh] px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="relative border-b border-border-gray">
          <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-off-black/40" />
          <input
            autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="A deal, a company, a person, or an email address"
            className={`${inputBase} w-full border-0 rounded-none pl-10 py-3 text-[14px] focus:ring-0`}
            onKeyDown={e => { if (e.key === 'Enter') { if (isAddress) onPickAddress(q.trim()); else if (hits[0]) onPickDeal(hits[0]) } }}
          />
          {searching && <Loader2 className="w-4 h-4 absolute right-3.5 top-3.5 animate-spin text-off-black/40" />}
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {isAddress && (
            <button onClick={() => onPickAddress(q.trim())} className="w-full text-left px-4 py-2.5 flex items-center gap-2.5 hover:bg-subtle-gray border-b border-border-gray/70">
              <Mail className="w-4 h-4 text-off-black/50" />
              <span className="text-sm">Write to <b>{q.trim()}</b> <span className="text-off-black/45">· no deal, nothing written to Attio</span></span>
            </button>
          )}
          {hits.map(h => (
            <button key={h.id} onClick={() => onPickDeal(h)} className="w-full text-left px-4 py-2.5 hover:bg-subtle-gray border-b border-border-gray/70 last:border-b-0">
              <div className="text-sm font-semibold flex items-center gap-2">
                <span className="truncate">{h.name}</span>
                <span className="font-mono text-[9.5px] px-1 py-0.5 rounded border border-border-gray text-off-black/45 uppercase tracking-wider">{(h.motion || '').slice(0, 3)}</span>
                <span className="text-[11px] font-normal text-off-black/50">{h.stage}</span>
              </div>
              <div className="text-xs text-off-black/55 truncate">{h.person ? `${h.person.fullName}${h.person.email ? ` · ${h.person.email}` : ' · no email'}` : 'Nobody on the deal'}</div>
            </button>
          ))}
          {!isAddress && q.trim().length >= 2 && !searching && hits.length === 0 && (
            <div className="px-4 py-4 text-xs text-off-black/50">Nothing in Attio matches. Type a full email address to write to someone with no deal.</div>
          )}
          {q.trim().length < 2 && (
            <div className="px-4 py-4 text-xs text-off-black/50">Any deal, at any stage. The email still logs and still updates the deal in Attio.</div>
          )}
        </div>
      </div>
    </div>
  )
}
