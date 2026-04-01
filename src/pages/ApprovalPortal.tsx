import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, XCircle, Loader2, AlertTriangle, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react'

const PdfViewer = lazy(() => import('@/components/PdfViewer'))

const API_BASE = import.meta.env.VITE_API_URL || ''

interface Proof {
  id: string
  orderId: string
  version: number
  batch: number
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
  designerNote: string | null
}

type PortalState = 'loading' | 'ready' | 'expired' | 'error' | 'all_approved' | 'revision_submitted'

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

      // Show approved screen only if designStatus confirms it AND a proof is approved
      // (prevents stuck "approved" screen after internal unapprove)
      const hasApprovedProof = data.proofs.some((p: Proof) => p.status === 'approved')
      const designConfirmsApproval = ['approved_by_customer', 'final_pdf_uploaded', 'sent_to_production'].includes(data.order.designStatus)
      if (hasApprovedProof && designConfirmsApproval) {
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

  const [revisionOptionNum, setRevisionOptionNum] = useState<number | null>(null)

  const handleRequestRevision = async () => {
    if (!token || !feedback.trim()) return
    const pendingProofs = proofs.filter(p => p.status === 'pending')
    // Use selected proof if one is selected, otherwise use the first pending
    const targetProof = selectedProofId
      ? pendingProofs.find(p => p.id === selectedProofId) || pendingProofs[0]
      : pendingProofs[0]
    if (!targetProof) return

    const optionIdx = pendingProofs.indexOf(targetProof)

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
      setRevisionOptionNum(optionIdx + 1)
      setState('revision_submitted')
    } catch {
      alert('Unable to submit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ═══ LOADING ═══
  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F7F5F0', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: '#666666' }} />
          <p style={{ color: '#666666', fontSize: '14px' }}>Loading your design...</p>
        </div>
      </div>
    )
  }

  // ═══ ERROR ═══
  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#F7F5F0', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <div className="text-center max-w-sm">
          <img src="/trackstar-logo.png" alt="Trackstar" className="h-8 mx-auto mb-8" />
          <XCircle className="w-12 h-12 mx-auto mb-4" style={{ color: '#4600D6' }} />
          <h1 style={{ color: '#1A1A1A', fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Something went wrong</h1>
          <p style={{ color: '#666666', fontSize: '14px' }}>{errorMessage}</p>
        </div>
      </div>
    )
  }

  // ═══ EXPIRED ═══
  if (state === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#F7F5F0', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <div className="text-center max-w-sm">
          <img src="/trackstar-logo.png" alt="Trackstar" className="h-8 mx-auto mb-8" />
          <AlertTriangle className="w-12 h-12 mx-auto mb-4" style={{ color: '#4600D6' }} />
          <h1 style={{ color: '#1A1A1A', fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Link expired</h1>
          <p style={{ color: '#666666', fontSize: '14px' }}>This approval link has expired. Reach out to us and we'll send a fresh one.</p>
        </div>
      </div>
    )
  }

  // ═══ APPROVED ═══
  if (state === 'all_approved') {
    const approvedProof = proofs.find(p => p.status === 'approved')
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#F7F5F0', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <div className="text-center max-w-sm">
          <img src="/trackstar-logo.png" alt="Trackstar" className="h-8 mx-auto mb-8" />
          <CheckCircle2 className="w-16 h-16 mx-auto mb-4" style={{ color: '#4600D6' }} />
          <h1 style={{ color: '#1A1A1A', fontSize: '24px', fontWeight: 700, marginBottom: '12px', letterSpacing: '0.01em' }}>
            Design approved.
          </h1>
          <p style={{ color: '#666666', fontSize: '15px', lineHeight: 1.6, marginBottom: '8px' }}>
            {approvedProof ? `You selected Option ${approvedProof.version}. ` : ''}We'll get it into production.
          </p>
          <p style={{ color: '#999999', fontSize: '13px' }}>Order #{order?.displayOrderNumber || order?.parentOrderNumber}</p>
        </div>
      </div>
    )
  }

  // ═══ REVISION SUBMITTED — success state ═══
  if (state === 'revision_submitted') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#F7F5F0', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <div className="text-center max-w-sm">
          <img src="/trackstar-logo.png" alt="Trackstar" className="h-8 mx-auto mb-8" />
          <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(200, 85, 61, 0.1)' }}>
            <CheckCircle2 className="w-10 h-10" style={{ color: '#C8553D' }} />
          </div>
          <h1 style={{ color: '#1A1A1A', fontSize: '24px', fontWeight: 700, marginBottom: '12px', letterSpacing: '0.01em' }}>
            Revision request received.
          </h1>
          <p style={{ color: '#666666', fontSize: '15px', lineHeight: 1.6, marginBottom: '8px' }}>
            {revisionOptionNum ? `You requested changes to Option ${revisionOptionNum}. ` : ''}We'll update your design and send a new version for review.
          </p>
          <p style={{ color: '#999999', fontSize: '13px' }}>Order #{order?.displayOrderNumber || order?.parentOrderNumber}</p>
        </div>
      </div>
    )
  }

  // ═══ READY — proof selection flow ═══
  const pendingProofs = proofs.filter(p => p.status === 'pending')
  const pastProofs = proofs.filter(p => p.status !== 'pending')
  const hasPendingProofs = pendingProofs.length > 0

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F7F5F0', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 transition-colors"
            style={{ color: '#999999' }}
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={lightboxUrl}
            alt="Proof preview"
            className="max-w-full max-h-[90vh] object-contain select-none"
            onClick={e => e.stopPropagation()}
            draggable={false}
            onContextMenu={e => e.preventDefault()}
          />
        </div>
      )}

      {/* Header — light bar */}
      <div style={{ backgroundColor: '#F0F0F0', borderBottom: '1px solid #E0E0E0' }}>
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <img src="/trackstar-logo.png" alt="Trackstar" className="h-6" />
            <div className="text-right">
              {order?.customerName && (
                <p style={{ color: '#1A1A1A', fontSize: '14px', fontWeight: 500 }}>{order.customerName}</p>
              )}
              <span style={{ color: '#666666', fontSize: '13px' }}>Order #{order?.displayOrderNumber || order?.parentOrderNumber}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-4">
        <div className="mb-4">
          <h1 style={{ color: '#1A1A1A', fontSize: '24px', fontWeight: 700, marginBottom: '4px', letterSpacing: '-0.01em' }}>
            {order?.customerName ? `Hey ${order.customerName}.` : 'Your design is ready.'}
          </h1>
          {hasPendingProofs ? (
            <p style={{ color: '#666666', fontSize: '15px', lineHeight: 1.6 }}>
              {pendingProofs.length === 1
                ? "Take a look and let us know what you think."
                : `We've prepared ${pendingProofs.length} options. Pick your favorite.`
              }
            </p>
          ) : (
            <p style={{ color: '#666666', fontSize: '15px', lineHeight: 1.6 }}>
              We're working on your revisions. Check back soon.
            </p>
          )}
          {order?.designerNote && (
            <div style={{ marginTop: '16px', padding: '12px 16px', backgroundColor: '#F7F5F0', borderLeft: '3px solid #4600D6', borderRadius: '0 4px 4px 0' }}>
              <p style={{ color: '#666666', fontSize: '12px', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Note from our designer</p>
              <p style={{ color: '#1A1A1A', fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-wrap' as const, margin: 0 }}>{order.designerNote}</p>
            </div>
          )}
        </div>

        {proofs.length === 0 ? (
          <div className="p-8 text-center" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
            <p style={{ color: '#666666', fontSize: '14px' }}>No designs uploaded yet. Check back soon.</p>
          </div>
        ) : (
          <>
            {/* Current batch of pending proofs — horizontal carousel */}
            {hasPendingProofs && (
              <>
                <div className="mb-4 mx-auto" style={{ maxWidth: 'min(512px, 100%)' }}>
                  <div className="relative">
                    <div
                      ref={carouselRef}
                      className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-2"
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
                          <div key={proof.id} className="snap-center shrink-0 w-full">
                            <div
                              className="overflow-hidden transition-all cursor-pointer mx-1"
                              style={{
                                backgroundColor: '#FFFFFF',
                                border: isSelected ? '2px solid #4600D6' : '2px solid #E0E0E0',
                                boxShadow: isSelected ? '0 0 0 3px rgba(70, 0, 214, 0.15)' : '0 1px 3px rgba(0,0,0,0.06)'
                              }}
                              onClick={() => setSelectedProofId(isSelected ? null : proof.id)}
                            >
                              {/* Option header — compact */}
                              <div className="flex items-center justify-between px-3 py-2" style={{ backgroundColor: isSelected ? 'rgba(70, 0, 214, 0.04)' : '#FAFAFA', borderBottom: '1px solid #E0E0E0' }}>
                                <div className="flex items-center gap-2">
                                  <span
                                    className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold"
                                    style={{
                                      backgroundColor: isSelected ? '#4600D6' : '#E0E0E0',
                                      color: isSelected ? '#FFFFFF' : '#666666'
                                    }}
                                  >
                                    {pendingProofs.length === 1 ? '✓' : optionNum}
                                  </span>
                                  <span style={{ color: '#1A1A1A', fontSize: '13px', fontWeight: 500 }}>
                                    {pendingProofs.length === 1 ? 'Your Design' : `Option ${optionNum} of ${pendingProofs.length}`}
                                  </span>
                                </div>
                                {isSelected && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: 'rgba(70, 0, 214, 0.1)', color: '#4600D6' }}>
                                    <CheckCircle2 className="w-3 h-3" /> Selected
                                  </span>
                                )}
                              </div>

                              {/* Proof display — fits viewport, 1:1 max */}
                              <div style={{ backgroundColor: '#F5F5F5', maxHeight: 'calc(100vh - 280px)' }} className="flex items-center justify-center overflow-hidden">
                                {isPdf(proof.imageUrl) ? (
                                  <div onClick={e => e.stopPropagation()} className="w-full flex items-center justify-center" style={{ maxHeight: 'calc(100vh - 280px)' }}>
                                    <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin" style={{ color: '#666666' }} /></div>}>
                                      <PdfViewer url={proof.imageUrl} maxHeight={Math.round(window.innerHeight * 0.48)} />
                                    </Suspense>
                                  </div>
                                ) : (
                                  <div
                                    onClick={e => { e.stopPropagation(); setLightboxUrl(proof.imageUrl) }}
                                    className="w-full flex items-center justify-center"
                                    style={{ maxHeight: 'calc(100vh - 280px)' }}
                                  >
                                    <img
                                      src={proof.imageUrl}
                                      alt={`Option ${optionNum}`}
                                      className="w-full h-auto object-contain hover:opacity-95 transition-opacity"
                                      style={{ maxHeight: 'calc(100vh - 280px)' }}
                                      draggable={false}
                                      onContextMenu={e => e.preventDefault()}
                                    />
                                  </div>
                                )}
                              </div>

                              {/* Selection hint — compact */}
                              <div className="px-3 py-1.5 text-center" style={{ borderTop: '1px solid #E0E0E0' }}>
                                <p className="text-[11px] font-medium" style={{ color: isSelected ? '#4600D6' : '#999999' }}>
                                  {isSelected ? '✓ Selected' : 'Tap to select'}
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Arrow buttons (desktop only) */}
                    {pendingProofs.length > 1 && (
                      <>
                        <button
                          onClick={() => {
                            const el = carouselRef.current
                            if (!el) return
                            el.scrollTo({ left: el.scrollLeft - el.offsetWidth, behavior: 'smooth' })
                          }}
                          className={`hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 w-9 h-9 items-center justify-center rounded-full transition-colors ${activeSlide === 0 ? 'opacity-30 pointer-events-none' : ''}`}
                          style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
                        >
                          <ChevronLeft className="w-5 h-5" style={{ color: '#1A1A1A' }} />
                        </button>
                        <button
                          onClick={() => {
                            const el = carouselRef.current
                            if (!el) return
                            el.scrollTo({ left: el.scrollLeft + el.offsetWidth, behavior: 'smooth' })
                          }}
                          className={`hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 w-9 h-9 items-center justify-center rounded-full transition-colors ${activeSlide >= pendingProofs.length - 1 ? 'opacity-30 pointer-events-none' : ''}`}
                          style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
                        >
                          <ChevronRight className="w-5 h-5" style={{ color: '#1A1A1A' }} />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Dot indicators */}
                  {pendingProofs.length > 1 && (
                    <div className="flex items-center justify-center gap-1.5 mt-2">
                      {pendingProofs.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            carouselRef.current?.scrollTo({ left: idx * (carouselRef.current?.offsetWidth || 0), behavior: 'smooth' })
                          }}
                          className="rounded-full transition-all"
                          style={{
                            width: idx === activeSlide ? '24px' : '8px',
                            height: '8px',
                            backgroundColor: idx === activeSlide ? '#1A1A1A' : '#E0E0E0'
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Sticky action bar */}
                <div className="sticky bottom-0 backdrop-blur-sm -mx-4 px-4 py-4" style={{ backgroundColor: 'rgba(247, 245, 240, 0.95)', borderTop: '1px solid #E0E0E0' }}>
                  {showRevisionForm ? (
                    <div className="space-y-3 max-w-2xl mx-auto">
                      <div className="flex items-center justify-between">
                        <label style={{ color: '#1A1A1A', fontSize: '14px', fontWeight: 500 }}>What changes would you like?</label>
                        <button onClick={() => setShowRevisionForm(false)} style={{ color: '#999999' }}>
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <textarea
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="e.g., Change the bib number to 1234 and make the text larger..."
                        className="w-full px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-300"
                        style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0', color: '#1A1A1A' }}
                        rows={3}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleRequestRevision}
                          disabled={submitting || !feedback.trim()}
                          className="flex-1 px-4 py-3 text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                          style={{ backgroundColor: '#1A1A1A', color: '#FFFFFF' }}
                        >
                          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Revision Request'}
                        </button>
                        <button
                          onClick={() => setShowRevisionForm(false)}
                          className="px-4 py-3 text-sm transition-colors"
                          style={{ color: '#666666' }}
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
                        className="flex-1 px-4 py-3 text-sm font-bold transition-colors disabled:opacity-40 flex items-center justify-center gap-2 uppercase tracking-wide"
                        style={{ backgroundColor: '#4600D6', color: '#FFFFFF' }}
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
                        className="px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0', color: '#666666' }}
                      >
                        Request Changes
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Past proofs — grouped by batch */}
            {pastProofs.length > 0 && (() => {
              // Group past proofs by batch number, sorted descending (most recent batch first)
              const batchMap = new Map<number, Proof[]>()
              pastProofs.forEach(p => {
                const b = p.batch || 1
                if (!batchMap.has(b)) batchMap.set(b, [])
                batchMap.get(b)!.push(p)
              })
              const sortedBatches = [...batchMap.entries()].sort((a, b) => b[0] - a[0])
              // Find feedback per batch (the revision_requested proof with feedback)
              const getFeedback = (batchProofs: Proof[]) => {
                const revProof = batchProofs.find(p => p.status === 'revision_requested' && p.customerFeedback)
                return revProof?.customerFeedback || null
              }

              return (
                <div className={hasPendingProofs ? 'mt-4' : ''}>
                  {hasPendingProofs && (
                    <button
                      onClick={() => setShowEarlierVersions(!showEarlierVersions)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 text-sm transition-colors"
                      style={{ color: '#999999' }}
                    >
                      {showEarlierVersions ? (
                        <><ChevronUp className="w-4 h-4" /> Hide earlier versions</>
                      ) : (
                        <><ChevronDown className="w-4 h-4" /> View {sortedBatches.length} earlier round{sortedBatches.length !== 1 ? 's' : ''}</>
                      )}
                    </button>
                  )}
                  {(showEarlierVersions || !hasPendingProofs) && (
                    <div className="space-y-6 mt-2">
                      {sortedBatches.map(([batchNum, batchProofs]) => {
                        const feedback = getFeedback(batchProofs)
                        return (
                          <div key={batchNum}>
                            <p className="text-xs font-medium mb-2" style={{ color: '#999999', letterSpacing: '0.03em' }}>
                              Round {batchNum} — {batchProofs.length} option{batchProofs.length !== 1 ? 's' : ''}
                            </p>
                            <div className="space-y-3">
                              {batchProofs.map((proof, idx) => (
                                <div key={proof.id} className="overflow-hidden opacity-60" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
                                  <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: '#FAFAFA', borderBottom: '1px solid #E0E0E0' }}>
                                    <span style={{ color: '#666666', fontSize: '14px' }}>Option {idx + 1}</span>
                                    <span
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                                      style={{
                                        backgroundColor: proof.status === 'approved' ? 'rgba(70, 0, 214, 0.1)' : 'rgba(0,0,0,0.05)',
                                        color: proof.status === 'approved' ? '#4600D6' : '#666666'
                                      }}
                                    >
                                      {proof.status === 'approved' ? <><CheckCircle2 className="w-3 h-3" /> Approved</> : <><AlertTriangle className="w-3 h-3" /> Revision Requested</>}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                            {feedback && (
                              <div className="mt-2 px-4 py-3" style={{ backgroundColor: '#FAFAFA', border: '1px solid #E0E0E0' }}>
                                <p className="text-xs font-medium mb-1" style={{ color: '#4600D6' }}>Your feedback:</p>
                                <p className="text-sm" style={{ color: '#666666' }}>{feedback}</p>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}
          </>
        )}

        {/* Footer */}
        <div className="mt-12 pt-6 text-center" style={{ borderTop: '1px solid #E0E0E0' }}>
          <p style={{ fontSize: '11px', color: '#999999', letterSpacing: '0.05em' }}>
            Trackstar - Celebrating athletic achievement.
          </p>
        </div>
      </div>
    </div>
  )
}
