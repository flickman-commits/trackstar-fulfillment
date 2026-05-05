import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, AlertTriangle, ChevronRight, ChevronLeft, ChevronDown, ClipboardList, CheckCircle2, Truck, Home } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || ''

type PortalState = 'loading' | 'error' | 'expired' | 'onboarding' | 'dashboard'

interface PortalBrief {
  id: string
  title: string
  description: string | null
  styleOfVideo: string | null
  angle: string | null
  targetLength: string | null
  hooks: string | null
  emotion: string | null
  fomo: string | null
  persona: string | null
  examplesNotes: string | null
}

interface PortalCreator {
  id: string
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
  status: string
  onboardedAt: string | null
}

interface PortalCreatorSampleOrder {
  id: string
  orderNumber: string
  status: string
  createdAt: string
  trackingNumber: string | null
  trackingCarrier: string | null
  shippedAt: string | null
}

interface RaceOption {
  id: number
  raceName: string
  year: number
}

interface PortalData {
  creator: PortalCreator
  briefs: PortalBrief[]
  sampleOrder: PortalCreatorSampleOrder | null
  races: RaceOption[]
}

export default function CreatorPortal() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<PortalState>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [data, setData] = useState<PortalData | null>(null)

  const fetchData = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/api/orders/actions?action=creator-portal-data&token=${token}`)
      if (res.status === 404) {
        setState('expired')
        return
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setErrorMessage(j.error || 'Something went wrong')
        setState('error')
        return
      }
      const payload: PortalData = await res.json()
      setData(payload)
      setState(payload.creator.onboardedAt ? 'dashboard' : 'onboarding')
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Something went wrong')
      setState('error')
    }
  }, [token])

  useEffect(() => { fetchData() }, [fetchData])

  if (state === 'loading') {
    return <FullscreenCenter><Loader2 className="w-8 h-8 animate-spin text-off-black/40" /></FullscreenCenter>
  }
  if (state === 'expired') {
    return (
      <FullscreenCenter>
        <div className="max-w-sm text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h1 className="text-xl font-semibold mb-2">Link not found</h1>
          <p className="text-sm text-off-black/60">
            This invite link is no longer valid. Reach out to Matt for a new one.
          </p>
        </div>
      </FullscreenCenter>
    )
  }
  if (state === 'error') {
    return (
      <FullscreenCenter>
        <div className="max-w-sm text-center">
          <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
          <p className="text-sm text-off-black/60">{errorMessage}</p>
        </div>
      </FullscreenCenter>
    )
  }
  if (!data) return null

  return state === 'dashboard'
    ? <CreatorDashboard data={data} />
    : <OnboardingWizard data={data} token={token!} onDone={fetchData} />
}

// ---------------------------------------------------------------------------
// Onboarding Wizard
// ---------------------------------------------------------------------------

type Step = 0 | 1 | 2 | 3 | 4 | 5

interface OnboardingDraft {
  // Step 1: profile
  name: string
  email: string
  instagramHandle: string
  tiktokHandle: string
  // Step 2: race (split into two dependent dropdowns)
  raceName: string
  raceYear: string  // string for <select> binding
  // Step 3: product
  productSize: string
  frameType: string
  // Step 4: shipping
  shippingName: string
  shippingAddress1: string
  shippingAddress2: string
  shippingCity: string
  shippingState: string
  shippingZip: string
  shippingCountry: string
}

const PRODUCT_SIZES = ['8x10', '12x18']
const FRAME_TYPES = ['Unframed', 'Black Oak', 'Natural Oak']

function OnboardingWizard({ data, token, onDone }: {
  data: PortalData
  token: string
  onDone: () => void | Promise<void>
}) {
  const [step, setStep] = useState<Step>(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [agreedToContent, setAgreedToContent] = useState(false)
  const [draft, setDraft] = useState<OnboardingDraft>({
    name: data.creator.name || '',
    email: data.creator.email || '',
    instagramHandle: data.creator.instagramHandle || '',
    tiktokHandle: data.creator.tiktokHandle || '',
    raceName: data.creator.raceName || '',
    raceYear: data.creator.raceYear ? String(data.creator.raceYear) : '',
    productSize: data.creator.productSize || '',
    frameType: data.creator.frameType || '',
    shippingName: data.creator.shippingName || data.creator.name || '',
    shippingAddress1: data.creator.shippingAddress1 || '',
    shippingAddress2: data.creator.shippingAddress2 || '',
    shippingCity: data.creator.shippingCity || '',
    shippingState: data.creator.shippingState || '',
    shippingZip: data.creator.shippingZip || '',
    shippingCountry: data.creator.shippingCountry || 'US',
  })

  const totalSteps = 6

  // Per-step validation — only blocks Next when a hard-required field is empty
  const canProceed = () => {
    if (step === 0) return true // welcome
    if (step === 1) return draft.name.trim().length > 0 && draft.email.trim().length > 0
    if (step === 2) return draft.raceName.length > 0 && draft.raceYear.length > 0
    if (step === 3) return draft.productSize.length > 0 && draft.frameType.length > 0
    if (step === 4) return (
      draft.shippingName.trim().length > 0 &&
      draft.shippingAddress1.trim().length > 0 &&
      draft.shippingCity.trim().length > 0 &&
      draft.shippingState.trim().length > 0 &&
      draft.shippingZip.trim().length > 0
    )
    if (step === 5) return agreedToContent
    return true
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const res = await fetch(`${API_BASE}/api/orders/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'creator-onboard',
          token,
          data: {
            name: draft.name.trim(),
            email: draft.email.trim(),
            instagramHandle: draft.instagramHandle.trim() || null,
            tiktokHandle: draft.tiktokHandle.trim() || null,
            raceName: draft.raceName || null,
            raceYear: draft.raceYear || null,
            productSize: draft.productSize,
            frameType: draft.frameType,
            shippingName: draft.shippingName.trim(),
            shippingAddress1: draft.shippingAddress1.trim(),
            shippingAddress2: draft.shippingAddress2.trim() || null,
            shippingCity: draft.shippingCity.trim(),
            shippingState: draft.shippingState.trim(),
            shippingZip: draft.shippingZip.trim(),
            shippingCountry: draft.shippingCountry.trim() || 'US',
          }
        })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Onboarding failed (${res.status})`)
      }
      await onDone()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to submit')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="h-screen bg-[#F0F0F0] flex flex-col">
      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-4 md:px-6 pt-8 pb-6">
          <div className="bg-white border border-border-gray rounded-md shadow-sm p-5 md:p-6">
            {step === 0 && <StepWelcome briefs={data.briefs} />}
            {step === 1 && <StepProfile draft={draft} setDraft={setDraft} />}
            {step === 2 && <StepRace draft={draft} setDraft={setDraft} races={data.races} />}
            {step === 3 && <StepProduct draft={draft} setDraft={setDraft} />}
            {step === 4 && <StepShipping draft={draft} setDraft={setDraft} />}
            {step === 5 && (
              <StepContentAgreement
                briefs={data.briefs}
                agreed={agreedToContent}
                setAgreed={setAgreedToContent}
              />
            )}
          </div>
        </div>
      </div>

      {/* Sticky footer: progress + nav */}
      <div className="border-t border-border-gray bg-[#F0F0F0]">
        <div className="max-w-xl mx-auto px-4 md:px-6 py-4">
          <div className="flex items-center gap-1 mb-3 px-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1 rounded-full ${i <= step ? 'bg-[#4F2DD4]' : 'bg-[#4F2DD4]/15'}`}
              />
            ))}
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1) as Step)}
              disabled={step === 0}
              className="inline-flex items-center gap-1 px-4 py-2 text-sm text-off-black/60 hover:text-off-black hover:bg-off-black/5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            {step < totalSteps - 1 ? (
              <button
                onClick={() => setStep((s) => (s + 1) as Step)}
                disabled={!canProceed()}
                className="inline-flex items-center gap-1 px-5 py-2 bg-off-black text-white text-sm font-medium rounded hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canProceed() || isSubmitting}
                className="inline-flex items-center gap-2 px-5 py-2 bg-off-black text-white text-sm font-medium rounded hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmitting ? 'Submitting…' : 'Agree + Submit'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Steps ----

