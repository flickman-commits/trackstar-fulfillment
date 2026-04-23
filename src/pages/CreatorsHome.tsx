import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Users, Package, Megaphone, DollarSign, TrendingUp, Clock } from 'lucide-react'
import { apiFetch } from '@/lib/api'

interface HomeMetrics {
  creators: {
    total: number
    active: number
    invited: number
    onboarded: number
    paused: number
    onboardedThisMonth: number
  }
  samples: {
    total: number
    shipped: number
    pending: number
    costEstimatedUsd: number
    costIsPlaceholder: boolean
  }
  ads: { running: number; isPlaceholder: boolean }
  revenue: { attributedThisMonthUsd: number; isPlaceholder: boolean }
  commission: { pendingUsd: number; isPlaceholder: boolean }
}

function formatUsd(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

/** Single metric tile. Greyed/dashed when `placeholder` is true. */
function Tile({
  icon,
  label,
  value,
  subLabel,
  placeholder = false,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  subLabel?: string
  placeholder?: boolean
}) {
  return (
    <div className={`relative bg-white border rounded-md p-4 md:p-5 ${
      placeholder ? 'border-dashed border-off-black/20' : 'border-border-gray shadow-sm'
    }`}>
      <div className="flex items-center gap-2 text-off-black/50 mb-2">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-2xl md:text-3xl font-bold ${placeholder ? 'text-off-black/30' : 'text-off-black'}`}>
        {value}
      </div>
      {subLabel && <div className="text-xs text-off-black/50 mt-1">{subLabel}</div>}
      {placeholder && (
        <span
          className="absolute top-2 right-2 px-1.5 py-0.5 bg-off-black/5 text-off-black/40 text-[9px] font-medium rounded uppercase tracking-wider"
          title="Placeholder value — real metric lands in a later phase"
        >
          Placeholder
        </span>
      )}
    </div>
  )
}

export default function CreatorsHome() {
  const [metrics, setMetrics] = useState<HomeMetrics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch('/api/orders/actions?action=creator-home-metrics')
        if (!res.ok) throw new Error(`Request failed: ${res.status}`)
        const data = await res.json()
        setMetrics(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load metrics')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="min-h-screen bg-off-white">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <img src="/trackstar-logo.png" alt="Trackstar" className="h-8 md:h-10" />
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-off-black">Creator Program</h1>
              <p className="text-sm text-off-black/50">Overview of creators, content, and performance</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="px-3 py-2 text-xs md:text-sm font-medium text-off-black/60 hover:text-off-black hover:bg-off-black/5 rounded-md transition-colors"
            >
              ← Back to Fulfillment
            </Link>
          </div>
        </div>

        {/* Loading / Error */}
        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-off-black/40" />
          </div>
        )}
        {error && !isLoading && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-800 text-sm">
            {error}
          </div>
        )}

        {/* Metric tiles */}
        {metrics && !isLoading && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              <Tile
                icon={<Users className="w-4 h-4" />}
                label="Active Creators"
                value={metrics.creators.active + metrics.creators.onboarded}
                subLabel={
                  metrics.creators.invited > 0
                    ? `${metrics.creators.invited} invite${metrics.creators.invited === 1 ? '' : 's'} pending`
                    : 'No pending invites'
                }
              />
              <Tile
                icon={<TrendingUp className="w-4 h-4" />}
                label="Onboarded This Month"
                value={metrics.creators.onboardedThisMonth}
                subLabel={`${metrics.creators.total} total in program`}
              />
              <Tile
                icon={<Package className="w-4 h-4" />}
                label="Samples"
                value={metrics.samples.total}
                subLabel={
                  metrics.samples.pending > 0
                    ? `${metrics.samples.shipped} shipped · ${metrics.samples.pending} pending`
                    : `${metrics.samples.shipped} shipped`
                }
              />
              <Tile
                icon={<DollarSign className="w-4 h-4" />}
                label="Spent on Samples"
                value={formatUsd(metrics.samples.costEstimatedUsd)}
                subLabel="Est. at $50/sample"
                placeholder={metrics.samples.costIsPlaceholder}
              />
              <Tile
                icon={<Megaphone className="w-4 h-4" />}
                label="Running Ads"
                value={metrics.ads.running}
                subLabel="Wired in Week 3"
                placeholder={metrics.ads.isPlaceholder}
              />
              <Tile
                icon={<DollarSign className="w-4 h-4" />}
                label="Attributed Revenue"
                value={formatUsd(metrics.revenue.attributedThisMonthUsd)}
                subLabel="This month, from creator content"
                placeholder={metrics.revenue.isPlaceholder}
              />
              <Tile
                icon={<Clock className="w-4 h-4" />}
                label="Commission Owed"
                value={formatUsd(metrics.commission.pendingUsd)}
                subLabel="Pending payout"
                placeholder={metrics.commission.isPlaceholder}
              />
            </div>

            {/* Quick links — placeholders for future pages */}
            <div className="mt-10">
              <h2 className="text-xs font-semibold text-off-black/50 uppercase tracking-wider mb-3">Navigate</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-white border border-dashed border-off-black/20 rounded-md p-4 text-off-black/40 text-sm">
                  <div className="font-medium text-off-black/60 mb-1">Creators</div>
                  List + drawer — ships next commit
                </div>
                <div className="bg-white border border-dashed border-off-black/20 rounded-md p-4 text-off-black/40 text-sm">
                  <div className="font-medium text-off-black/60 mb-1">Briefs</div>
                  Coming Week 2
                </div>
                <div className="bg-white border border-dashed border-off-black/20 rounded-md p-4 text-off-black/40 text-sm">
                  <div className="font-medium text-off-black/60 mb-1">Reports</div>
                  Coming Week 3
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
