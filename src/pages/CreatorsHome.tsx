import PageHeader from '@/components/PageHeader'
import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Loader2, X, Copy, Check, Instagram, Plus, Mail, Music2, Pencil, ChevronDown, ChevronLeft, Search, ExternalLink } from 'lucide-react'
import { btnSecondary, pageShell, sectionLabel } from '@/lib/ui'
import { apiFetch } from '@/lib/api'
import { TRYBE_URL } from '@/lib/creatorLinks'

type CreatorStatus = 'invited' | 'applied' | 'active' | 'paused' | 'denied'
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
  // Application questions from the onboarding wizard
  bestContentLinks: string | null  // legacy — field removed from the wizard
  whyWorkWithUs: string | null
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
  notes: string | null
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
  applied:    { label: 'Applied',    color: 'text-blue-700',     bg: 'bg-blue-50' },
  active:     { label: 'Active',     color: 'text-emerald-700',  bg: 'bg-emerald-50' },
  paused:     { label: 'Paused',     color: 'text-amber-700',    bg: 'bg-amber-50' },
  denied:     { label: 'Denied',     color: 'text-red-700',      bg: 'bg-red-50' },
}

// Content-delivery pipeline — tracks the asset, not the creator's program
// standing. Owned/updated by Matt as he reviews / edits / publishes.
const CONTENT_STATUS_CONFIG: Record<ContentStatus, { label: string; color: string; bg: string }> = {
  not_received: { label: 'Not received', color: 'text-off-black/50', bg: 'bg-off-black/5' },
  received:     { label: 'Received',     color: 'text-blue-700',     bg: 'bg-blue-50' },
  edited:       { label: 'Edited',       color: 'text-amber-700',    bg: 'bg-amber-50' },
  posted:       { label: 'Posted',       color: 'text-emerald-700',  bg: 'bg-emerald-50' },
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

type CreatorsView = 'applied' | 'active' | 'all' | 'denied' | 'ads'

const VIEW_LABEL: Record<CreatorsView, string> = {
  applied: 'Applied',
  active: 'Active',
  all: 'All',
  denied: 'Denied',
  ads: 'Winning ads',
}

interface WinningAd {
  id: string
  title: string
  url: string
  imageUrl: string | null
  notes: string | null
  createdAt: string
}

/** An applicant still waiting on a yes or no. */
const isApplicant = (c: Creator) => c.status === 'applied' && !c.sampleOrder

export default function CreatorsHome() {
  const [metrics, setMetrics] = useState<HomeMetrics | null>(null)
  const [creators, setCreators] = useState<Creator[]>([])
  const [briefs, setBriefs] = useState<BriefLite[]>([])
  const [ads, setAds] = useState<WinningAd[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [decliningId, setDecliningId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  // The open creator lives in the address bar as /creators/<id> and the view
  // as ?view=, so a reload, the back button and a shared link land in place.
  const { creatorId = null } = useParams<{ creatorId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const viewParam = searchParams.get('view') as CreatorsView | null

  const loadAll = useCallback(async () => {
    try {
      const [metricsRes, creatorsRes, briefsRes, adsRes] = await Promise.all([
        apiFetch('/api/orders/actions?action=creator-home-metrics'),
        apiFetch('/api/orders/actions?action=list-creators'),
        apiFetch('/api/orders/actions?action=list-briefs'),
        apiFetch('/api/creators/ads'),
      ])
      if (!metricsRes.ok) throw new Error(`Metrics failed: ${metricsRes.status}`)
      if (!creatorsRes.ok) throw new Error(`Creators failed: ${creatorsRes.status}`)
      if (!briefsRes.ok) throw new Error(`Briefs failed: ${briefsRes.status}`)
      setMetrics(await metricsRes.json())
      const { creators } = await creatorsRes.json()
      const { briefs } = await briefsRes.json()
      setCreators(creators)
      setBriefs(briefs.filter((b: BriefLite) => b.status === 'active'))
      if (adsRes.ok) setAds((await adsRes.json()).ads || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const applicants = creators.filter(isApplicant)
  // Default to the applicants while any are waiting; otherwise the active list.
  const view: CreatorsView = viewParam && viewParam in VIEW_LABEL ? viewParam : applicants.length ? 'applied' : 'active'
  const setView = (v: CreatorsView) => setSearchParams(v === (applicants.length ? 'applied' : 'active') ? {} : { view: v }, { replace: true })

  const selected = creatorId ? creators.find(c => c.id === creatorId) || null : null
  const openCreator = (c: Creator) => navigate({ pathname: `/creators/${c.id}`, search: searchParams.toString() })
  const closeCreator = useCallback(() => navigate({ pathname: '/creators', search: searchParams.toString() }), [navigate, searchParams])

  useEffect(() => {
    if (!creatorId) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === 'Escape' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) closeCreator()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [creatorId, closeCreator])

  // Search across name, email, Instagram, race and sample order number.
  const q = query.trim().toLowerCase().replace(/^@/, '')
  const matches = (c: Creator) => !q || [c.name, c.email, c.instagramHandle, c.raceName, c.sampleOrder?.orderNumber]
    .some(v => String(v || '').toLowerCase().includes(q))
  const inView: Record<Exclude<CreatorsView, 'ads'>, Creator[]> = {
    applied: applicants,
    active: creators.filter(c => !isApplicant(c) && c.status !== 'denied'),
    all: creators,
    denied: creators.filter(c => c.status === 'denied'),
  }
  const counts = { applied: inView.applied.length, active: inView.active.length, all: inView.all.length, denied: inView.denied.length, ads: ads.length }
  // A search reaches past the view, so a name is found wherever it is.
  const list = view === 'ads' ? [] : (q ? creators : inView[view]).filter(matches)

  const handleDeclineSample = async (creator: Creator) => {
    if (!confirm(`Decline ${creator.name || 'this creator'}? They'll be marked denied and no sample is made. You can un-deny them later from the Denied view.`)) return
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

  const decide = (c: Creator) => isApplicant(c) ? (
    <div className="flex items-center gap-2 shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); handleDeclineSample(c) }}
        disabled={decliningId === c.id || approvingId === c.id}
        className={btnSecondary}
      >
        {decliningId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />} Decline
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); handleApproveSample(c) }}
        disabled={approvingId === c.id || decliningId === c.id}
        className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-40 whitespace-nowrap"
      >
        {approvingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
      </button>
    </div>
  ) : null

  const statsLine = metrics && (
    <span className="text-xs text-off-black/50 whitespace-nowrap">
      {metrics.creators.appliedThisMonth} new this month · {metrics.samples.total} samples · {formatUsd(metrics.samples.costEstimatedUsd)} spent
    </span>
  )

  return (
    <div className={pageShell}>
      <div className="px-3 md:px-5 w-full flex flex-col h-full">
        {!selected && (
          <PageHeader
            title="Creators"
            subtitle={statsLine}
            pill={applicants.length ? `${applicants.length} applied` : undefined}
            control={
              <select value={view} onChange={e => setView(e.target.value as CreatorsView)} className="text-xs font-medium bg-white border border-border-gray rounded-full pl-3 pr-7 py-1.5 appearance-none">
                {(Object.keys(VIEW_LABEL) as CreatorsView[]).map(k => <option key={k} value={k}>{VIEW_LABEL[k]} ({counts[k]})</option>)}
              </select>
            }
          />
        )}
        <div className="pt-4 md:pt-5 pb-3 hidden md:flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/trackstar-stars-transparent.png" alt="Trackstar" className="h-7 md:h-8 w-auto shrink-0 object-contain" />
            <h1 className="text-2xl md:text-[28px] font-bold text-off-black leading-none">Creators</h1>
            {isLoading && <Loader2 className="w-4 h-4 animate-spin text-off-black/30" />}
          </div>
          <div className="flex-1 flex items-center justify-end gap-2 md:gap-3 min-w-0">
            <div className="relative flex-1 max-w-[760px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-off-black/40" />
              <input
                value={query}
                onChange={e => { setQuery(e.target.value); if (selected) closeCreator() }}
                placeholder="Search by name, email, Instagram, race or order #"
                className="w-full pl-9 pr-8 py-2 bg-white border border-border-gray rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-off-black/10 focus:border-off-black/30"
              />
              {query && <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-off-black/40 hover:text-off-black"><X className="w-3.5 h-3.5" /></button>}
            </div>
            <a href={TRYBE_URL} target="_blank" rel="noopener noreferrer" className={btnSecondary} title="Where creators upload content, handle revisions and get into the ad account">
              Trybe <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <Link to="/briefs" className={btnSecondary}>Briefs</Link>
            <button onClick={() => setShowInvite(true)} className="inline-flex items-center gap-1.5 px-3 py-2 bg-dark-fill text-white text-sm font-medium rounded-md hover:opacity-90 transition-opacity whitespace-nowrap">
              <Plus className="w-4 h-4" /> New invite
            </button>
          </div>
        </div>

        {error && !isLoading && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 mb-3 text-sm text-red-800 flex-shrink-0">{error}</div>
        )}

        {selected ? (
          <div className="flex-1 min-h-0 overflow-y-auto pb-36 md:pb-8">
            <CreatorDrawer
              key={selected.id}
              creator={selected}
              onClose={closeCreator}
              decide={decide(selected)}
              onSaved={async () => { await loadAll() }}
              onDeleted={async () => { closeCreator(); await loadAll() }}
            />
          </div>
        ) : creatorId && isLoading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-off-black/30" /></div>
        ) : (
          <section className="flex-1 min-h-0 pb-3">
            <div className="h-full bg-white border border-border-gray rounded-lg shadow-sm overflow-hidden flex flex-col">
              {/* Views, with the program's numbers on the right. */}
              <div className="hidden md:flex items-center justify-between gap-3 px-3 py-2.5 border-b border-border-gray flex-shrink-0">
                <div className="flex items-center gap-1 overflow-x-auto">
                  {(Object.keys(VIEW_LABEL) as CreatorsView[]).map(k => (
                    <button
                      key={k}
                      onClick={() => setView(k)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${view === k && !q ? 'bg-dark-fill text-white' : 'text-off-black/70 hover:bg-subtle-gray'}`}
                    >
                      {VIEW_LABEL[k]}
                      <span className={`text-xs ${view === k && !q ? 'text-white/70' : k === 'applied' && counts.applied ? 'text-amber-700 font-semibold' : 'text-off-black/40'}`}>{counts[k]}</span>
                    </button>
                  ))}
                </div>
                {statsLine}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto">
                {view === 'ads' && !q ? (
                  <WinningAdsPanel ads={ads} onChanged={loadAll} />
                ) : isLoading ? (
                  <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-off-black/30" /></div>
                ) : list.length === 0 ? (
                  <div className="text-center py-20 px-6 text-sm text-off-black/50">
                    {q ? `No creators match "${query}".` : view === 'applied' ? 'No one is waiting on a decision.' : 'Nobody here yet.'}
                  </div>
                ) : (
                  <ul className="divide-y divide-border-gray">
                    {list.map(c => <CreatorRow key={c.id} c={c} onOpen={() => openCreator(c)} decide={decide(c)} />)}
                  </ul>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

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

/** One creator in the list. Applicants show their pitch and the decision buttons. */
function CreatorRow({ c, onOpen, decide }: { c: Creator; onOpen: () => void; decide: React.ReactNode }) {
  const statusCfg = STATUS_CONFIG[c.status]
  const sample = sampleStatusLabel(c.sampleOrder?.status)
  const content = CONTENT_STATUS_CONFIG[c.contentStatus] || CONTENT_STATUS_CONFIG.not_received
  const race = c.raceName ? `${c.raceName}${c.raceYear ? ` ${c.raceYear}` : ''}` : null
  const facts = [race, c.productSize && c.frameType ? `${c.productSize} ${c.frameType}` : null, c.shippingCity && c.shippingState ? `${c.shippingCity}, ${c.shippingState}` : null].filter(Boolean)
  return (
    <li onClick={onOpen} className="px-4 py-3.5 hover:bg-subtle-gray cursor-pointer transition-colors flex flex-col md:flex-row md:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-off-black">{c.name || <span className="text-off-black/40 italic font-normal">Not yet onboarded</span>}</span>
          {c.instagramHandle && (
            <span className="inline-flex items-center gap-1 text-xs text-off-black/50"><Instagram className="w-3 h-3" />{socialHandle(c.instagramHandle)}</span>
          )}
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${statusCfg.bg} ${statusCfg.color}`}>{statusCfg.label}</span>
        </div>
        {facts.length > 0 && <div className="text-xs text-off-black/55 mt-1">{facts.join(' · ')}</div>}
        {isApplicant(c) && c.whyWorkWithUs && (
          <p className="text-xs text-off-black/70 mt-1.5 leading-relaxed line-clamp-2 max-w-[90ch]">{c.whyWorkWithUs}</p>
        )}
      </div>
      {decide || (
        <div className="flex items-center gap-4 text-xs shrink-0">
          <span className={sample.color}>{sample.label}</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded font-medium ${content.bg} ${content.color}`}>{content.label}</span>
          <span className="text-off-black/40 hidden lg:inline w-24 text-right">{new Date(c.invitedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>
      )}
    </li>
  )
}

/**
 * Ads that are working, so the team and the creators can see what to make
 * more of. Creators see the same list in their portal. Also holds the links
 * creators need: Trybe, and the community once it exists.
 */
function WinningAdsPanel({ ads, onChanged }: { ads: WinningAd[]; onChanged: () => void | Promise<void> }) {
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [f, setF] = useState({ title: '', url: '', imageUrl: '', notes: '' })
  const field = 'w-full px-3 py-2 text-sm border border-border-gray rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-off-black/10'

  const save = async () => {
    setBusy(true); setErr(null)
    try {
      const res = await apiFetch('/api/creators/ads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not add the ad')
      setF({ title: '', url: '', imageUrl: '', notes: '' }); setAdding(false)
      await onChanged()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not add the ad') } finally { setBusy(false) }
  }
  const remove = async (ad: WinningAd) => {
    if (!confirm(`Remove "${ad.title}" from winning ads? Creators will stop seeing it.`)) return
    const res = await apiFetch(`/api/creators/ads?id=${encodeURIComponent(ad.id)}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || 'Could not remove the ad'); return }
    await onChanged()
  }

  return (
    <div className="p-4 md:p-5 space-y-5">
      <div className="grid md:grid-cols-2 gap-3">
        <a href={TRYBE_URL} target="_blank" rel="noopener noreferrer" className="group border border-border-gray rounded-md p-4 hover:bg-subtle-gray transition-colors">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-off-black">Trybe <ExternalLink className="w-3.5 h-3.5 text-off-black/40" /></div>
          <p className="text-xs text-off-black/55 mt-1">Where creators upload content, do revisions and get it into our ad account. Creators sign up at jointrybe.com.</p>
        </a>
        <div className="border border-dashed border-border-gray rounded-md p-4" title="Link coming once the community is live">
          <div className="flex items-center gap-2 text-sm font-semibold text-off-black/50">Community <span className="px-1.5 py-0.5 bg-off-black/5 text-off-black/45 text-[10px] font-medium rounded uppercase tracking-wider">Coming soon</span></div>
          <p className="text-xs text-off-black/45 mt-1">Where creators will learn more about which ads are working.</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className={sectionLabel}>Winning ads <span className="text-off-black/30">({ads.length})</span></h2>
          {!adding && <button onClick={() => setAdding(true)} className={btnSecondary}><Plus className="w-3.5 h-3.5" /> Add winning ad</button>}
        </div>
        {adding && (
          <div className="border border-border-gray rounded-md p-4 mb-4 space-y-2.5 bg-subtle-gray/50">
            <div className="grid md:grid-cols-2 gap-2.5">
              <input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Title, e.g. Chicago unboxing, POV hook" className={field} autoFocus />
              <input value={f.url} onChange={e => setF({ ...f, url: e.target.value })} placeholder="Link to the ad or video" className={field} />
            </div>
            <input value={f.imageUrl} onChange={e => setF({ ...f, imageUrl: e.target.value })} placeholder="Thumbnail image link (optional)" className={field} />
            <textarea value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} rows={3} placeholder="Why it works: the hook, the angle, the numbers (optional)" className={`${field} resize-none`} />
            {err && <p className="text-xs text-red-600">{err}</p>}
            <div className="flex gap-2">
              <button onClick={save} disabled={busy || !f.title.trim() || !f.url.trim()} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-dark-fill text-white rounded-md disabled:opacity-50">
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Add
              </button>
              <button onClick={() => { setAdding(false); setErr(null) }} className="px-3 py-2 text-sm text-off-black/60">Cancel</button>
            </div>
            <p className="text-[11px] text-off-black/45">Creators see these in their portal.</p>
          </div>
        )}
        {ads.length === 0 && !adding ? (
          <div className="border border-dashed border-border-gray rounded-md p-8 text-center text-sm text-off-black/50">No winning ads yet. Add the first one so creators can see what works.</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ads.map(ad => (
              <div key={ad.id} className="border border-border-gray rounded-md overflow-hidden bg-white flex flex-col">
                {ad.imageUrl && (
                  <a href={ad.url} target="_blank" rel="noopener noreferrer" className="block aspect-[4/5] bg-subtle-gray">
                    <img src={ad.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </a>
                )}
                <div className="p-3 flex-1 flex flex-col gap-1.5">
                  <a href={ad.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-off-black hover:text-[#4F2DD4] inline-flex items-center gap-1">
                    {ad.title} <ExternalLink className="w-3 h-3 text-off-black/40" />
                  </a>
                  {ad.notes && <p className="text-xs text-off-black/65 whitespace-pre-wrap leading-relaxed">{ad.notes}</p>}
                  <div className="mt-auto pt-1 flex items-center justify-between text-[11px] text-off-black/40">
                    <span>{new Date(ad.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <button onClick={() => remove(ad)} className="hover:text-red-600">Remove</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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
                Send this link to the creator - it takes them to the onboarding wizard.
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
                className="w-full px-4 py-2 bg-dark-fill text-white text-sm font-medium rounded hover:opacity-90 transition-opacity"
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
                      No active briefs yet - you can <Link to="/briefs" className="underline">create one</Link> first, or skip and assign later.
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
                  className="px-4 py-2 bg-dark-fill text-white text-sm font-medium rounded hover:opacity-90 disabled:opacity-40 transition-opacity inline-flex items-center gap-2"
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
  decide,
}: {
  creator: Creator
  onClose: () => void
  onSaved: (updated: Creator) => void | Promise<void>
  onDeleted: () => void | Promise<void>
  /** Approve and Decline, for an applicant. */
  decide?: React.ReactNode
}) {
  const [draft, setDraft] = useState<Creator>(creator)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [isEditingSample, setIsEditingSample] = useState(false)
  const [isEditingShipping, setIsEditingShipping] = useState(false)

  // Reset the draft only when a different creator opens. Keying on the whole
  // object would wipe in-progress edits every time the parent re-renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setDraft(creator) }, [creator.id])

  const isDirty = JSON.stringify(draft) !== JSON.stringify(creator)

  // Progressive disclosure by lifecycle status — show each section only once
  // it's relevant. Driven off draft.status so changing the status dropdown
  // reveals/hides sections live. An invited creator who's done nothing yet sees
  // just the essentials; commission/whitelisting appear once they're active.
  const st = draft.status
  const showSample = st !== 'invited'
  const showShipping = st !== 'invited'

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
    const shippedOrCompleted = !!(creator.sampleOrder?.shippedAt || creator.sampleOrder?.status === 'completed')
    const orderNote = creator.sampleOrder
      ? shippedOrCompleted
        ? `\n\nThe linked sample order ${creator.sampleOrder.orderNumber} has already shipped/completed - it will stay in the fulfillment queue.`
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
        // Lifecycle + free-form notes
        status: draft.status,
        contentStatus: draft.contentStatus,
        notes: draft.notes,
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
    <div className="bg-white border border-border-gray rounded-md w-full">
      <div className="p-4 md:p-6 max-w-3xl">
          {/* Header: back to the list, the name, and the decision for an applicant. */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-2 min-w-0">
              <button onClick={onClose} title="Back to creators (Esc)" className="inline-flex items-center gap-1 -ml-1 px-1.5 py-1 text-off-black/60 hover:text-off-black hover:bg-off-black/5 rounded transition-colors">
                <ChevronLeft className="w-5 h-5 md:w-4 md:h-4" />
                <span className="text-sm hidden md:inline">Creators</span>
              </button>
              <h3 className="text-lg font-semibold text-off-black truncate">
                {creator.name || 'Pending Creator'}
              </h3>
            </div>
            {decide}
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
                options={['invited', 'applied', 'active', 'paused', 'denied']}
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

              {/* Why they want to work with us — folded into Profile (only when
                  they actually gave a reason). */}
              {draft.whyWorkWithUs && (
                <div className="mt-3 pt-3 border-t border-border-gray">
                  <Label>Why they want to work with us</Label>
                  <p className="text-sm text-off-black/80 whitespace-pre-wrap leading-relaxed">{draft.whyWorkWithUs}</p>
                </div>
              )}

              {/* Assigned briefs — also folded into Profile. */}
              <div className="mt-3 pt-3 border-t border-border-gray">
                <Label>{`Assigned Briefs${(creator.briefAssignments?.length ?? 0) > 0 ? ` (${creator.briefAssignments!.length})` : ''}`}</Label>
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
              </div>
            </EditableCard>

            {showSample && (
            <EditableCard
              title="Sample Details"
              isEditing={isEditingSample}
              onToggle={() => setIsEditingSample(v => !v)}
              collapsible
              defaultCollapsed
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
              {creator.sampleOrder && (
              <div className="mt-3 pt-3 border-t border-border-gray space-y-2">
                <ProfileRow
                  label="Cost (COGS)"
                  value={creator.sampleCostUsd ? formatUsd(creator.sampleCostUsd) : '-'}
                />
                <ProfileRow
                  label="Order"
                  value={creator.sampleOrder.orderNumber}
                />
                <ProfileRow
                  label="Status"
                  value={sampleStatusLabel(creator.sampleOrder.status).label}
                />
              </div>
              )}
            </EditableCard>
            )}

            {/* Another print for this creator: a second race, a reshoot, a replacement. */}
            {creator.status !== 'denied' && !isApplicant(creator) && <AnotherSample creator={creator} onDone={() => onSaved(creator)} />}

            {showShipping && (
            <EditableCard
              title="Shipping"
              isEditing={isEditingShipping}
              onToggle={() => setIsEditingShipping(v => !v)}
              collapsible
              defaultCollapsed
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
            </EditableCard>
            )}

            {/* Notes — free-form admin notes, always available. */}
            <Section title="Notes">
              <TextField
                label=""
                value={draft.notes}
                onChange={(v) => setDraft({ ...draft, notes: v })}
                placeholder="Anything worth remembering about this creator…"
                multiline
              />
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
                className="px-4 py-2 bg-dark-fill text-white text-sm font-medium rounded hover:opacity-90 disabled:opacity-40 transition-opacity inline-flex items-center gap-2"
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
function EditableCard({ title, isEditing, onToggle, children, collapsible = false, defaultCollapsed = false }: {
  title: string
  isEditing: boolean
  onToggle: () => void
  children: React.ReactNode
  // When collapsible, the card starts closed (if defaultCollapsed) and the
  // title row toggles open/closed. Used for low-priority sections like Sample
  // Details / Shipping that are rarely needed once a creator is set up.
  collapsible?: boolean
  defaultCollapsed?: boolean
}) {
  const [collapsed, setCollapsed] = useState(collapsible && defaultCollapsed)
  return (
    <div className="bg-white border border-border-gray rounded-md p-4">
      <div className={`flex items-center justify-between ${collapsed ? '' : 'mb-3'}`}>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            className="flex items-center gap-1.5 flex-1 text-left group"
          >
            <ChevronDown className={`w-3.5 h-3.5 text-off-black/40 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
            <h4 className="text-[10px] font-semibold text-off-black/50 uppercase tracking-wider group-hover:text-off-black/70">{title}</h4>
          </button>
        ) : (
          <h4 className="text-[10px] font-semibold text-off-black/50 uppercase tracking-wider">{title}</h4>
        )}
        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-off-black/60 hover:text-off-black hover:bg-off-black/5 rounded transition-colors"
          >
            {isEditing ? <><Check className="w-3 h-3" /> Done</> : <><Pencil className="w-3 h-3" /> Edit</>}
          </button>
        )}
      </div>
      {!collapsed && children}
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
        <span className="text-off-black/30 italic">-</span>
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

/**
 * Admin: send this creator another sample. Prefilled from their current one;
 * goes into the Standard queue as CREATOR-XXXXXX-2 (and up), to the address
 * on file. Server: api/creators/sample.js.
 */
function AnotherSample({ creator, onDone }: { creator: Creator; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [f, setF] = useState({
    raceName: creator.raceName || '',
    raceYear: creator.raceYear ? String(creator.raceYear) : String(new Date().getFullYear()),
    bibNumber: creator.bibNumber || '',
    finishTime: creator.finishTime || '',
    productSize: creator.productSize || '',
    frameType: creator.frameType || '',
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(v => ({ ...v, [k]: e.target.value }))
  const submit = async () => {
    setBusy(true); setErr(null)
    try {
      const res = await apiFetch('/api/creators/sample', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ creatorId: creator.id, ...f, raceYear: Number(f.raceYear) }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not create the sample')
      setOpen(false)
      onDone()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not create the sample') } finally { setBusy(false) }
  }
  const field = 'w-full px-2.5 py-2 text-sm border border-border-gray rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-off-black/10'
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium border border-dashed border-border-gray rounded-md text-off-black/70 hover:bg-subtle-gray">
        <Plus className="w-3.5 h-3.5" /> {creator.sampleOrder ? 'Send another sample' : 'Send a sample'}
      </button>
    )
  }
  return (
    <div className="border border-border-gray rounded-md p-3 space-y-2.5 bg-white">
      <div className="text-xs font-semibold text-off-black uppercase tracking-wider">Another sample</div>
      <div className="grid grid-cols-2 gap-2">
        <input value={f.raceName} onChange={set('raceName')} placeholder="Race" className={field} />
        <input value={f.raceYear} onChange={set('raceYear')} placeholder="Year" inputMode="numeric" className={field} />
        <input value={f.bibNumber} onChange={set('bibNumber')} placeholder="Bib #" className={field} />
        <input value={f.finishTime} onChange={set('finishTime')} placeholder="Finish time" className={field} />
        <input value={f.productSize} onChange={set('productSize')} placeholder="Size, e.g. 12x18" className={field} />
        <input value={f.frameType} onChange={set('frameType')} placeholder="Frame" className={field} />
      </div>
      <p className="text-[11px] text-off-black/50">Goes into the Standard queue for Eli, shipped to the address on file.</p>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={busy || !f.raceName.trim() || !f.raceYear} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-dark-fill text-white rounded-md disabled:opacity-50">
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Create sample
        </button>
        <button onClick={() => setOpen(false)} className="px-3 py-2 text-sm text-off-black/60">Cancel</button>
      </div>
    </div>
  )
}