function StepWelcome(_: { briefs: PortalBrief[] }) {
  return (
    <div>
      <h1 className="text-3xl font-bold text-off-black mb-4 leading-tight text-center">
        Welcome to the Trackstar Creator Program
      </h1>

      <img
        src="/Tim_UGC_1.jpg"
        alt="Trackstar creator with their print"
        className="w-full h-auto rounded-md mb-4"
      />

      <p className="text-sm text-off-black/80 leading-relaxed">
        ^^ This is going to be you shortly! We're stoked to send you a personalized Trackstar print in exchange for some content! This flow will walk you through everything you need to know and ask a couple questions.
      </p>
    </div>
  )
}

function StepContentAgreement({ briefs, agreed, setAgreed }: {
  briefs: PortalBrief[]
  agreed: boolean
  setAgreed: (v: boolean) => void
}) {
  return (
    <div>
      <h2 className="text-3xl font-bold text-off-black mb-1 leading-tight">Content Needed</h2>
      <p className="text-xs text-off-black/60 mb-4">
        Here's what we'd love you to create with your print.
      </p>

      {briefs.length > 0 ? (
        <div className="space-y-3 mb-5">
          {briefs.map(b => <BriefCard key={b.id} brief={b} />)}
        </div>
      ) : (
        <div className="text-sm text-off-black/60 mb-5 p-3 bg-subtle-gray rounded border border-border-gray">
          Matt will share specific briefs with you shortly.
        </div>
      )}

      <label className="flex items-start gap-3 p-4 bg-subtle-gray border border-border-gray rounded-md cursor-pointer hover:bg-off-black/5 transition-colors">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-[#4F2DD4] cursor-pointer"
        />
        <span className="text-sm text-off-black/90 leading-relaxed">
          By checking this box I'm agreeing to create the above content by 7 days after receiving my print.
        </span>
      </label>
    </div>
  )
}

function StepProfile({ draft, setDraft }: { draft: OnboardingDraft; setDraft: (d: OnboardingDraft) => void }) {
  return (
    <div>
      <h2 className="text-3xl font-bold text-off-black mb-1 leading-tight">Your Info</h2>
      <p className="text-xs text-off-black/60 mb-4">So we know who you are and how to reach you.</p>
      <div className="space-y-3">
        <Field label="Name *" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} autoFocus />
        <Field label="Email *" value={draft.email} onChange={(v) => setDraft({ ...draft, email: v })} type="email" />
        <SocialField
          label="Instagram"
          prefix="https://www.instagram.com/"
          value={draft.instagramHandle}
          onChange={(v) => setDraft({ ...draft, instagramHandle: v })}
        />
        <SocialField
          label="TikTok"
          prefix="https://www.tiktok.com/@"
          value={draft.tiktokHandle}
          onChange={(v) => setDraft({ ...draft, tiktokHandle: v })}
        />
      </div>
    </div>
  )
}

