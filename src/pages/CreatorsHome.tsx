import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Users, Package, Megaphone, DollarSign, TrendingUp, Clock, X, Copy, Check, Instagram, Plus, Send } from 'lucide-react'
import { apiFetch } from '@/lib/api'

type CreatorStatus = 'invited' | 'onboarded' | 'active' | 'paused'
type CommissionModel = 'free_product' | 'flat_per_asset' | 'rev_share' | 'hybrid'

interface BriefLite {
  id: string
  title: string
  status: string
}

interface Creator {
  id: string
  inviteToken: string
  invitedAt: string
  onboardedAt: string | null
  name: string | null
  email: string | null
  instagramHandle: string | null
  tiktokHandle: string | null
  raceName: string | null
  raceYear: number | null
  productSize: string | null
  frameType: string | null
  shippingCity: string | null
  shippingState: string | null
  commissionModel: CommissionModel
  commissionConfig: Record<string, unknown>
  commissionNotes: string | null
  whitelistingEnabled: boolean
  metaPageId: string | null
  status: CreatorStatus
  sampleOrderId: string | null
  sampleOrder?: {
    id: string
    orderNumber: string
    status: string
    createdAt: string
  } | null
  briefAssignments?: Array<{ brief: BriefLite }>
  createdAt: string
  updatedAt: string
}

const STATUS_CONFIG: Record<CreatorStatus, { label: string; color: string; bg: string }> = {
  invited:    { label: 'Invited',    color: 'text-off-black/50', bg: 'bg-off-black/5' },
  onboarded:  { label: 'Onboarded',  color: 'text-blue-700',     bg: 'bg-blue-50' },
  active:     { label: 'Active',     color: 'text-emerald-700',  bg: 'bg-emerald-50' },
  paused:     { label: 'Paused',     color: 'text-amber-700',    bg: 'bg-amber-50' },
}

const COMMISSION_LABEL: Record<CommissionModel, string> = {
  free_product:    'Free product',
  flat_per_asset:  'Flat per asset',
  rev_share:       'Rev share',
  hybrid:          'Hybrid',
}

