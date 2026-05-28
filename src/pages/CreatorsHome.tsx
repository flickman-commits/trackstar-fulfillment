import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Package, DollarSign, TrendingUp, X, Copy, Check, Instagram, Plus, Send, Mail, Music2, Pencil, ChevronDown } from 'lucide-react'
import { apiFetch } from '@/lib/api'

type CreatorStatus = 'invited' | 'applied' | 'active' | 'paused'
type CommissionModel = 'free_product' | 'flat_per_asset' | 'rev_share' | 'hybrid'
type ContentStatus = 'not_received' | 'received' | 'edited' | 'posted'

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
  bibNumber: string | null
  finishTime: string | null
  productSize: string | null
  frameType: string | null
  shippingName: string | null
  shippingAddress1: string | null
  shippingAddress2: string | null
  shippingCity: string | null
  shippingState: string | null
  shippingZip: string | null
  shippingCountry: string | null
  contentStatus: ContentStatus
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
    trackingNumber?: string | null
    trackingCarrier?: string | null
    shippedAt?: string | null
  } | null
  briefAssignments?: Array<{ brief: BriefLite }>
  // Internal-only: per-creator sample COGS based on size + frame.
  sampleCostUsd?: number
  createdAt: string
  updatedAt: string
}

const STATUS_CONFIG: Record<CreatorStatus, { label: string; color: string; bg: string }> = {
  invited:    { label: 'Invited',    color: 'text-off-black/50', bg: 'bg-off-black/5' },
  onboarded:  { label: 'Onboarded',  color: 'text-blue-700',     bg: 'bg-blue-50' },
  active:     { label: 'Active',     color: 'text-emerald-700',  bg: 'bg-emerald-50' },
  paused:     { label: 'Paused',     color: 'text-amber-700',    bg: 'bg-amber-50' },
}