function StepRace({ draft, setDraft, races }: {
  draft: OnboardingDraft
  setDraft: (d: OnboardingDraft) => void
  races: RaceOption[]
}) {
  // Unique race names, sorted alphabetically.
  const raceNames = Array.from(new Set(races.map(r => r.raceName))).sort()
  // Years available for the currently selected race, newest first.
  const yearsForRace = draft.raceName
    ? Array.from(new Set(races.filter(r => r.raceName === draft.raceName).map(r => r.year))).sort((a, b) => b - a)
    : []

  return (
    <div>
      <h2 className="text-3xl font-bold text-off-black mb-1 leading-tight">Which race did you run?</h2>
      <p className="text-xs text-off-black/60 mb-4">
        We'll find your bib # and finish time for you, based off your name.
      </p>
      <div className="space-y-3">
        <div>
          <div className="text-xs text-off-black/60 mb-1">Race *</div>
          <select
            value={draft.raceName}
            onChange={(e) => setDraft({ ...draft, raceName: e.target.value, raceYear: '' })}
            autoFocus
            className="w-full px-3 py-2 border border-border-gray rounded text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20 bg-white"
          >
            <option value="">Select a race…</option>
            {raceNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-xs text-off-black/60 mb-1">Year *</div>
          <select
            value={draft.raceYear}
            onChange={(e) => setDraft({ ...draft, raceYear: e.target.value })}
            disabled={!draft.raceName}
            className="w-full px-3 py-2 border border-border-gray rounded text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20 bg-white disabled:bg-subtle-gray disabled:text-off-black/40 disabled:cursor-not-allowed"
          >
            <option value="">{draft.raceName ? 'Select a year…' : 'Pick a race first'}</option>
            {yearsForRace.map(y => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
        </div>
        {races.length === 0 && (
          <p className="text-xs text-amber-600 mt-2">
            No race options available yet. Reach out to Matt so he can add yours.
          </p>
        )}
      </div>
    </div>
  )
}

function StepProduct({ draft, setDraft }: { draft: OnboardingDraft; setDraft: (d: OnboardingDraft) => void }) {
  return (
    <div>
      <h2 className="text-3xl font-bold text-off-black mb-4 leading-tight">Which size and frame?</h2>

      <div className="mb-4">
        <div className="text-xs text-off-black/60 mb-2">Size *</div>
        <div className="grid grid-cols-3 gap-2">
          {PRODUCT_SIZES.map(s => (
            <button
              key={s}
              onClick={() => setDraft({ ...draft, productSize: s })}
              className={`py-3 text-sm font-medium rounded border transition-colors ${
                draft.productSize === s
                  ? 'bg-off-black text-white border-off-black'
                  : 'bg-white text-off-black border-border-gray hover:bg-subtle-gray'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-off-black/60 mb-2">Frame *</div>
        <div className="space-y-2">
          {FRAME_TYPES.map(f => (
            <button
              key={f}
              onClick={() => setDraft({ ...draft, frameType: f })}
              className={`w-full py-3 px-4 text-sm text-left rounded border transition-colors ${
                draft.frameType === f
                  ? 'bg-off-black text-white border-off-black'
                  : 'bg-white text-off-black border-border-gray hover:bg-subtle-gray'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function StepShipping({ draft, setDraft }: { draft: OnboardingDraft; setDraft: (d: OnboardingDraft) => void }) {
  return (
    <div>
      <h2 className="text-3xl font-bold text-off-black mb-4 leading-tight">Where should we send it?</h2>
      <div className="space-y-3">
        <Field label="Full name *" value={draft.shippingName} onChange={(v) => setDraft({ ...draft, shippingName: v })} autoFocus />
        <Field label="Address line 1 *" value={draft.shippingAddress1} onChange={(v) => setDraft({ ...draft, shippingAddress1: v })} />
        <Field label="Address line 2" value={draft.shippingAddress2} onChange={(v) => setDraft({ ...draft, shippingAddress2: v })} placeholder="Apt, suite, etc." />
        <div className="grid grid-cols-6 gap-3">
          <div className="col-span-3">
            <Field label="City *" value={draft.shippingCity} onChange={(v) => setDraft({ ...draft, shippingCity: v })} />
          </div>
          <div className="col-span-1">
            <Field label="State *" value={draft.shippingState} onChange={(v) => setDraft({ ...draft, shippingState: v })} placeholder="NY" />
          </div>
          <div className="col-span-2">
            <Field label="Zip *" value={draft.shippingZip} onChange={(v) => setDraft({ ...draft, shippingZip: v })} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Post-onboarding Dashboard
// ---------------------------------------------------------------------------
function CreatorDashboard({ data }: { data: PortalData }) {
  const { creator, briefs, sampleOrder } = data
  const firstName = creator.name?.split(' ')[0] || 'there'

  // Build the personality bubbles
  const bubbles: string[] = []
  if (creator.raceName) bubbles.push(creator.raceName)
  const sizeYear = [creator.raceYear, creator.productSize].filter(Boolean).join(' • ')
  if (sizeYear) bubbles.push(sizeYear)
  if (creator.shippingCity) bubbles.push(creator.shippingCity)

  return (
    <div className="min-h-screen bg-[#F0F0F0]">
      <div className="max-w-xl mx-auto px-4 md:px-6 py-8">
        <h1 className="text-3xl font-bold text-off-black mb-3 leading-tight">
          Hey {firstName} 👋
        </h1>

        {bubbles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {bubbles.map((b, i) => (
              <span
                key={i}
                className="px-3 py-1 text-xs font-medium text-[#4F2DD4] bg-[#4F2DD4]/10 border border-[#4F2DD4]/20 rounded-full"
              >
                {b}
              </span>
            ))}
          </div>
        )}

        <p className="text-sm text-off-black/60 mb-6">
          Your Trackstar Creator Portal. Please reach out to{' '}
          <a href="mailto:matt@trackstar.art" className="text-[#4F2DD4] hover:underline">
            Matt
          </a>{' '}
          if you have any problems.
        </p>

        {/* Sample tracker — Domino's-style */}
        <div className="bg-white border border-border-gray rounded-md p-5 mb-5">
          <h2 className="text-sm font-semibold text-off-black mb-4">Your Sample</h2>
          <SampleTracker order={sampleOrder} onboardedAt={creator.onboardedAt} />
          {sampleOrder?.trackingNumber && (
            <div className="mt-4 pt-4 border-t border-border-gray flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="text-off-black/50 uppercase tracking-wider font-semibold">Tracking</span>
              {sampleOrder.trackingCarrier && (
                <span className="text-off-black/70">{sampleOrder.trackingCarrier}</span>
              )}
              <span className="font-mono text-off-black">{sampleOrder.trackingNumber}</span>
            </div>
          )}
        </div>

        {/* Briefs */}
        {briefs.length > 0 && (
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-off-black mb-3">Your Briefs</h2>
            <div className="space-y-3">
              {briefs.map(b => <CollapsibleBriefCard key={b.id} brief={b} />)}
            </div>
          </div>
        )}

        {/* Upload reminder card */}
        <div className="bg-white border border-border-gray rounded-md p-5">
          <p className="text-sm text-off-black/80 mb-4 leading-relaxed">
            <strong>Reminder</strong>, please submit content no later than 7 days after receiving your print.
          </p>
          <a
            href="https://drive.google.com/drive/folders/16SZxJ-1wa6cbmVndkCGIaOmxZX-_pGsf?usp=sharing"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-off-black text-white text-sm font-medium rounded hover:opacity-90 transition-opacity"
          >
            Upload Content Here
          </a>
          <p className="text-xs text-off-black/50 mt-3">
            *Please email{' '}
            <a href="mailto:matt@trackstar.art" className="text-[#4F2DD4] hover:underline">
              Matt
            </a>{' '}
            or DM{' '}
            <a
              href="https://www.instagram.com/flickman"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#4F2DD4] hover:underline"
            >
              @flickman
            </a>{' '}
            when you've uploaded the content.
          </p>
        </div>
      </div>
    </div>
  )
}

// Domino's-style 4-stage tracker. Each stage reads from independent signals,
// not Order.status — that field is for internal fulfillment, not the creator
// view. Mapping:
//   Requested  → creator submitted onboarding (`onboardedAt` set)
//   Approved   → admin clicked Approve → fulfillment order exists
//   Shipped    → admin entered a tracking number
//   Delivered  → not wired yet (carrier API or manual, future)
function SampleTracker({
  order,
  onboardedAt,
}: {
  order: PortalCreatorSampleOrder | null
  onboardedAt: string | null
}) {
  const stages = [
    { key: 'requested', label: 'Requested', Icon: ClipboardList },
    { key: 'approved',  label: 'Approved',  Icon: CheckCircle2 },
    { key: 'shipped',   label: 'Shipped',   Icon: Truck },
    { key: 'delivered', label: 'Delivered', Icon: Home },
  ] as const

  const stageIndex = (() => {
    if (order?.trackingNumber) return 2 // shipped
    if (order) return 1                 // approved
    if (onboardedAt) return 0           // requested
    return -1                           // pre-onboarding
  })()

  return (
    <div className="flex items-start justify-between">
      {stages.map((s, i) => {
        const isReached = i <= stageIndex
        const isCurrent = i === stageIndex
        const Icon = s.Icon
        return (
          <div key={s.key} className="flex-1 flex flex-col items-center relative">
            {/* Connector to previous */}
            {i > 0 && (
              <div
                className={`absolute top-4 right-1/2 w-full h-0.5 ${
                  i <= stageIndex ? 'bg-[#4F2DD4]' : 'bg-off-black/10'
                }`}
              />
            )}
            <div
              className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                isReached
                  ? 'bg-[#4F2DD4] border-[#4F2DD4] text-white'
                  : 'bg-white border-off-black/20 text-off-black/30'
              } ${isCurrent ? 'ring-4 ring-[#4F2DD4]/20' : ''}`}
            >
              <Icon className="w-4 h-4" />
            </div>
            <div
              className={`mt-2 text-[11px] font-medium ${
                isReached ? 'text-off-black' : 'text-off-black/40'
              }`}
            >
              {s.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CollapsibleBriefCard({ brief }: { brief: PortalBrief }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-white border border-border-gray rounded-md overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-off-black/[0.02] transition-colors"
      >
        <h3 className="text-base font-semibold text-off-black">{brief.title}</h3>
        <ChevronDown
          className={`w-5 h-5 text-off-black/50 transition-transform duration-300 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {/* grid-rows trick animates to natural content height */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-0 border-t border-border-gray">
            <div className="pt-4">
              <BriefCard brief={brief} hideTitle />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------
function BriefCard({ brief, hideTitle = false }: { brief: PortalBrief; hideTitle?: boolean }) {
  return (
    <div className={hideTitle ? '' : 'bg-subtle-gray border border-border-gray rounded-md p-4'}>
      {!hideTitle && <h3 className="text-base font-semibold text-off-black mb-2">{brief.title}</h3>}
      {brief.description && (
        <p className="text-sm text-off-black/70 mb-3">{brief.description}</p>
      )}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {brief.styleOfVideo && <Chip label={`Style: ${brief.styleOfVideo}`} />}
        {brief.targetLength && <Chip label={`Length: ${brief.targetLength}`} />}
        {brief.angle && <Chip label={`Angle: ${brief.angle}`} />}
        {brief.persona && <Chip label={`Persona: ${brief.persona}`} />}
      </div>
      {/* Information framework — the guardrails, not a script. These are
          direction, not lines to read. Creators find their own voice inside. */}
      {(brief.hooks || brief.emotion || brief.fomo) && (
        <div className="mt-2 space-y-2">
          <div className="text-[10px] font-semibold text-off-black/50 uppercase tracking-wider">Framework (guardrails, not a script)</div>
          {brief.hooks && (
            <Box label="Hook — opening line options">
              <pre className="whitespace-pre-wrap text-sm text-off-black/80 font-sans leading-relaxed">{brief.hooks}</pre>
            </Box>
          )}
          {brief.emotion && (
            <Box label="Emotion — the feeling to land">
              <pre className="whitespace-pre-wrap text-sm text-off-black/80 font-sans leading-relaxed">{brief.emotion}</pre>
            </Box>
          )}
          {brief.fomo && (
            <Box label="FOMO — why act now">
              <pre className="whitespace-pre-wrap text-sm text-off-black/80 font-sans leading-relaxed">{brief.fomo}</pre>
            </Box>
          )}
        </div>
      )}
      {brief.examplesNotes && (
        <Box label="Top-performing references">
          <ReferenceList raw={brief.examplesNotes} />
        </Box>
      )}
    </div>
  )
}

function Chip({ label }: { label: string }) {
  return (
    <span className="px-1.5 py-0.5 text-[10px] font-medium text-off-black/70 bg-white border border-border-gray rounded">
      {label}
    </span>
  )
}

function Box({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <div className="text-[10px] font-semibold text-off-black/50 uppercase tracking-wider mb-1">{label}</div>
      <div className="bg-white border border-border-gray rounded p-2.5">{children}</div>
    </div>
  )
}

// Renders the brief's `examplesNotes` field as a list of clickable reference links.
// Each line is parsed as `URL` or `URL — note`. Lines without URLs render as plain text
// (legacy briefs that pre-date the structured form).
function ReferenceList({ raw }: { raw: string }) {
  const rows = raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const urlMatch = line.match(/https?:\/\/\S+/)
      if (urlMatch) {
        const url = urlMatch[0]
        const note = line.replace(url, '').replace(/^[\s—–-]+/, '').trim()
        return { url, note }
      }
      return { url: '', note: line }
    })

  return (
    <ul className="space-y-1.5 text-sm">
      {rows.map((r, i) => (
        <li key={i} className="text-off-black/80 leading-relaxed">
          {r.url ? (
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#4F2DD4] hover:underline break-all font-medium"
            >
              {r.url}
            </a>
          ) : null}
          {r.url && r.note ? <span className="text-off-black/40"> — </span> : null}
          {r.note ? <span>{r.note}</span> : null}
        </li>
      ))}
    </ul>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder, autoFocus }: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <div>
      <div className="text-xs text-off-black/60 mb-1">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full px-3 py-2 border border-border-gray rounded text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20"
      />
    </div>
  )
}

function SocialField({ label, prefix, value, onChange }: {
  label: string
  prefix: string
  value: string
  onChange: (v: string) => void
}) {
  // Strip the prefix (and any leading @) from whatever the user pastes — we
  // store the full URL so it's clickable later, but the input only shows the
  // handle to keep things tidy.
  const stripPrefix = (raw: string) => {
    let v = raw.trim()
    if (!v) return ''
    // Strip common URL prefixes (with or without protocol/www) for both platforms
    v = v.replace(/^https?:\/\/(www\.)?(instagram\.com|tiktok\.com)\//i, '')
    v = v.replace(/^@/, '')
    return v.replace(/\/+$/, '')
  }

  // Display just the handle portion in the input
  const handleOnly = (() => {
    if (!value) return ''
    return stripPrefix(value)
  })()

  return (
    <div>
      <div className="text-xs text-off-black/60 mb-1">{label}</div>
      <div className="flex items-center w-full border border-border-gray rounded text-sm focus-within:ring-2 focus-within:ring-off-black/20 overflow-hidden bg-white">
        <span className="px-2 py-2 text-off-black/40 bg-subtle-gray border-r border-border-gray whitespace-nowrap text-xs">
          {prefix}
        </span>
        <input
          type="text"
          value={handleOnly}
          onChange={(e) => {
            const handle = stripPrefix(e.target.value)
            onChange(handle ? `${prefix}${handle}` : '')
          }}
          placeholder="handle"
          className="flex-1 px-2 py-2 focus:outline-none min-w-0"
        />
      </div>
    </div>
  )
}

function FullscreenCenter({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-off-white flex items-center justify-center px-4">
      {children}
    </div>
  )
}
