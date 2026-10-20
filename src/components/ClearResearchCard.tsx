import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { btnDanger, btnSecondary, inputBase } from '@/lib/ui'

type RaceRow = { id: number; raceName: string; year: number; _count?: { runnerResearch: number } }
type Preview = { raceName: string; wouldDelete: number; wouldReset: number }

/**
 * Settings > Maintenance: clear one race's research after fixing its scraper.
 *
 * One race at a time, and two steps: the first click only counts what would
 * go, the second does it. It used to be one button that cleared every race.
 */
export default function ClearResearchCard({ onDone }: { onDone?: () => void }) {
  const [races, setRaces] = useState<RaceRow[]>([])
  const [raceName, setRaceName] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    apiFetch('/api/orders?list=races')
      .then(r => (r.ok ? r.json() : { races: [] }))
      .then(d => setRaces(d.races || []))
      .catch(() => setRaces([]))
  }, [])

  // Research belongs to a race name across years, so offer each name once.
  const names = useMemo(() => [...new Set(races.filter(r => (r._count?.runnerResearch ?? 0) > 0).map(r => r.raceName))].sort(), [races])

  const call = async (confirm: boolean) => {
    setBusy(true)
    try {
      const res = await apiFetch('/api/orders/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear-research', raceName, confirm }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'That did not work'); return }
      if (!confirm) { setPreview({ raceName, wouldDelete: data.wouldDelete ?? 0, wouldReset: data.wouldReset ?? 0 }); return }
      toast.success(`Cleared ${data.deleted ?? 0} research records for ${raceName}. Re-research to repopulate.`)
      setPreview(null)
      onDone?.()
    } catch {
      toast.error('Could not reach the server')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-red-700">Clear Runner Research</p>
        <p className="text-xs mt-0.5 text-red-500">
          For one race, deletes the bib, time and pace found for orders not yet completed and sends them back to &quot;Ready to research&quot;. Completed orders keep their data. Use after fixing that race&apos;s scraper.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id="clear-research-race"
          className={`${inputBase} max-w-xs`}
          value={raceName}
          onChange={e => { setRaceName(e.target.value); setPreview(null) }}
          disabled={busy}
        >
          <option value="">Pick a race</option>
          {names.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        {!preview && (
          <button className={btnSecondary} disabled={busy || !raceName} onClick={() => call(false)}>
            {busy && <Loader2 className="w-3 h-3 animate-spin" />} Check what it would clear
          </button>
        )}
      </div>
      {preview && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-red-700">
          <span>
            {preview.raceName}: deletes {preview.wouldDelete} research record{preview.wouldDelete === 1 ? '' : 's'} and sends {preview.wouldReset} order{preview.wouldReset === 1 ? '' : 's'} back to research.
          </span>
          <button className={btnDanger} disabled={busy || preview.wouldDelete === 0} onClick={() => call(true)}>
            {busy && <Loader2 className="w-3 h-3 animate-spin" />} Clear {preview.raceName}
          </button>
          <button className={btnSecondary} disabled={busy} onClick={() => setPreview(null)}>Cancel</button>
        </div>
      )}
    </div>
  )
}