// Content-delivery pipeline — tracks the asset, not the creator's program
// standing. Owned/updated by Matt as he reviews / edits / publishes.
const CONTENT_STATUS_CONFIG: Record<ContentStatus, { label: string; color: string; bg: string }> = {
  not_received: { label: 'Not received', color: 'text-off-black/50', bg: 'bg-off-black/5' },
  received:     { label: 'Received',     color: 'text-blue-700',     bg: 'bg-blue-50' },
  edited:       { label: 'Edited',       color: 'text-amber-700',    bg: 'bg-amber-50' },
  posted:       { label: 'Posted',       color: 'text-emerald-700',  bg: 'bg-emerald-50' },
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
    applied: number
    paused: number
    appliedThisMonth: number
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
  shortLabel,
  value,
  subLabel,
  placeholder = false,
}: {
  icon: React.ReactNode
  label: string
  shortLabel?: string  // Used on mobile when the full label is too long
  value: string | number
  subLabel?: string
  placeholder?: boolean
}) {
  return (
    <div className={`relative bg-white border rounded-md p-3 md:p-5 ${
      placeholder ? 'border-dashed border-off-black/20' : 'border-border-gray shadow-sm'
    }`}>
      <div className="flex items-center gap-1.5 md:gap-2 text-off-black/50 mb-1.5 md:mb-2">
        <span className="hidden md:inline-flex">{icon}</span>
        <span className="text-[10px] md:text-xs font-semibold uppercase tracking-tight md:tracking-wider leading-tight">
          {shortLabel ? <><span className="md:hidden">{shortLabel}</span><span className="hidden md:inline">{label}</span></> : label}
        </span>
      </div>
      <div className={`text-xl md:text-3xl font-bold ${placeholder ? 'text-off-black/30' : 'text-off-black'}`}>
        {value}
      </div>
      {subLabel && <div className="text-[10px] md:text-xs text-off-black/50 mt-1 hidden md:block">{subLabel}</div>}
      {placeholder && (
        <span
          className="absolute top-2 right-2 px-1.5 py-0.5 bg-off-black/5 text-off-black/40 text-[9px] font-medium rounded uppercase tracking-wider hidden md:inline"
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
  const [decliningId, setDecliningId] = useState<string | null>(null)

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

  // Creators that submitted the public application but haven't been approved
  // yet. They show in the Creators Applied queue above the main list.
  const pendingSampleRequests = creators.filter(c =>
    c.status === 'applied' && !c.sampleOrder
  )
  const otherCreators = creators.filter(c =>
    !(c.status === 'applied' && !c.sampleOrder)
  )

  const handleDeclineSample = async (creator: Creator) => {
    if (!confirm(`Decline sample request from ${creator.name || 'this creator'}? They'll be paused — no fulfillment order will be created.`)) return
    setDecliningId(creator.id)
    try {
      const res = await apiFetch('/api/orders/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'decline-creator-sample', creatorId: creator.id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Decline failed: ${res.status}`)
      }
      await loadAll()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to decline')
    } finally {
      setDecliningId(null)
    }
  }

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
    <div className="min-h-screen bg-[#F0F0F0]">
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
              className="px-3 py-1.5 text-xs md:text-sm font-medium text-off-black/70 bg-white border border-border-gray rounded-md hover:bg-off-black/5 transition-colors"
            >
              Briefs
            </Link>
            <Link
              to="/"
              className="px-3 py-1.5 text-xs md:text-sm font-medium text-off-black/70 bg-white border border-border-gray rounded-md hover:bg-off-black/5 transition-colors"
            >
              Fulfillment
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
            <div className="grid grid-cols-3 gap-2 md:gap-4">
              <Tile
                icon={<TrendingUp className="w-4 h-4" />}
                label="New Creators This Month"
                shortLabel="New This Mo."
                value={metrics.creators.appliedThisMonth}
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
                shortLabel="Spent"
                value={formatUsd(metrics.samples.costEstimatedUsd)}
                subLabel="COGS by size + frame"
                placeholder={metrics.samples.costIsPlaceholder}
              />
            </div>

            {/* Creators Applied — applicants awaiting Matt's approval */}
            {pendingSampleRequests.length > 0 && (
              <div className="mt-10">
                <h2 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-3">
                  Creators Applied ({pendingSampleRequests.length})
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
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDeclineSample(c)}
                          disabled={decliningId === c.id || approvingId === c.id}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-border-gray hover:bg-off-black/5 text-off-black/70 text-xs font-medium rounded transition-colors disabled:opacity-40 whitespace-nowrap"
                        >
                          {decliningId === c.id ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /> Declining…</>
                          ) : (
                            <><X className="w-3 h-3" /> Decline</>
                          )}
                        </button>
                        <button
                          onClick={() => handleApproveSample(c)}
                          disabled={approvingId === c.id || decliningId === c.id}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded transition-colors disabled:opacity-40 whitespace-nowrap"
                        >
                          {approvingId === c.id ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /> Approving…</>
                          ) : (
                            <><Send className="w-3 h-3" /> Approve & notify Elí</>
                          )}
                        </button>
                      </div>
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
                        <th className="text-left px-3 py-3 text-xs font-semibold text-off-black/60 uppercase tracking-wider w-32">Content</th>
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
                            <td className="px-3 py-3.5">
                              {(() => {
                                const cs = CONTENT_STATUS_CONFIG[c.contentStatus] || CONTENT_STATUS_CONFIG.not_received
                                return (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cs.bg} ${cs.color}`}>
                                    {cs.label}
                                  </span>
                                )
                              })()}
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
          onDeleted={async () => {
            setSelectedCreator(null)
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
  onDeleted,
}: {
  creator: Creator
  onClose: () => void
  onSaved: (updated: Creator) => void
  onDeleted: () => void | Promise<void>
}) {
  const [draft, setDraft] = useState<Creator>(creator)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [isEditingSample, setIsEditingSample] = useState(false)
  const [isEditingShipping, setIsEditingShipping] = useState(false)

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

  const handleDelete = async () => {
    const shippedOrCompleted = !!(creator.sampleOrder?.trackingNumber || creator.sampleOrder?.shippedAt || creator.sampleOrder?.status === 'completed')
    const orderNote = creator.sampleOrder
      ? shippedOrCompleted
        ? `\n\nThe linked sample order ${creator.sampleOrder.orderNumber} has already shipped/completed — it will stay in the fulfillment queue.`
        : `\n\nThe linked sample order ${creator.sampleOrder.orderNumber} (not yet shipped) will also be deleted.`
      : ''
    if (!confirm(`Delete creator "${creator.name || 'unnamed'}"? This can't be undone.${orderNote}`)) return
    setIsDeleting(true)
    try {
      const res = await apiFetch('/api/orders/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-creator', creatorId: creator.id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Delete failed: ${res.status}`)
      }
      await onDeleted()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const updates = {
        // Profile
        name: draft.name,
        email: draft.email,
        instagramHandle: draft.instagramHandle,
        tiktokHandle: draft.tiktokHandle,
        // Sample
        raceName: draft.raceName,
        raceYear: draft.raceYear,
        bibNumber: draft.bibNumber,
        finishTime: draft.finishTime,
        productSize: draft.productSize,
        frameType: draft.frameType,
        // Shipping — server mirrors these onto the linked fulfillment order
        shippingName: draft.shippingName,
        shippingAddress1: draft.shippingAddress1,
        shippingAddress2: draft.shippingAddress2,
        shippingCity: draft.shippingCity,
        shippingState: draft.shippingState,
        shippingZip: draft.shippingZip,
        shippingCountry: draft.shippingCountry,
        // Commission + lifecycle
        commissionModel: draft.commissionModel,
        commissionConfig: draft.commissionConfig,
        commissionNotes: draft.commissionNotes,
        whitelistingEnabled: draft.whitelistingEnabled,
        metaPageId: draft.metaPageId,
        status: draft.status,
        contentStatus: draft.contentStatus,
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
          {/* Header — name only. Program + content status moved into colored
              dropdowns just below the invite link so they're easy to scan/edit. */}
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold text-off-black">
              {creator.name || 'Pending Creator'}
            </h3>
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
            {/* Two top-level statuses — color-tinted dropdowns. Program = where
                the creator stands in our pipeline. Content = where the asset is. */}
            <div className="grid grid-cols-2 gap-3">
              <StatusSelect<CreatorStatus>
                label="Program"
                value={draft.status}
                onChange={(v) => setDraft({ ...draft, status: v })}
                options={['invited', 'applied', 'active', 'paused']}
                config={STATUS_CONFIG}
              />
              <StatusSelect<ContentStatus>
                label="Content"
                value={draft.contentStatus}
                onChange={(v) => setDraft({ ...draft, contentStatus: v })}
                options={['not_received', 'received', 'edited', 'posted']}
                config={CONTENT_STATUS_CONFIG}
              />
            </div>

            <EditableCard
              title="Profile"
              isEditing={isEditingProfile}
              onToggle={() => setIsEditingProfile(v => !v)}
            >
              {isEditingProfile ? (
                <div className="space-y-2.5">
                  <TextField label="Name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
                  <TextField label="Email" value={draft.email} onChange={(v) => setDraft({ ...draft, email: v })} type="email" />
                  <TextField label="Instagram" value={draft.instagramHandle} onChange={(v) => setDraft({ ...draft, instagramHandle: v })} placeholder="@handle or full URL" />
                  <TextField label="TikTok" value={draft.tiktokHandle} onChange={(v) => setDraft({ ...draft, tiktokHandle: v })} placeholder="@handle or full URL" />
                </div>
              ) : (
                <div className="space-y-2">
                  <ProfileRow label="Name" value={draft.name} />
                  <ProfileRow
                    label="Email"
                    value={draft.email}
                    href={draft.email ? `mailto:${draft.email}` : null}
                    icon={<Mail className="w-3.5 h-3.5" />}
                  />
                  <ProfileRow
                    label="Instagram"
                    value={draft.instagramHandle}
                    display={socialHandle(draft.instagramHandle)}
                    href={socialUrl('instagram', draft.instagramHandle)}
                    icon={<Instagram className="w-3.5 h-3.5" />}
                  />
                  <ProfileRow
                    label="TikTok"
                    value={draft.tiktokHandle}
                    display={socialHandle(draft.tiktokHandle)}
                    href={socialUrl('tiktok', draft.tiktokHandle)}
                    icon={<Music2 className="w-3.5 h-3.5" />}
                  />
                </div>
              )}
            </EditableCard>

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

            <EditableCard
              title="Sample Details"
              isEditing={isEditingSample}
              onToggle={() => setIsEditingSample(v => !v)}
            >
              {isEditingSample ? (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="Race" value={draft.raceName} onChange={(v) => setDraft({ ...draft, raceName: v })} placeholder="Boston Marathon" />
                    <NumberField label="Year" value={draft.raceYear} onChange={(v) => setDraft({ ...draft, raceYear: v })} />
                    <TextField label="Bib #" value={draft.bibNumber} onChange={(v) => setDraft({ ...draft, bibNumber: v })} />
                    <TextField label="Finish time" value={draft.finishTime} onChange={(v) => setDraft({ ...draft, finishTime: v })} placeholder="3:42:18" />
                    <TextField label="Size" value={draft.productSize} onChange={(v) => setDraft({ ...draft, productSize: v })} placeholder='18x24"' />
                    <TextField label="Frame" value={draft.frameType} onChange={(v) => setDraft({ ...draft, frameType: v })} placeholder="Black / White / Natural" />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <ProfileRow
                    label="Race"
                    value={draft.raceName ? `${draft.raceName}${draft.raceYear ? ` · ${draft.raceYear}` : ''}` : null}
                  />
                  <ProfileRow label="Bib #" value={draft.bibNumber} />
                  <ProfileRow label="Finish time" value={draft.finishTime} />
                  <ProfileRow label="Size" value={draft.productSize} />
                  <ProfileRow label="Frame" value={draft.frameType} />
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-border-gray space-y-2">
                <ProfileRow
                  label="Cost (COGS)"
                  value={creator.sampleCostUsd ? formatUsd(creator.sampleCostUsd) : '—'}
                />
                <ProfileRow
                  label="Order"
                  value={creator.sampleOrder?.orderNumber || 'Not yet created'}
                />
                <ProfileRow
                  label="Status"
                  value={sampleStatusLabel(creator.sampleOrder?.status).label}
                />
              </div>
            </EditableCard>

            <EditableCard
              title="Shipping & Tracking"
              isEditing={isEditingShipping}
              onToggle={() => setIsEditingShipping(v => !v)}
            >
              {isEditingShipping ? (
                <div className="space-y-2.5">
                  <p className="text-[10px] text-off-black/50 leading-relaxed">
                    Edits here are mirrored onto the fulfillment order so Elí ships to the new address.
                  </p>
                  <TextField label="Recipient name" value={draft.shippingName} onChange={(v) => setDraft({ ...draft, shippingName: v })} />
                  <TextField label="Address line 1" value={draft.shippingAddress1} onChange={(v) => setDraft({ ...draft, shippingAddress1: v })} />
                  <TextField label="Address line 2" value={draft.shippingAddress2} onChange={(v) => setDraft({ ...draft, shippingAddress2: v })} placeholder="Apt / suite (optional)" />
                  <div className="grid grid-cols-3 gap-3">
                    <TextField label="City" value={draft.shippingCity} onChange={(v) => setDraft({ ...draft, shippingCity: v })} />
                    <TextField label="State" value={draft.shippingState} onChange={(v) => setDraft({ ...draft, shippingState: v })} />
                    <TextField label="ZIP" value={draft.shippingZip} onChange={(v) => setDraft({ ...draft, shippingZip: v })} />
                  </div>
                  <TextField label="Country" value={draft.shippingCountry} onChange={(v) => setDraft({ ...draft, shippingCountry: v })} placeholder="US" />
                </div>
              ) : (
                <AddressBlock
                  name={draft.shippingName}
                  address1={draft.shippingAddress1}
                  address2={draft.shippingAddress2}
                  city={draft.shippingCity}
                  state={draft.shippingState}
                  zip={draft.shippingZip}
                  country={draft.shippingCountry}
                />
              )}
              {creator.sampleOrder && (
                <div className="mt-3 pt-3 border-t border-border-gray">
                  <TrackingField
                    creatorId={creator.id}
                    initialNumber={creator.sampleOrder.trackingNumber || ''}
                    initialCarrier={creator.sampleOrder.trackingCarrier || ''}
                    shippedAt={creator.sampleOrder.shippedAt || null}
                    onSaved={(updated) => onSaved({
                      ...creator,
                      sampleOrder: creator.sampleOrder ? { ...creator.sampleOrder, ...updated } : creator.sampleOrder,
                    })}
                  />
                </div>
              )}
            </EditableCard>

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

          </div>

          {/* Footer — Delete pinned to the far left (destructive actions get
              spatial separation from primary actions). */}
          <div className="flex items-center justify-between gap-2 mt-6 pt-4 border-t border-border-gray">
            <button
              onClick={handleDelete}
              disabled={isDeleting || isSaving}
              className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              {isDeleting ? 'Deleting…' : 'Delete creator'}
            </button>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-off-black/60 hover:bg-off-black/5 rounded transition-colors">
                Close
              </button>
              <button
                onClick={handleSave}
                disabled={!isDirty || isSaving || isDeleting}
                className="px-4 py-2 bg-off-black text-white text-sm font-medium rounded hover:opacity-90 disabled:opacity-40 transition-opacity inline-flex items-center gap-2"
              >
                {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Normalize a social input (handle or URL) into a clickable URL.
// Accepts: "@handle", "handle", "https://instagram.com/handle", "instagram.com/handle"
function socialUrl(platform: 'instagram' | 'tiktok', raw: string | null): string | null {
  if (!raw) return null
  const v = raw.trim()
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return v
  const handle = v.replace(/^@/, '').replace(/^.*\.com\//i, '').replace(/\/$/, '')
  if (!handle) return null
  return platform === 'tiktok'
    ? `https://www.tiktok.com/@${handle.replace(/^@/, '')}`
    : `https://www.instagram.com/${handle}`
}

// Extract a friendly display handle from either a raw handle or a full URL.
function socialHandle(raw: string | null): string | null {
  if (!raw) return null
  const v = raw.trim()
  if (!v) return null
  if (!/^https?:\/\//i.test(v)) return v
  // Pull the trailing path segment from a URL — e.g. /_butch.82/ → @_butch.82
  const match = v.match(/\/(@?[^/?]+)\/?(?:[?#].*)?$/)
  if (!match) return v
  const seg = match[1].replace(/^@/, '')
  return `@${seg}`
}

// Card with a title row and an Edit/Done toggle in the corner. Children
// decide what to render in each mode — the card just owns the chrome.
function EditableCard({ title, isEditing, onToggle, children }: {
  title: string
  isEditing: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-border-gray rounded-md p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[10px] font-semibold text-off-black/50 uppercase tracking-wider">{title}</h4>
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-off-black/60 hover:text-off-black hover:bg-off-black/5 rounded transition-colors"
        >
          {isEditing ? <><Check className="w-3 h-3" /> Done</> : <><Pencil className="w-3 h-3" /> Edit</>}
        </button>
      </div>
      {children}
    </div>
  )
}

// Color-tinted dropdown — background reflects the currently selected value.
// Used for the Program + Content status pickers at the top of the drawer so
// a glance tells you both states without having to read labels.
function StatusSelect<T extends string>({
  label, value, onChange, options, config,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: T[]
  config: Record<T, { label: string; bg: string; color: string }>
}) {
  const cfg = config[value]
  return (
    <div>
      <Label>{label}</Label>
      <div className={`relative rounded border border-current/10 ${cfg.bg}`}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className={`w-full appearance-none bg-transparent px-3 py-2 pr-8 text-sm font-medium ${cfg.color} focus:outline-none focus:ring-2 focus:ring-off-black/20 cursor-pointer`}
        >
          {options.map(opt => (
            <option key={opt} value={opt} className="bg-white text-off-black font-normal">
              {config[opt].label}
            </option>
          ))}
        </select>
        <ChevronDown className={`w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${cfg.color}`} />
      </div>
    </div>
  )
}

function AddressBlock({ name, address1, address2, city, state, zip, country }: {
  name: string | null
  address1: string | null
  address2: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string | null
}) {
  const cityLine = [city, state].filter(Boolean).join(', ') + (zip ? ` ${zip}` : '')
  const hasAny = name || address1 || address2 || cityLine.trim() || country
  if (!hasAny) {
    return <div className="text-sm text-off-black/30 italic">No address on file</div>
  }
  return (
    <div className="text-sm text-off-black/80 leading-relaxed">
      {name && <div className="font-medium text-off-black">{name}</div>}
      {address1 && <div>{address1}</div>}
      {address2 && <div>{address2}</div>}
      {cityLine.trim() && <div>{cityLine}</div>}
      {country && country !== 'US' && <div>{country}</div>}
    </div>
  )
}

function ProfileRow({
  label, value, display, href, icon,
}: {
  label: string
  value: string | null
  display?: string | null     // optional friendlier rendering (e.g. handle vs URL)
  href?: string | null
  icon?: React.ReactNode
}) {
  const text = display ?? value
  return (
    <div className="flex items-baseline gap-3 text-sm">
      <span className="text-off-black/50 text-xs w-20 shrink-0">{label}</span>
      {text ? (
        href ? (
          <a
            href={href}
            target={href.startsWith('mailto:') ? undefined : '_blank'}
            rel={href.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
            className="inline-flex items-center gap-1.5 text-off-black hover:text-[#4F2DD4] hover:underline break-all"
          >
            {icon && <span className="text-off-black/40">{icon}</span>}
            <span>{text}</span>
          </a>
        ) : (
          <span className="text-off-black/80 break-all">{text}</span>
        )
      ) : (
        <span className="text-off-black/30 italic">—</span>
      )}
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

// Inline tracking-number editor in the creator drawer. Saving a non-empty
// number sets `shippedAt` server-side and lights up the "Shipped" stage in
// the creator portal. Clearing the number reverts to "Approved".
function TrackingField({
  creatorId,
  initialNumber,
  initialCarrier,
  shippedAt,
  onSaved,
}: {
  creatorId: string
  initialNumber: string
  initialCarrier: string
  shippedAt: string | null
  onSaved: (updated: { trackingNumber: string | null; trackingCarrier: string | null; shippedAt: string | null }) => void
}) {
  const [number, setNumber] = useState(initialNumber)
  const [carrier, setCarrier] = useState(initialCarrier)
  const [isSaving, setIsSaving] = useState(false)

  const isDirty = number !== initialNumber || carrier !== initialCarrier

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const res = await apiFetch('/api/orders/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set-creator-sample-tracking',
          creatorId,
          trackingNumber: number,
          trackingCarrier: carrier,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Save failed: ${res.status}`)
      }
      const { order } = await res.json()
      onSaved({
        trackingNumber: order.trackingNumber,
        trackingCarrier: order.trackingCarrier,
        shippedAt: order.shippedAt,
      })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save tracking')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="pt-2 border-t border-border-gray">
      <Label>Tracking{shippedAt && <span className="text-emerald-700 ml-2 normal-case">· marked shipped {new Date(shippedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}</Label>
      <div className="flex gap-2">
        <input
          type="text"
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          placeholder="Carrier (USPS, UPS…)"
          className="w-32 px-2.5 py-1.5 border border-border-gray rounded text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20"
        />
        <input
          type="text"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="Tracking number"
          className="flex-1 px-2.5 py-1.5 border border-border-gray rounded text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20"
        />
        <button
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          className="px-3 py-1.5 bg-off-black text-white text-xs font-medium rounded hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center gap-1"
        >
          {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          Save
        </button>
      </div>
      <p className="text-[10px] text-off-black/40 mt-1">
        Saving a tracking number marks the sample as <strong>Shipped</strong> in the creator's portal.
      </p>
    </div>
  )
}
