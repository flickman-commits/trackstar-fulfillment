import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, Check, AlertTriangle, Package, ChevronRight, ChevronLeft } from 'lucide-react'

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

interface RaceOption {
  id: number
  raceName: string
  year: number
}

interface PortalData {
  creator: PortalCreator
  briefs: PortalBrief[]
  sampleOrder: { id: string; orderNumber: string; status: string; createdAt: string } | null
  races: RaceOption[]
}

// ---------------------------------------------------------------------------
// Placeholder copy — rewrite before shipping. Matt will replace this with
// real program explainer text.
// ---------------------------------------------------------------------------
const PLACEHOLDER_PROGRAM_COPY = `Welcome to the Trackstar Creator Program! This is where I'll explain:

• What we make and why it's a cool fit for you
• How the program works — you film, we run ads, you get paid
• How compensation is calculated
• What we need from you to get started
• Timelines and expectations

(This copy is a placeholder — Matt will replace it with the real pitch before going live.)`

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

type Step = 0 | 1 | 2 | 3 | 4

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

  const totalSteps = 5

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
    <div className="min-h-screen bg-off-white">
      <div className="max-w-xl mx-auto px-4 md:px-6 py-8">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img src="/trackstar-logo.png" alt="Trackstar" className="h-9" />
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-1 mb-6 px-1">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-1 rounded-full ${i <= step ? 'bg-off-black' : 'bg-off-black/10'}`}
            />
          ))}
        </div>

        <div className="bg-white border border-border-gray rounded-md shadow-sm p-5 md:p-6">
          {step === 0 && <StepWelcome briefs={data.briefs} />}
          {step === 1 && <StepProfile draft={draft} setDraft={setDraft} />}
          {step === 2 && <StepRace draft={draft} setDraft={setDraft} races={data.races} />}
          {step === 3 && <StepProduct draft={draft} setDraft={setDraft} />}
          {step === 4 && <StepShipping draft={draft} setDraft={setDraft} />}
        </div>

        {/* Nav */}
        <div className="flex items-center justify-between mt-5">
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
              {isSubmitting ? 'Submitting…' : 'Submit Onboarding'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Steps ----

function StepWelcome({ briefs }: { briefs: PortalBrief[] }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h1 className="text-xl font-bold text-off-black">Trackstar Creator Program</h1>
        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-semibold uppercase tracking-wider rounded">
          Placeholder
        </span>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-4">
        <p className="text-xs text-amber-900">
          The copy below is a <strong>placeholder</strong>. Matt will replace it with the real program explainer before launch.
        </p>
      </div>
      <pre className="whitespace-pre-wrap text-sm text-off-black/80 leading-relaxed font-sans">
        {PLACEHOLDER_PROGRAM_COPY}
      </pre>

      {briefs.length > 0 && (
        <div className="mt-6 pt-5 border-t border-border-gray">
          <h2 className="text-sm font-semibold text-off-black mb-3">What we'd love you to film</h2>
          <p className="text-xs text-off-black/60 mb-3">
            Here's the content direction for you. You'll have all of this available on your dashboard after onboarding.
          </p>
          <div className="space-y-3">
            {briefs.map(b => <BriefCard key={b.id} brief={b} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function StepProfile({ draft, setDraft }: { draft: OnboardingDraft; setDraft: (d: OnboardingDraft) => void }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-off-black mb-1">A bit about you</h2>
      <p className="text-xs text-off-black/60 mb-4">So we know who you are and how to reach you.</p>
      <div className="space-y-3">
        <Field label="Name *" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} autoFocus />
        <Field label="Email *" value={draft.email} onChange={(v) => setDraft({ ...draft, email: v })} type="email" />
        <Field label="Instagram" value={draft.instagramHandle} onChange={(v) => setDraft({ ...draft, instagramHandle: v })} placeholder="@handle" />
        <Field label="TikTok" value={draft.tiktokHandle} onChange={(v) => setDraft({ ...draft, tiktokHandle: v })} placeholder="@handle" />
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
      <h2 className="text-lg font-semibold text-off-black mb-1">Your race</h2>
      <p className="text-xs text-off-black/60 mb-4">
        Pick the race you ran — your sample print will be personalized to it. We'll find your bib and finish time for you.
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
      <h2 className="text-lg font-semibold text-off-black mb-1">Your print</h2>
      <p className="text-xs text-off-black/60 mb-4">Pick the size and frame you'd like us to send.</p>

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
      <h2 className="text-lg font-semibold text-off-black mb-1">Where should we send it?</h2>
      <p className="text-xs text-off-black/60 mb-4">Shipping address for your sample print.</p>
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
        <Field label="Country" value={draft.shippingCountry} onChange={(v) => setDraft({ ...draft, shippingCountry: v })} placeholder="US" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Post-onboarding Dashboard
// ---------------------------------------------------------------------------
function CreatorDashboard({ data }: { data: PortalData }) {
  const { creator, briefs, sampleOrder } = data
  return (
    <div className="min-h-screen bg-off-white">
      <div className="max-w-xl mx-auto px-4 md:px-6 py-8">
        <div className="flex justify-center mb-6">
          <img src="/trackstar-logo.png" alt="Trackstar" className="h-9" />
        </div>

        <h1 className="text-2xl font-bold text-off-black mb-1">
          {creator.name ? `Hey ${creator.name.split(' ')[0]}` : 'Welcome'} 👋
        </h1>
        <p className="text-sm text-off-black/60 mb-6">
          You're in the Trackstar Creator Program. Bookmark this page — you can come back anytime to check on your sample and see your briefs.
        </p>

        {/* Sample status */}
        <div className="bg-white border border-border-gray rounded-md p-4 mb-5">
          <div className="flex items-center gap-2 text-xs font-semibold text-off-black/50 uppercase tracking-wider mb-2">
            <Package className="w-3.5 h-3.5" /> Your Sample
          </div>
          {sampleOrder ? (
            <SampleStatus order={sampleOrder} />
          ) : (
            <div className="text-sm text-off-black/60">
              Your request is in review — we'll approve it shortly and you'll see shipping status here once your sample is on the way.
            </div>
          )}
        </div>

        {/* Briefs */}
        {briefs.length > 0 && (
          <div className="mb-5">
            <h2 className="text-xs font-semibold text-off-black/50 uppercase tracking-wider mb-3">
              Your Briefs ({briefs.length})
            </h2>
            <div className="space-y-3">
              {briefs.map(b => <BriefCard key={b.id} brief={b} />)}
            </div>
          </div>
        )}

        {/* Video upload CTA */}
        <div className="bg-white border border-border-gray rounded-md p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-off-black/50 uppercase tracking-wider mb-2">
            Upload Your Videos
          </div>
          <p className="text-sm text-off-black/70 mb-3">
            Your videos are due seven days after you receive the print. Please upload them here.
          </p>
          <a
            href="https://drive.google.com/drive/folders/16SZxJ-1wa6cbmVndkCGIaOmxZX-_pGsf?usp=sharing"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-off-black text-white text-sm font-medium rounded hover:opacity-90 transition-opacity"
          >
            Open upload folder →
          </a>
        </div>
      </div>
    </div>
  )
}

function SampleStatus({ order }: { order: { status: string; createdAt: string } }) {
  const label =
    order.status === 'completed' ? 'Sent to Production' :
    order.status === 'flagged'   ? 'Needs attention — reach out to Matt' :
                                    'In queue — being prepared'
  const color =
    order.status === 'completed' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' :
    order.status === 'flagged'   ? 'text-amber-800 bg-amber-50 border-amber-200' :
                                    'text-blue-800 bg-blue-50 border-blue-200'
  return (
    <div>
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded border ${color}`}>
        {order.status === 'completed' && <Check className="w-3 h-3" />}
        {label}
      </div>
      <p className="text-xs text-off-black/40 mt-2">
        Requested {new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------
function BriefCard({ brief }: { brief: PortalBrief }) {
  return (
    <div className="bg-subtle-gray border border-border-gray rounded-md p-4">
      <h3 className="text-base font-semibold text-off-black mb-2">{brief.title}</h3>
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
          <pre className="whitespace-pre-wrap text-sm text-off-black/80 font-sans leading-relaxed">{brief.examplesNotes}</pre>
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

function FullscreenCenter({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-off-white flex items-center justify-center px-4">
      {children}
    </div>
  )
}
