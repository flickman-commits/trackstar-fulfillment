import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, XCircle, Loader2, AlertTriangle, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react'

const PdfViewer = lazy(() => import('@/components/PdfViewer'))

const API_BASE = import.meta.env.VITE_API_URL || ''

interface Proof {
  id: string
  orderId: string
  version: number
  imageUrl: string
  fileName: string | null
  status: 'pending' | 'approved' | 'revision_requested'
  customerFeedback: string | null
  createdAt: string
  updatedAt: string
}

interface OrderInfo {
  id: string
  orderNumber: string
  parentOrderNumber: string
  displayOrderNumber?: string
  customerName: string | null
  customerEmail: string | null
  raceName: string
  designStatus: string
}

type PortalState = 'loading' | 'ready' | 'expired' | 'error' | 'all_approved'

function isPdf(url: string) {
  return url.toLowerCase().includes('.pdf')
}

export default function ApprovalPortal() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<PortalState>('loading')
  const [order, setOrder] = useState<OrderInfo | null>(null)
  const [proofs, setProofs] = useState<Proof[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedProofId, setSelectedProofId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showRevisionForm, setShowRevisionForm] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [showEarlierVersions, setShowEarlierVersions] = useState(false)
  const [activeSlide, setActiveSlide] = useState(0)
  const carouselRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/api/proofs?action=approve&token=${token}`)
      if (res.status === 410) {
        setState('expired')
        return
      }
      if (!res.ok) {
        const data = await res.json()
        setErrorMessage(data.error || 'Something went wrong')
        setState('error')
        return
      }
      const data = await res.json()
      setOrder(data.order)
      setProofs(data.proofs)

      // Check if any proof is approved
      if (data.proofs.length > 0 && data.proofs.some((p: Proof) => p.status === 'approved')) {
        setState('all_approved')
      } else {
        setState('ready')
      }
    } catch {
      setErrorMessage('Unable to load. Please check your connection and try again.')
      setState('error')
    }
  }, [token])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Approve the selected proof
  const handleApprove = async () => {
    if (!token || !selectedProofId) return
    setSubmitting(true)
    try {
      const res = await fetch(`${API_BASE}/api/proofs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', token, proofId: selectedProofId, approval: 'approve' })
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Something went wrong')
        return
      }
      await fetchData()
    } catch {
      alert('Unable to submit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Request revision — picks the latest pending proof to attach feedback to
  const handleRequestRevision = async () => {
    if (!token || !feedback.trim()) return
    const pendingProofs = proofs.filter(p => p.status === 'pending')
    const targetProof = pendingProofs[pendingProofs.length - 1]
    if (!targetProof) return

    setSubmitting(true)
    try {
      const res = await fetch(`${API_BASE}/api/proofs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          token,
          proofId: targetProof.id,
          approval: 'request_revision',
          feedback: feedback.trim()
        })
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Something went wrong')
        return
      }
      setFeedback('')
      setShowRevisionForm(false)
      await fetchData()
    } catch {
      alert('Unable to submit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Loading state
  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-off-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-off-black/40 mx-auto mb-4" />
          <p className="text-body-sm text-off-black/60">Loading your proofs...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (state === 'error') {
    return (
      <div className="min-h-screen bg-off-white flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <img src="/trackstar-logo.png" alt="Trackstar" className="h-10 mx-auto mb-6" />
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-heading-md text-off-black mb-2">Something went wrong</h1>
          <p className="text-body-sm text-off-black/60">{errorMessage}</p>
        </div>
      </div>
    )
  }

  // Expired state
  if (state === 'expired') {
    return (
      <div className="min-h-screen bg-off-white flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <img src="/trackstar-logo.png" alt="Trackstar" className="h-10 mx-auto mb-6" />
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h1 className="text-heading-md text-off-black mb-2">Link Expired</h1>
          <p className="text-body-sm text-off-black/60">This approval link has expired. Please reach out to us and we'll send you a new one.</p>
        </div>
      </div>
    )
  }

  // Approved state
  if (state === 'all_approved') {
    const approvedProof = proofs.find(p => p.status === 'approved')
    return (
      <div className="min-h-screen bg-off-white flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <img src="/trackstar-logo.png" alt="Trackstar" className="h-10 mx-auto mb-6" />
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-heading-md text-off-black mb-2">Design Approved!</h1>
          <p className="text-body-sm text-off-black/60 mb-2">
            Thanks{order?.customerName ? `, ${order.customerName}` : ''}! {approvedProof ? `You selected Option ${approvedProof.version}. ` : ''}We'll get it into production soon.
          </p>
          <p className="text-body-sm text-off-black/40">Order #{order?.displayOrderNumber || order?.parentOrderNumber}</p>
        </div>
      </div>
    )
  }

  // Ready state — batch selection flow
  const pendingProofs = proofs.filter(p => p.status === 'pending')
  const pastProofs = proofs.filter(p => p.status !== 'pending')
  const hasPendingProofs = pendingProofs.length > 0

  return (
    <div className="min-h-screen bg-off-white">
      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white hover:text-white/80 transition-colors"
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={lightboxUrl}
            alt="Proof preview"
            className="max-w-full max-h-[90vh] object-contain rounded-md select-none"
            onClick={e => e.stopPropagation()}
            draggable={false}
            onContextMenu={e => e.preventDefault()}
          />
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-border-gray">
        <div className="max-w-3xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between">
            <img src="/trackstar-logo.png" alt="Trackstar" className="h-8" />
            <span className="text-body-sm text-off-black/40">Order #{order?.displayOrderNumber || order?.parentOrderNumber}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-heading-lg text-off-black mb-1">
            Hey{order?.customerName ? ` ${order.customerName}` : ''}!
          </h1>
          {hasPendingProofs ? (
            <p className="text-body text-off-black/60">
              {pendingProofs.length === 1
                ? "Here's your custom design. Take a look and let us know what you think!"
                : `We've prepared ${pendingProofs.length} design options for you. Browse them and select your favorite!`
              }
            </p>
          ) : (
            <p className="text-body text-off-black/60">
              We're working on your revisions. Check back soon for updated designs!
            </p>
          )}
        </div>

        {proofs.length === 0 ? (
          <div className="bg-white border border-border-gray rounded-md p-8 text-center">
            <p className="text-body-sm text-off-black/50">No proofs have been uploaded yet. Check back soon!</p>
          </div>
        ) : (
          <>
            {/* Current batch of pending proofs — horizontal carousel */}
            {hasPendingProofs && (
              <>
                <div className="mb-6">
                  {/* Carousel container */}
                  <div className="relative">
                    {/* Scroll container */}
                    <div
                      ref={carouselRef}
                      className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-4 pb-2"
                      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
                      onScroll={() => {
                        const el = carouselRef.current
                        if (!el) return
                        const slideWidth = el.offsetWidth
                        const idx = Math.round(el.scrollLeft / slideWidth)
                        setActiveSlide(idx)
                      }}
                    >
                      {pendingProofs.map((proof, idx) => {
                        const isSelected = selectedProofId === proof.id
                        const optionNum = idx + 1

                        return (
                          <div
                            key={proof.id}
                            className="snap-center shrink-0 w-full"
                          >
                            <div
                              className={`bg-white border-2 rounded-md overflow-hidden transition-all cursor-pointer mx-1 ${
                                isSelected
                                  ? 'border-green-500 ring-2 ring-green-500/20'
                                  : 'border-border-gray hover:border-off-black/30'
                              }`}
                              onClick={() => setSelectedProofId(isSelected ? null : proof.id)}
                            >
                              {/* Option header */}
                              <div className={`flex items-center justify-between px-4 py-3 ${isSelected ? 'bg-green-50' : 'bg-subtle-gray'}`}>
                                <div className="flex items-center gap-3">
                                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                                    isSelected ? 'bg-green-600 text-white' : 'bg-off-black/10 text-off-black'
                                  }`}>
                                    {pendingProofs.length === 1 ? '✓' : optionNum}
                                  </span>
                                  <span className="text-body-sm font-medium text-off-black">
                                    {pendingProofs.length === 1 ? 'Your Design' : `Option ${optionNum} of ${pendingProofs.length}`}
                                  </span>
                                </div>
                                {isSelected && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                    <CheckCircle2 className="w-3 h-3" /> Selected
                                  </span>
                                )}
                              </div>

                              {/* Proof display — fit entire image in viewport, centered */}
                              <div className="border-t border-border-gray bg-gray-50 p-3" style={{ height: '50vh' }}>
                                {isPdf(proof.imageUrl) ? (
                                  <div onClick={e => e.stopPropagation()} className="w-full h-full flex items-center justify-center">
                                    <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-off-black/30" /></div>}>
                                      <PdfViewer url={proof.imageUrl} maxHeight={Math.round(window.innerHeight * 0.48)} />
                                    </Suspense>
                                  </div>
                                ) : (
                                  <div
                                    onClick={e => { e.stopPropagation(); setLightboxUrl(proof.imageUrl) }}
                                    className="w-full h-full flex items-center justify-center"
                                  >
                                    <img
                                      src={proof.imageUrl}
                                      alt={`Option ${optionNum}`}
                                      className="max-w-full max-h-full object-contain hover:opacity-95 transition-opacity"
                                      draggable={false}
                                      onContextMenu={e => e.preventDefault()}
                                    />
                                  </div>
                                )}
                              </div>

                              {/* Selection hint / selected state */}
                              <div className={`px-4 py-2.5 border-t text-center ${isSelected ? 'border-green-200 bg-green-50' : 'border-border-gray'}`}>
                                <p className={`text-xs font-medium ${isSelected ? 'text-green-700' : 'text-off-black/30'}`}>
                                  {isSelected ? '✓ This design is selected' : 'Tap to select this design'}
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Arrow buttons (desktop only, hide on single proof) */}
                    {pendingProofs.length > 1 && (
                      <>
                        <button
                          onClick={() => {
                            const el = carouselRef.current
                            if (!el) return
                            el.scrollTo({ left: el.scrollLeft - el.offsetWidth, behavior: 'smooth' })
                          }}
                          className={`hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 w-9 h-9 items-center justify-center rounded-full bg-white border border-border-gray shadow-md hover:bg-gray-50 transition-colors ${activeSlide === 0 ? 'opacity-30 pointer-events-none' : ''}`}
                        >
                          <ChevronLeft className="w-5 h-5 text-off-black" />
                        </button>
                        <button
                          onClick={() => {
                            const el = carouselRef.current
                            if (!el) return
                            el.scrollTo({ left: el.scrollLeft + el.offsetWidth, behavior: 'smooth' })
                          }}
                          className={`hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 w-9 h-9 items-center justify-center rounded-full bg-white border border-border-gray shadow-md hover:bg-gray-50 transition-colors ${activeSlide >= pendingProofs.length - 1 ? 'opacity-30 pointer-events-none' : ''}`}
                        >
                          <ChevronRight className="w-5 h-5 text-off-black" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Dot indicators + counter */}
                  {pendingProofs.length > 1 && (
                    <div className="flex items-center justify-center gap-1.5 mt-4">
                      {pendingProofs.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            carouselRef.current?.scrollTo({ left: idx * (carouselRef.current?.offsetWidth || 0), behavior: 'smooth' })
                          }}
                          className={`rounded-full transition-all ${
                            idx === activeSlide
                              ? 'w-6 h-2 bg-off-black'
                              : 'w-2 h-2 bg-off-black/20 hover:bg-off-black/40'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Sticky action bar */}
                <div className="sticky bottom-0 bg-off-white/95 backdrop-blur-sm border-t border-border-gray -mx-4 px-4 py-4">
                  {showRevisionForm ? (
                    <div className="space-y-3 max-w-2xl mx-auto">
                      <div className="flex items-center justify-between">
                        <label className="text-body-sm font-medium text-off-black">What changes would you like?</label>
                        <button
                          onClick={() => setShowRevisionForm(false)}
                          className="text-off-black/40 hover:text-off-black/60"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <textarea
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="e.g., I like Option 2 but change the bib number to 1234 and make the text larger..."
                        className="w-full px-3 py-2 text-body-sm border border-border-gray rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-off-black/20 resize-none"
                        rows={3}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleRequestRevision}
                          disabled={submitting || !feedback.trim()}
                          className="flex-1 px-4 py-3 text-body-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-md transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {submitting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Submit Revision Request'
                          )}
                        </button>
                        <button
                          onClick={() => setShowRevisionForm(false)}
                          className="px-4 py-3 text-body-sm text-off-black/50 hover:text-off-black/70 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3 max-w-2xl mx-auto">
                      <button
                        onClick={handleApprove}
                        disabled={!selectedProofId || submitting}
                        className="flex-1 px-4 py-3 text-body-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                      >
                        {submitting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            {selectedProofId ? 'Approve Selected Design' : 'Select a Design to Approve'}
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => { setShowRevisionForm(true); setSelectedProofId(null) }}
                        className="px-4 py-3 text-body-sm font-medium text-off-black/70 bg-white hover:bg-gray-50 border border-border-gray rounded-md transition-colors flex items-center justify-center gap-2"
                      >
                        Request Changes
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Past proofs (already actioned) */}
            {pastProofs.length > 0 && (
              <div className={hasPendingProofs ? 'mt-4' : ''}>
                {hasPendingProofs && (
                  <button
                    onClick={() => setShowEarlierVersions(!showEarlierVersions)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 text-body-sm text-off-black/40 hover:text-off-black/60 transition-colors"
                  >
                    {showEarlierVersions ? (
                      <><ChevronUp className="w-4 h-4" /> Hide earlier versions</>
                    ) : (
                      <><ChevronDown className="w-4 h-4" /> View {pastProofs.length} earlier version{pastProofs.length !== 1 ? 's' : ''}</>
                    )}
                  </button>
                )}
                {(showEarlierVersions || !hasPendingProofs) && (
                  <div className="space-y-4 mt-2">
                    {pastProofs.map(proof => (
                      <div key={proof.id} className="bg-white border border-border-gray/60 rounded-md overflow-hidden opacity-70">
                        <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                          <span className="text-body-sm text-off-black/60">Option {proof.version}</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            proof.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                          }`}>
                            {proof.status === 'approved' ? <><CheckCircle2 className="w-3 h-3" /> Approved</> : <><AlertTriangle className="w-3 h-3" /> Revision Requested</>}
                          </span>
                        </div>
                        {proof.customerFeedback && (
                          <div className="px-4 py-3 border-t border-border-gray bg-amber-50">
                            <p className="text-xs font-medium text-amber-700 mb-1">Your feedback:</p>
                            <p className="text-body-sm text-amber-900">{proof.customerFeedback}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-border-gray text-center">
          <p className="text-xs text-off-black/30">
            Powered by <span className="font-medium">Trackstar</span>
          </p>
        </div>
      </div>
    </div>
  )
}
