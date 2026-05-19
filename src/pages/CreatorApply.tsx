import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Gift, DollarSign, Megaphone, Check, ArrowRight } from 'lucide-react'

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

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-4 md:px-8 pt-12 md:pt-20 pb-10 md:pb-14 text-center">
        <span className="inline-flex items-center px-3 py-1 mb-5 text-[11px] font-semibold tracking-wider uppercase bg-[#4F2DD4]/10 text-[#4F2DD4] rounded-full">
          Creator Program
        </span>
        <h1 className="text-4xl md:text-6xl font-bold text-off-black leading-[1.05] tracking-tight mb-5">
          Get a free print.<br />
          Run with us.
        </h1>
        <p className="text-base md:text-lg text-off-black/70 max-w-xl mx-auto leading-relaxed">
          Trackstar turns your race into custom art — a personalized print with your name, bib, time, pace, weather, all of it. We send it free to runners who'll share the story.
        </p>
        <button
          onClick={handleApply}
          disabled={isStarting}
          className="inline-flex items-center gap-2 mt-8 px-6 py-3.5 bg-off-black text-white text-base font-medium rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Apply Now
          {!isStarting && <ArrowRight className="w-4 h-4" />}
        </button>
        {error && (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        )}
      </section>

      {/* What you get */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 pb-10 md:pb-14">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-off-black/50 mb-4 md:mb-6">What you get</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          <PerkCard
            icon={<Gift className="w-5 h-5" />}
            title="A free personalized print"
            body="Pick your size and frame. We mail it directly to you — yours to keep."
          />
          <PerkCard
            icon={<Megaphone className="w-5 h-5" />}
            title="Your story, amplified"
            body="We may run your content as paid ads on Meta — getting your work in front of way more runners than organic alone."
          />
          <PerkCard
            icon={<DollarSign className="w-5 h-5" />}
            title="Commission opportunities"
            body="Top creators get paid per piece or a share of attributed revenue. We sort out the details after your first deliverable lands."
          />
        </div>
      </section>

      {/* What we ask */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 pb-10 md:pb-14">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-off-black/50 mb-4 md:mb-6">What we ask</h2>
        <div className="bg-white border border-border-gray rounded-md p-5 md:p-6 space-y-3">
          <Bullet>One or two short-form videos (Reels or TikToks) within <strong>7 days</strong> of receiving your print.</Bullet>
          <Bullet>Permission for Trackstar to run your content as <strong>paid ads</strong>, including under your own handle if you've enabled whitelisting.</Bullet>
          <Bullet>That you actually ran the race — the print's personalized to your real bib + time.</Bullet>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 pb-10 md:pb-14">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-off-black/50 mb-4 md:mb-6">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4">
          <Step n={1} title="Apply">Two minutes. Tell us about your race and where to ship the print.</Step>
          <Step n={2} title="We approve">We review and ship your print. You'll see real-time tracking in your portal.</Step>
          <Step n={3} title="Film + share">Open the print, react, post. We'll share a brief with hooks + angles to study.</Step>
          <Step n={4} title="Optional: get paid">If your content performs, we'll bring you onto a commission plan.</Step>
        </div>
      </section>

      {/* CTA repeat */}
      <section className="max-w-3xl mx-auto px-4 md:px-8 pb-16 md:pb-24 text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-off-black leading-tight mb-3">
          Ready to run with us?
        </h2>
        <p className="text-sm md:text-base text-off-black/60 mb-6">
          Applications take under two minutes. You'll know everything you need before you commit.
        </p>
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

function PerkCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="bg-white border border-border-gray rounded-md p-5">
      <div className="w-9 h-9 rounded-md bg-[#4F2DD4]/10 text-[#4F2DD4] flex items-center justify-center mb-3">
        {icon}
      </div>
      <div className="text-base font-semibold text-off-black mb-1.5">{title}</div>
      <div className="text-sm text-off-black/60 leading-relaxed">{body}</div>
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
