/**
 * Storefront stats, on the dashboard.
 *
 * Renders whatever /api/admin/stats returns rather than a fixed set of cards:
 * adding a metric server-side makes it appear here with no change to this file.
 * That is the point of the shape - the panel knows how to draw "a percentage
 * with a denominator", not which percentages exist.
 *
 * Every card shows its denominator. A gifting rate of 100% means something very
 * different over eighteen answers than over four hundred, and a percentage
 * printed alone hides which one you are looking at.
 */
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { segment, segmentGroup, btnGhost } from '@/lib/ui'

interface Metric {
  key: string
  label: string
  unit: string
  describe: string
  value: number | null
  numerator: number
  denominator: number
  detail: string
  note: string | null
}

interface TimeSummary {
  count: number
  medianHours: number | null
  meanHours: number | null
  p90Hours: number | null
  withinGoal: number
  withinGoalPct: number | null
  overFiveDays: number
  orderedBeforeRace: number
  weekly: { from: string; count: number; medianHours: number | null; withinGoalPct: number | null }[]
  leftOut: Record<string, number>
}

interface Fulfillment {
  standard: TimeSummary
  custom: TimeSummary
  openStandard: { workable: number; pastGoal: number }
  goalHours: number
}

interface StatsPayload {
  fulfillment?: Fulfillment | null
  range: string
  rangeLabel: string
  orderCount: number
  metrics: Metric[]
  ranges: { key: string; label: string }[]
  computedAt: string
  cached?: boolean
}

const DEFAULT_RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
]

/** Short labels for the toggle; the API's own labels are longer prose. */
const SHORT: Record<string, string> = {
  today: 'Today', yesterday: 'Yesterday', '7d': '7d', '30d': '30d', '90d': '90d',
}

export default function StatsPanel() {
  const [range, setRange] = useState('30d')
  const [data, setData] = useState<StatsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (key: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch(`/api/admin/stats?range=${key}`)
      const json = await res.json()
      if (!res.ok) setError(json.error || 'Could not load stats')
      else setData(json)
    } catch {
      setError('Could not reach the server')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(range) }, [range, load])

  const ranges = data?.ranges ?? DEFAULT_RANGES

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-off-black/50">
          {data
            ? `${data.orderCount} order${data.orderCount === 1 ? '' : 's'} in this window, straight from Shopify. Cancelled and test orders are left out.`
            : 'Straight from Shopify.'}
        </p>
        <div className="flex items-center gap-2">
          <div className={segmentGroup}>
            {ranges.map(r => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={segment(range === r.key, 'sm')}
              >
                {SHORT[r.key] ?? r.label}
              </button>
            ))}
          </div>
          <button onClick={() => load(range)} className={btnGhost} disabled={loading} title="Refresh from Shopify">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-border-gray bg-white p-4 text-body-sm text-off-black/50">
          {error}
        </div>
      ) : loading && !data ? (
        <div className="rounded-lg border border-border-gray bg-white p-6 flex justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-off-black/30" />
        </div>
      ) : (
        <>
        {data?.fulfillment && <FulfillmentTime f={data.fulfillment} rangeLabel={data.rangeLabel} />}
        <p className="text-xs font-semibold text-off-black/50 pt-2">From Shopify</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data?.metrics.map(m => (
            <div
              key={m.key}
              className="rounded-lg border border-border-gray bg-white p-4"
              title={[m.describe, m.note].filter(Boolean).join('\n\n')}
            >
              <p className="text-xs text-off-black/50">{m.label}</p>
              <p className="text-2xl font-semibold text-off-black mt-0.5 tabular-nums">
                {m.value === null ? (
                  <span className="text-base font-normal text-off-black/35">Not enough data</span>
                ) : (
                  <>{m.value}<span className="text-base text-off-black/40">{m.unit}</span></>
                )}
              </p>
              {/* The denominator, always. A rate without it is unreadable. */}
              <p className="text-[11px] text-off-black/40 mt-0.5">{m.detail}</p>
              {/* A caveat that changes how the number should be read belongs on
                  the card, not in a tooltip nobody hovers. */}
              {m.note && (
                <p className="text-[11px] text-off-black/45 mt-2 pt-2 border-t border-border-gray/60">{m.note}</p>
              )}
            </div>
          ))}
        </div>
        </>
      )}
    </section>
  )
}

