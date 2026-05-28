import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Check, ArrowRight } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || ''

// Public creator-program landing page. Single CTA → mints a fresh invite
// token and drops the applicant straight into the onboarding wizard.
export default function CreatorApply() {
  const navigate = useNavigate()
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleApply = async () => {
    setIsStarting(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/orders/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-public-invite' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Failed to start application (${res.status})`)
      }
      const { inviteToken } = await res.json()
      if (!inviteToken) throw new Error('No invite token returned')
      navigate(`/creator/${inviteToken}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start application')
      setIsStarting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F0F0F0]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#F0F0F0]/90 backdrop-blur border-b border-border-gray/60">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between">
          <img src="/trackstar-logo.png" alt="Trackstar" className="h-7 md:h-8" />
          <button
            onClick={handleApply}
            disabled={isStarting}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#4F2DD4] text-white text-sm font-medium rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isStarting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Apply
          </button>
        </div>
      </header>

      {/* Hero — 2-col grid on desktop. Mobile: UGC fan on top, then text.
          Desktop: text left, UGC scattered to the right. */}
      <section className="max-w-6xl mx-auto px-4 md:px-8 pt-8 md:pt-16 lg:pt-20 pb-10 md:pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12 items-center">

          {/* UGC visuals — order 1 on mobile (above), order 2 on desktop (right).
              Same magician's-fan layout at every breakpoint; just sizes up on
              wider screens so it fills the right column nicely on desktop. */}
          <div className="order-1 lg:order-2">
            <div className="relative mx-auto h-64 md:h-80 lg:h-96" style={{ maxWidth: '520px' }}>
              {/* Nat — fanned left, behind */}
              <img
                src="/Nat_UGC.png"
                alt="Nat with her Trackstar print"
                className="absolute top-2 md:top-4 left-1/2 w-36 h-52 md:w-44 md:h-64 lg:w-52 lg:h-72 object-cover shadow-lg"
                style={{ borderRadius: '5px', transform: 'translateX(-110%) rotate(-12deg)', zIndex: 10 }}
              />
              {/* Sophie — fanned right, behind */}
              <img
                src="/Sophie_UGC.png"
                alt="Sophie with her Trackstar print"
                className="absolute top-2 md:top-4 left-1/2 w-36 h-52 md:w-44 md:h-64 lg:w-52 lg:h-72 object-cover shadow-lg"
                style={{ borderRadius: '5px', transform: 'translateX(10%) rotate(12deg)', zIndex: 10 }}
              />
              {/* Tim — centerpiece, on top, straight */}
              <img
                src="/Tim_UGC_1.jpg"
                alt="Tim with his Trackstar print"
                className="absolute top-0 left-1/2 w-36 h-52 md:w-44 md:h-64 lg:w-52 lg:h-72 object-cover shadow-xl"
                style={{ borderRadius: '5px', transform: 'translateX(-50%)', zIndex: 20 }}
              />
            </div>
          </div>

          {/* Text content — order 2 on mobile, order 1 on desktop.
              Centered on mobile, left-aligned on desktop. */}
          <div className="order-2 lg:order-1 text-center lg:text-left">
            <span className="inline-flex items-center px-3 py-1 mb-5 text-[11px] font-semibold tracking-wider uppercase bg-[#4F2DD4]/10 text-[#4F2DD4] rounded-full">
              Creator Program
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-off-black leading-[1.05] tracking-tight mb-6">
              Get a free Trackstar print in exchange for 2–3 videos.
            </h1>
            <button
              onClick={handleApply}
              disabled={isStarting}
              className="inline-flex items-center gap-2 mt-2 px-6 py-3.5 bg-off-black text-white text-base font-medium rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Apply Now
              {!isStarting && <ArrowRight className="w-4 h-4" />}
            </button>
            {error && (
              <p className="mt-4 text-sm text-red-600">{error}</p>
            )}
          </div>

        </div>
      </section>

      {/* What you get — single product line, no 3-card array. The cards
          were trying to sell the print's value props; the new framing
          is "this is the thing you get" with a one-line tagline below. */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 pb-10 md:pb-14">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-off-black/50 mb-4 md:mb-6">What you get</h2>
        <div className="bg-white border border-border-gray rounded-md p-5 md:p-6">
          <div className="text-xl md:text-2xl font-bold text-off-black leading-tight">(1x) Personalized Trackstar Race Print</div>
          <div className="text-sm md:text-base text-off-black/60 mt-1.5">Custom-designed with your name, bib, finish time, and the course you ran.</div>
        </div>
      </section>

      {/* What we ask — one bullet only. The paid-ads consent moved into
          the application wizard (StepContentAgreement). */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 pb-10 md:pb-14">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-off-black/50 mb-4 md:mb-6">What we ask</h2>
        <div className="bg-white border border-border-gray rounded-md p-5 md:p-6">
          <Bullet><strong>2–3 short-form videos</strong> (TikTok or Reels) within 7 days of receiving your print.</Bullet>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 pb-10 md:pb-14">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-off-black/50 mb-4 md:mb-6">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          <Step n={1} title="Apply">Tell us which race you ran and your address.</Step>
          <Step n={2} title="Approve">If it's a good fit, we'll approve!</Step>
          <Step n={3} title="Film Content">We'll give a full brief on how to do it.</Step>
        </div>
      </section>

      {/* Closing CTA — bare H1 + button. No subhead clutter. */}
      <section className="max-w-3xl mx-auto px-4 md:px-8 pb-16 md:pb-24 text-center">
        <h1 className="text-3xl md:text-4xl font-bold text-off-black leading-tight mb-6">
          Get your free Trackstar print
        </h1>
        <button
          onClick={handleApply}
          disabled={isStarting}
          className="inline-flex items-center gap-2 px-6 py-3.5 bg-[#4F2DD4] text-white text-base font-medium rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Apply Now
          {!isStarting && <ArrowRight className="w-4 h-4" />}
        </button>
        {error && (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-border-gray/60 py-6">
        <div className="max-w-5xl mx-auto px-4 md:px-8 flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-off-black/50">
          <div className="flex items-center gap-2">
            <img src="/trackstar-logo.png" alt="Trackstar" className="h-5" />
            <span>© Trackstar</span>
          </div>
          <div>
            Questions? Email <a href="mailto:matt@trackstar.art" className="text-[#4F2DD4] hover:underline">matt@trackstar.art</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm text-off-black/80 leading-relaxed">
      <Check className="w-4 h-4 mt-0.5 text-[#4F2DD4] shrink-0" />
      <span>{children}</span>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-border-gray rounded-md p-5">
      <div className="text-[11px] font-semibold text-[#4F2DD4] mb-2">Step {n}</div>
      <div className="text-base font-semibold text-off-black mb-1.5">{title}</div>
      <div className="text-sm text-off-black/60 leading-relaxed">{children}</div>
    </div>
  )
}