function sampleStatusLabel(orderStatus: string | undefined | null): { label: string; color: string } {
  if (!orderStatus) return { label: 'Not yet requested', color: 'text-off-black/40' }
  if (orderStatus === 'completed') return { label: 'Sent to Production', color: 'text-emerald-700' }
  if (orderStatus === 'flagged')   return { label: 'Flagged',            color: 'text-amber-700' }
  return { label: 'In queue', color: 'text-blue-700' }
}

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
  const [creators, setCreators] = useState<Creator[]>([])
  const [briefs, setBriefs] = useState<BriefLite[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    try {
      const [metricsRes, creatorsRes, briefsRes] = await Promise.all([
        apiFetch('/api/orders/actions?action=creator-home-metrics'),
        apiFetch('/api/orders/actions?action=list-creators'),
        apiFetch('/api/orders/actions?action=list-briefs'),
      ])
      if (!metricsRes.ok) throw new Error(`Metrics failed: ${metricsRes.status}`)
      if (!creatorsRes.ok) throw new Error(`Creators failed: ${creatorsRes.status}`)
      if (!briefsRes.ok) throw new Error(`Briefs failed: ${briefsRes.status}`)
      setMetrics(await metricsRes.json())
      const { creators } = await creatorsRes.json()
      const { briefs } = await briefsRes.json()
      setCreators(creators)
      setBriefs(briefs.filter((b: BriefLite) => b.status === 'active'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Creators that submitted onboarding but haven't had their sample approved yet.
  // They show in the Sample Requests queue above the main list.
  const pendingSampleRequests = creators.filter(c =>
    c.status === 'onboarded' && !c.sampleOrder
  )
  const otherCreators = creators.filter(c =>
    !(c.status === 'onboarded' && !c.sampleOrder)
  )

  const handleApproveSample = async (creator: Creator) => {
    setApprovingId(creator.id)
    try {
      const res = await apiFetch('/api/orders/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve-creator-sample', creatorId: creator.id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Approve failed: ${res.status}`)
      }
      await loadAll()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to approve')
    } finally {
      setApprovingId(null)
    }
  }

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
              to="/briefs"
              className="px-3 py-2 text-xs md:text-sm font-medium text-off-black/60 hover:text-off-black hover:bg-off-black/5 rounded-md transition-colors"
            >
              Briefs →
            </Link>
            <Link
              to="/"
              className="px-3 py-2 text-xs md:text-sm font-medium text-off-black/60 hover:text-off-black hover:bg-off-black/5 rounded-md transition-colors"
            >
              ← Fulfillment
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

            {/* Sample Requests — creators waiting for Matt's approval */}
            {pendingSampleRequests.length > 0 && (
              <div className="mt-10">
                <h2 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-3">
                  Sample Requests Pending ({pendingSampleRequests.length})
                </h2>
                <div className="space-y-2">
                  {pendingSampleRequests.map(c => (
                    <div key={c.id} className="bg-amber-50 border border-amber-200 rounded-md p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                      <button
                        onClick={() => setSelectedCreator(c)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-off-black">{c.name || 'Unnamed Creator'}</span>
                          {c.instagramHandle && (
                            <span className="inline-flex items-center gap-1 text-xs text-off-black/60">
                              <Instagram className="w-3 h-3" />
                              {c.instagramHandle}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-off-black/60 mt-1">
                          {c.raceName ? `${c.raceName}${c.raceYear ? ` ${c.raceYear}` : ''}` : 'No race selected'}
                          {c.productSize && c.frameType && (
                            <span className="mx-1.5 text-off-black/30">·</span>
                          )}
                          {c.productSize && c.frameType && `${c.productSize} ${c.frameType}`}
                          {c.shippingCity && c.shippingState && (
                            <>
                              <span className="mx-1.5 text-off-black/30">·</span>
                              Ships to {c.shippingCity}, {c.shippingState}
                            </>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={() => handleApproveSample(c)}
                        disabled={approvingId === c.id}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded transition-colors disabled:opacity-40 whitespace-nowrap"
                      >
                        {approvingId === c.id ? (
                          <><Loader2 className="w-3 h-3 animate-spin" /> Approving…</>
                        ) : (
                          <><Send className="w-3 h-3" /> Approve & notify Elí</>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Creators list */}
            <div className="mt-10">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-off-black/50 uppercase tracking-wider">
                  Creators {otherCreators.length > 0 && <span className="text-off-black/30">({otherCreators.length})</span>}
                </h2>
                <button
                  onClick={() => setShowInvite(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-off-black text-white text-xs font-medium rounded hover:opacity-90 transition-opacity"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Creator Invite
                </button>
              </div>

              {otherCreators.length === 0 ? (
                <div className="bg-white border border-dashed border-off-black/20 rounded-md p-8 text-center text-off-black/50">
                  <p className="text-sm mb-1">No creators yet.</p>
                  <p className="text-xs text-off-black/40">Generate an invite link to onboard your first creator.</p>
                </div>
              ) : (
                <div className="bg-white border border-border-gray rounded-md shadow-sm overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-subtle-gray border-b border-border-gray">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-off-black/60 uppercase tracking-wider">Creator</th>
                        <th className="text-left px-3 py-3 text-xs font-semibold text-off-black/60 uppercase tracking-wider w-32">Status</th>
                        <th className="text-left px-3 py-3 text-xs font-semibold text-off-black/60 uppercase tracking-wider w-44">Sample</th>
                        <th className="text-left px-3 py-3 text-xs font-semibold text-off-black/60 uppercase tracking-wider hidden md:table-cell w-40">Commission</th>
                        <th className="text-left px-3 py-3 text-xs font-semibold text-off-black/60 uppercase tracking-wider hidden lg:table-cell w-36">Invited</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-gray">
                      {otherCreators.map((c, i) => {
                        const statusCfg = STATUS_CONFIG[c.status]
                        const sampleDisplay = sampleStatusLabel(c.sampleOrder?.status)
                        return (
                          <tr
                            key={c.id}
                            onClick={() => setSelectedCreator(c)}
                            className={`hover:bg-subtle-gray cursor-pointer transition-colors ${i % 2 === 1 ? 'bg-subtle-gray/30' : ''}`}
                          >
                            <td className="px-4 py-3.5">
                              <div className="flex flex-col">
                                <span className="text-sm font-medium text-off-black">
                                  {c.name || <span className="text-off-black/40 italic">Not yet onboarded</span>}
                                </span>
                                {c.instagramHandle && (
                                  <span className="text-xs text-off-black/50 flex items-center gap-1 mt-0.5">
                                    <Instagram className="w-3 h-3" />
                                    {c.instagramHandle}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                                {statusCfg.label}
                              </span>
                            </td>
                            <td className={`px-3 py-3.5 text-sm ${sampleDisplay.color}`}>
                              {sampleDisplay.label}
                            </td>
                            <td className="px-3 py-3.5 text-sm text-off-black/70 hidden md:table-cell">
                              {COMMISSION_LABEL[c.commissionModel]}
                            </td>
                            <td className="px-3 py-3.5 text-sm text-off-black/60 hidden lg:table-cell">
                              {new Date(c.invitedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Drawer */}
      {selectedCreator && (
        <CreatorDrawer
          creator={selectedCreator}
          onClose={() => setSelectedCreator(null)}
          onSaved={async (updated) => {
            setSelectedCreator(updated)
            await loadAll()
          }}
        />
      )}

      {/* Invite Modal */}
      {showInvite && (
        <InviteModal
          briefs={briefs}
          onClose={() => setShowInvite(false)}
          onCreated={async () => {
            await loadAll()
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// InviteModal — generate a fresh creator invite with optional briefs
// ---------------------------------------------------------------------------
function InviteModal({ briefs, onClose, onCreated }: {
  briefs: BriefLite[]
  onClose: () => void
  onCreated: () => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [instagram, setInstagram] = useState('')
  const [selectedBriefIds, setSelectedBriefIds] = useState<Set<string>>(new Set())
  const [isCreating, setIsCreating] = useState(false)
  const [createdLink, setCreatedLink] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  const toggleBrief = (id: string) => {
    setSelectedBriefIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCreate = async () => {
    setIsCreating(true)
    try {
      const res = await apiFetch('/api/orders/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-creator-invite',
          name: name.trim() || null,
          email: email.trim() || null,
          instagramHandle: instagram.trim() || null,
          briefIds: Array.from(selectedBriefIds),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Create failed: ${res.status}`)
      }
      const { creator } = await res.json()
      const url = `${window.location.origin}/creator/${creator.inviteToken}`
      setCreatedLink(url)
      // Auto-copy so Matt can paste right into a DM
      try {
        await navigator.clipboard.writeText(url)
        setLinkCopied(true)
      } catch {
        // Clipboard may not be available — fall through; user can copy manually
      }
      await onCreated()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to create invite')
    } finally {
      setIsCreating(false)
    }
  }

  const handleCopy = async () => {
    if (!createdLink) return
    try {
      await navigator.clipboard.writeText(createdLink)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1500)
    } catch {
      // Silent fallback
    }
  }

  return (
    <div
      className="fixed inset-0 bg-off-black/60 flex items-center justify-center p-4 z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-md max-w-md w-full max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold text-off-black">
              {createdLink ? 'Invite ready' : 'New Creator Invite'}
            </h3>
            <button onClick={onClose} className="text-off-black/40 hover:text-off-black">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* After-create view: show the link, copy affordance */}
          {createdLink ? (
            <div>
              <p className="text-sm text-off-black/70 mb-3">
                Send this link to the creator — it takes them to the onboarding wizard.
                {linkCopied && ' Already copied to your clipboard.'}
              </p>
              <div className="flex items-center gap-2 mb-5">
                <code className="flex-1 text-xs text-off-black/80 bg-subtle-gray px-2 py-2 rounded border border-border-gray truncate">
                  {createdLink}
                </code>
                <button
                  onClick={handleCopy}
                  className="px-3 py-2 text-xs font-medium bg-white border border-border-gray rounded hover:bg-off-black/5 transition-colors inline-flex items-center gap-1"
                >
                  {linkCopied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
              </div>
              <button
                onClick={onClose}
                className="w-full px-4 py-2 bg-off-black text-white text-sm font-medium rounded hover:opacity-90 transition-opacity"
              >
                Done
              </button>
            </div>
          ) : (
            // Pre-create form
            <>
              <p className="text-xs text-off-black/50 mb-4">
                All fields optional except briefs. You can fill these in later from the creator drawer.
              </p>

              <div className="space-y-3.5">
                <div>
                  <div className="text-xs text-off-black/60 mb-1">Name</div>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Creator's name (optional)"
                    className="w-full px-3 py-2 border border-border-gray rounded text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20"
                    autoFocus
                  />
                </div>
                <div>
                  <div className="text-xs text-off-black/60 mb-1">Email</div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="optional"
                    className="w-full px-3 py-2 border border-border-gray rounded text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20"
                  />
                </div>
                <div>
                  <div className="text-xs text-off-black/60 mb-1">Instagram</div>
                  <input
                    type="text"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    placeholder="@handle (optional)"
                    className="w-full px-3 py-2 border border-border-gray rounded text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20"
                  />
                </div>

                <div>
                  <div className="text-xs text-off-black/60 mb-2">
                    Assign Briefs <span className="text-off-black/40">(optional)</span>
                  </div>
                  {briefs.length === 0 ? (
                    <div className="text-xs text-off-black/40 italic bg-subtle-gray border border-dashed border-border-gray rounded p-3">
                      No active briefs yet — you can <Link to="/briefs" className="underline">create one</Link> first, or skip and assign later.
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-44 overflow-y-auto border border-border-gray rounded p-2">
                      {briefs.map(b => (
                        <label
                          key={b.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-subtle-gray cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedBriefIds.has(b.id)}
                            onChange={() => toggleBrief(b.id)}
                            className="w-4 h-4"
                          />
                          <span className="text-sm text-off-black">{b.title}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-border-gray">
                <button onClick={onClose} className="px-4 py-2 text-sm text-off-black/60 hover:bg-off-black/5 rounded transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isCreating}
                  className="px-4 py-2 bg-off-black text-white text-sm font-medium rounded hover:opacity-90 disabled:opacity-40 transition-opacity inline-flex items-center gap-2"
                >
                  {isCreating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isCreating ? 'Creating…' : 'Generate Invite Link'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Drawer — view + edit a single creator
// ---------------------------------------------------------------------------
function CreatorDrawer({
  creator,
  onClose,
  onSaved,
}: {
  creator: Creator
  onClose: () => void
  onSaved: (updated: Creator) => void
}) {
  const [draft, setDraft] = useState<Creator>(creator)
  const [isSaving, setIsSaving] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)

  useEffect(() => { setDraft(creator) }, [creator.id])

  const isDirty = JSON.stringify(draft) !== JSON.stringify(creator)

  const handleCopyInvite = async () => {
    const url = `${window.location.origin}/creator/${creator.inviteToken}`
    try {
      await navigator.clipboard.writeText(url)
      setTokenCopied(true)
      setTimeout(() => setTokenCopied(false), 1500)
    } catch {
      // Clipboard can fail on insecure contexts — fall through silently
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const updates = {
        name: draft.name,
        email: draft.email,
        instagramHandle: draft.instagramHandle,
        tiktokHandle: draft.tiktokHandle,
        commissionModel: draft.commissionModel,
        commissionConfig: draft.commissionConfig,
        commissionNotes: draft.commissionNotes,
        whitelistingEnabled: draft.whitelistingEnabled,
        metaPageId: draft.metaPageId,
        status: draft.status,
      }
      const res = await apiFetch('/api/orders/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-creator', creatorId: creator.id, updates }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Save failed: ${res.status}`)
      }
      const { creator: updated } = await res.json()
      onSaved(updated)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-off-black/60 flex items-center justify-center p-4 z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-md max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-off-black">
                {creator.name || 'Pending Creator'}
              </h3>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_CONFIG[creator.status].bg} ${STATUS_CONFIG[creator.status].color}`}>
                {STATUS_CONFIG[creator.status].label}
              </span>
            </div>
            <button onClick={onClose} className="text-off-black/40 hover:text-off-black">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Invite link — always visible, copy-able */}
          <div className="bg-subtle-gray border border-border-gray rounded-md p-3 mb-5">
            <div className="text-[10px] font-semibold text-off-black/50 uppercase tracking-wider mb-1.5">Invite / Portal Link</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs text-off-black/80 bg-white px-2 py-1.5 rounded border border-border-gray truncate">
                {window.location.origin}/creator/{creator.inviteToken}
              </code>
              <button
                onClick={handleCopyInvite}
                className="px-2.5 py-1.5 text-xs font-medium bg-white border border-border-gray rounded hover:bg-off-black/5 transition-colors inline-flex items-center gap-1"
              >
                {tokenCopied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
              </button>
            </div>
            {creator.onboardedAt && (
              <p className="text-[10px] text-off-black/40 mt-1.5">
                Onboarded {new Date(creator.onboardedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </div>

          {/* Editable fields */}
          <div className="space-y-4">
            <Section title="Profile">
              <TextField label="Name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
              <TextField label="Email" value={draft.email} onChange={(v) => setDraft({ ...draft, email: v })} type="email" />
              <TextField label="Instagram" value={draft.instagramHandle} onChange={(v) => setDraft({ ...draft, instagramHandle: v })} placeholder="@handle" />
              <TextField label="TikTok" value={draft.tiktokHandle} onChange={(v) => setDraft({ ...draft, tiktokHandle: v })} placeholder="@handle" />
            </Section>

            <Section title={`Assigned Briefs${(creator.briefAssignments?.length ?? 0) > 0 ? ` (${creator.briefAssignments!.length})` : ''}`}>
              {(creator.briefAssignments?.length ?? 0) === 0 ? (
                <p className="text-xs text-off-black/40 italic">No briefs assigned yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {creator.briefAssignments!.map(a => (
                    <span
                      key={a.brief.id}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-off-black/5 text-off-black/70 text-xs rounded"
                    >
                      {a.brief.title}
                    </span>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Sample">
              <StaticRow label="Race" value={creator.raceName ? `${creator.raceName} ${creator.raceYear || ''}` : '—'} />
              <StaticRow label="Product" value={[creator.productSize, creator.frameType].filter(Boolean).join(' · ') || '—'} />
              <StaticRow label="Order" value={creator.sampleOrder?.orderNumber || 'Not yet created'} />
              <StaticRow label="Status" value={sampleStatusLabel(creator.sampleOrder?.status).label} />
            </Section>

            <Section title="Commission">
              <div>
                <Label>Model</Label>
                <select
                  value={draft.commissionModel}
                  onChange={(e) => setDraft({ ...draft, commissionModel: e.target.value as CommissionModel })}
                  className="w-full px-3 py-2 border border-border-gray rounded text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20"
                >
                  <option value="free_product">Free product only</option>
                  <option value="flat_per_asset">Flat per asset</option>
                  <option value="rev_share">Revenue share</option>
                  <option value="hybrid">Hybrid (base + %)</option>
                </select>
              </div>
              {draft.commissionModel === 'flat_per_asset' && (
                <NumberField
                  label="$ per approved asset"
                  value={(draft.commissionConfig as { per_asset_usd?: number })?.per_asset_usd ?? null}
                  onChange={(v) => setDraft({ ...draft, commissionConfig: { ...draft.commissionConfig, per_asset_usd: v } })}
                />
              )}
              {draft.commissionModel === 'rev_share' && (
                <NumberField
                  label="% of attributed revenue"
                  value={(draft.commissionConfig as { percent?: number })?.percent ?? null}
                  onChange={(v) => setDraft({ ...draft, commissionConfig: { ...draft.commissionConfig, percent: v } })}
                  suffix="%"
                />
              )}
              {draft.commissionModel === 'hybrid' && (
                <>
                  <NumberField
                    label="Base $ per asset"
                    value={(draft.commissionConfig as { per_asset_usd?: number })?.per_asset_usd ?? null}
                    onChange={(v) => setDraft({ ...draft, commissionConfig: { ...draft.commissionConfig, per_asset_usd: v } })}
                  />
                  <NumberField
                    label="+ % of attributed revenue"
                    value={(draft.commissionConfig as { percent?: number })?.percent ?? null}
                    onChange={(v) => setDraft({ ...draft, commissionConfig: { ...draft.commissionConfig, percent: v } })}
                    suffix="%"
                  />
                </>
              )}
              <TextField label="Notes" value={draft.commissionNotes} onChange={(v) => setDraft({ ...draft, commissionNotes: v })} placeholder="e.g. negotiated rate, special terms" multiline />
            </Section>

            <Section title="Whitelisting (Meta Partnership Ads)">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="whitelisting"
                  checked={draft.whitelistingEnabled}
                  onChange={(e) => setDraft({ ...draft, whitelistingEnabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="whitelisting" className="text-sm text-off-black">Enable for this creator</label>
              </div>
              {draft.whitelistingEnabled && (
                <TextField label="Meta Page ID" value={draft.metaPageId} onChange={(v) => setDraft({ ...draft, metaPageId: v })} placeholder="Creator's IG/FB page ID" />
              )}
            </Section>

            <Section title="Program Status">
              <div>
                <Label>Status</Label>
                <select
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value as CreatorStatus })}
                  className="w-full px-3 py-2 border border-border-gray rounded text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20"
                >
                  <option value="invited">Invited</option>
                  <option value="onboarded">Onboarded</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                </select>
              </div>
            </Section>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-border-gray">
            <button onClick={onClose} className="px-4 py-2 text-sm text-off-black/60 hover:bg-off-black/5 rounded transition-colors">
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              className="px-4 py-2 bg-off-black text-white text-sm font-medium rounded hover:opacity-90 disabled:opacity-40 transition-opacity inline-flex items-center gap-2"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isSaving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] font-semibold text-off-black/50 uppercase tracking-wider mb-2">{title}</h4>
      <div className="space-y-2.5">{children}</div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-off-black/60 mb-1">{children}</div>
}

function TextField({ label, value, onChange, type = 'text', placeholder, multiline }: {
  label: string
  value: string | null
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  multiline?: boolean
}) {
  return (
    <div>
      <Label>{label}</Label>
      {multiline ? (
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="w-full px-3 py-2 border border-border-gray rounded text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20 resize-none"
        />
      ) : (
        <input
          type={type}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-border-gray rounded text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20"
        />
      )}
    </div>
  )
}

function NumberField({ label, value, onChange, suffix }: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  suffix?: string
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="relative">
        <input
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="w-full px-3 py-2 border border-border-gray rounded text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20"
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-off-black/40">{suffix}</span>}
      </div>
    </div>
  )
}

function StaticRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-off-black/60">{label}</span>
      <span className="text-off-black/80 font-medium">{value}</span>
    </div>
  )
}