const fmtHours = (h: number | null) => h === null ? '–' : h < 48 ? `${h.toFixed(h < 10 ? 1 : 0)}h` : `${(h / 24).toFixed(1)}d`

/**
 * Our handling time: order (or race day, if later) to a person marking it
 * complete. The goal is two days. Standard and custom are different jobs, so
 * they get their own rows; the weekly strip shows the share within goal.
 */
function FulfillmentTime({ f, rangeLabel }: { f: Fulfillment; rangeLabel: string }) {
  const goalDays = f.goalHours / 24
  const Row = ({ label, t, note }: { label: string; t: TimeSummary; note: string }) => (
    <div className="rounded-lg border border-border-gray bg-white p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-off-black">{label}</p>
        <p className="text-[11px] text-off-black/40">{t.count} completed{t.orderedBeforeRace ? `, ${t.orderedBeforeRace} ordered before race day` : ''}</p>
      </div>
      {t.count === 0 ? (
        <p className="text-base text-off-black/35 mt-2">Nothing completed in this window</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
          <Stat label={`Within ${goalDays} days`} value={`${t.withinGoalPct}%`} sub={`${t.withinGoal} of ${t.count}`} tone={t.withinGoalPct !== null && t.withinGoalPct >= 90 ? 'good' : t.withinGoalPct !== null && t.withinGoalPct >= 75 ? 'warn' : 'bad'} />
          <Stat label="Median" value={fmtHours(t.medianHours)} sub="half were faster" />
          <Stat label="90th percentile" value={fmtHours(t.p90Hours)} sub="9 in 10 were faster" />
          <Stat label="Over 5 days" value={String(t.overFiveDays)} sub="orders" tone={t.overFiveDays ? 'bad' : undefined} />
        </div>
      )}
      {t.weekly.some(w => w.count) && (
        <div className="mt-3">
          <p className="text-[11px] text-off-black/40 mb-1">Last 8 weeks, share within {goalDays} days</p>
          <div className="flex items-end gap-1 h-10">
            {t.weekly.map(w => (
              <div key={w.from} className="flex-1 flex flex-col justify-end h-full" title={`Week of ${w.from}: ${w.count} completed, ${w.withinGoalPct ?? '–'}% within ${goalDays} days, median ${fmtHours(w.medianHours)}`}>
                <div className={`rounded-sm ${w.withinGoalPct === null ? 'bg-off-black/5' : w.withinGoalPct >= 90 ? 'bg-green-500' : w.withinGoalPct >= 75 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ height: `${Math.max(4, w.withinGoalPct ?? 0)}%` }} />
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[11px] text-off-black/45 mt-2 pt-2 border-t border-border-gray/60">{note}</p>
    </div>
  )
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold text-off-black/50">Our handling time, {rangeLabel.toLowerCase()}</p>
        <p className="text-[11px] text-off-black/45">Open now: <span className={f.openStandard.pastGoal ? 'text-red-600 font-semibold' : 'font-semibold'}>{f.openStandard.pastGoal}</span> of {f.openStandard.workable} workable standard orders are past {goalDays} days</p>
      </div>
      <Row label="Standard prints" t={f.standard} note={`From the order, or race day if the order came first, to a person marking it complete in this tool. Shipping is not counted. ${f.standard.leftOut.noLogLine ? `${f.standard.leftOut.noLogLine} completed orders have no completion line in the Activity Log (shipped without being marked, or before Aug 26) and are left out.` : ''}`} />
      <Row label="Custom designs" t={f.custom} note="From the order to Sent to Production. Older rows use the completion stamp the tool kept at the time." />
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'good' | 'warn' | 'bad' }) {
  const color = tone === 'good' ? 'text-green-700' : tone === 'warn' ? 'text-amber-600' : tone === 'bad' ? 'text-red-600' : 'text-off-black'
  return (
    <div>
      <p className="text-[11px] text-off-black/50">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
      <p className="text-[11px] text-off-black/40">{sub}</p>
    </div>
  )
}
