import { useCallback, useEffect, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2 } from 'lucide-react'
import { Suspense, lazy } from 'react'

const PdfViewer = lazy(() => import('@/components/PdfViewer'))

const ZOOM = 2.5

export type FullscreenProof = {
  id: string
  imageUrl: string
  groupLabel?: string | null
}

function isPdf(url: string) {
  return url.toLowerCase().includes('.pdf')
}

/**
 * The proof, as big as the screen will allow.
 *
 * Partners approve a print from a card roughly a third of the window, which is
 * a poor way to judge something that gets framed. This is the same set of
 * designs at full size: still navigable, still zoomable, and it closes back to
 * the option you were looking at.
 *
 * Panning and pinch are the browser's, not ours. The image sits in a scroll
 * container and zooming just makes it wider than the container, so native
 * scrolling does the work on both platforms and pinch keeps working on a phone
 * because nothing here blocks it. A hand-rolled gesture layer would be a lot of
 * code to arrive back at what the browser already does properly.
 */
export default function ProofFullscreen({
  proofs,
  index,
  onIndexChange,
  onClose,
  counterLabel,
}: {
  proofs: FullscreenProof[]
  index: number
  onIndexChange: (next: number) => void
  onClose: () => void
  /** e.g. "Marathon: Option 2 of 3". Falls back to a plain count. */
  counterLabel?: string
}) {
  const [zoomed, setZoomed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const proof = proofs[index]
  const many = proofs.length > 1

  const go = useCallback(
    (delta: number) => {
      if (!many) return
      const next = (index + delta + proofs.length) % proofs.length
      setZoomed(false)
      onIndexChange(next)
    },
    [index, many, onIndexChange, proofs.length]
  )

  // Arrow keys move between options, Escape leaves. Bound while open only, so
  // the page underneath keeps its own key handling the rest of the time.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
      if (e.key === '+' || e.key === '=' ) setZoomed(true)
      if (e.key === '-' || e.key === '_') setZoomed(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  // Hold the page still underneath, and put it back exactly as it was.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Reset the scroll position when the option changes, or the next design opens
  // halfway down.
  useEffect(() => {
    scrollRef.current?.scrollTo({ left: 0, top: 0 })
  }, [index, zoomed])

  /** Zoom toward the point that was clicked, rather than to the middle. */
  const toggleZoomAt = (clientX: number, clientY: number) => {
    const el = scrollRef.current
    if (!el) { setZoomed(z => !z); return }
    const rect = el.getBoundingClientRect()
    const relX = (el.scrollLeft + clientX - rect.left) / Math.max(el.scrollWidth, 1)
    const relY = (el.scrollTop + clientY - rect.top) / Math.max(el.scrollHeight, 1)
    const next = !zoomed
    setZoomed(next)
    if (!next) return
    requestAnimationFrame(() => {
      const e2 = scrollRef.current
      if (!e2) return
      e2.scrollTo({
        left: relX * e2.scrollWidth - e2.clientWidth / 2,
        top: relY * e2.scrollHeight - e2.clientHeight / 2,
      })
    })
  }

  // Swipe changes option, but only while fitted: once zoomed, a horizontal drag
  // is the user panning around the print and must not also flip the page.
  const onTouchStart = (e: React.TouchEvent) => {
    if (zoomed || !many) { touchStart.current = null; return }
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1)
  }

  if (!proof) return null

  const label = counterLabel || (many ? `${index + 1} of ${proofs.length}` : 'Your design')
  const pdf = isPdf(proof.imageUrl)

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ backgroundColor: '#0B0B0B' }}>
      {/* Top bar. Kept out of the image area so it never covers the artwork. */}
      <div
        className="flex items-center justify-between gap-3 px-3 py-2.5 shrink-0"
        style={{ backgroundColor: '#141414', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <span className="text-[13px] font-medium truncate" style={{ color: '#FFFFFF' }}>{label}</span>
        <div className="flex items-center gap-1">
          {!pdf && (
            <button
              onClick={() => setZoomed(z => !z)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors hover:bg-white/10"
              style={{ color: '#FFFFFF' }}
              title={zoomed ? 'Zoom out' : 'Zoom in'}
            >
              {zoomed ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
              <span className="hidden sm:inline">{zoomed ? 'Fit' : 'Zoom'}</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors hover:bg-white/10"
            style={{ color: '#FFFFFF' }}
            title="Close full screen (Esc)"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          className={`absolute inset-0 ${zoomed ? 'overflow-auto' : 'overflow-hidden'}`}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* Two different jobs, so two different boxes.
              Fitted: a definite h-full, because the image's max-h-full is a
              percentage and a percentage needs a parent with a real height to
              resolve against. min-h-full is not that, which is why a tall print
              rendered at natural size and ran off the bottom of the screen.
              Zoomed: min-w/min-h so the oversized image can push the container
              out and be scrolled around instead of clipped. */}
          <div className={`flex items-center justify-center p-2 sm:p-4 ${zoomed ? 'min-w-full min-h-full' : 'w-full h-full'}`}>
            {pdf ? (
              <Suspense fallback={<Loader2 className="w-7 h-7 animate-spin" style={{ color: '#888' }} />}>
                <PdfViewer url={proof.imageUrl} maxHeight={Math.round(window.innerHeight * 0.85)} />
              </Suspense>
            ) : (
              <img
                src={proof.imageUrl}
                alt={label}
                onClick={e => toggleZoomAt(e.clientX, e.clientY)}
                className={zoomed ? 'cursor-zoom-out select-none' : 'cursor-zoom-in select-none max-w-full max-h-full object-contain'}
                style={zoomed ? { width: `${ZOOM * 100}%`, maxWidth: 'none' } : undefined}
                draggable={false}
                onContextMenu={e => e.preventDefault()}
              />
            )}
          </div>
        </div>

        {many && (
          <>
            <button
              onClick={() => go(-1)}
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full transition-colors"
              style={{ backgroundColor: 'rgba(255,255,255,0.9)' }}
              title="Previous option (left arrow)"
            >
              <ChevronLeft className="w-6 h-6" style={{ color: '#1A1A1A' }} />
            </button>
            <button
              onClick={() => go(1)}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full transition-colors"
              style={{ backgroundColor: 'rgba(255,255,255,0.9)' }}
              title="Next option (right arrow)"
            >
              <ChevronRight className="w-6 h-6" style={{ color: '#1A1A1A' }} />
            </button>
          </>
        )}
      </div>

      {many && (
        <div className="flex items-center justify-center gap-1.5 py-3 shrink-0" style={{ backgroundColor: '#141414' }}>
          {proofs.map((p, i) => (
            <button
              key={p.id}
              onClick={() => { setZoomed(false); onIndexChange(i) }}
              className="rounded-full transition-all"
              style={{
                width: i === index ? '24px' : '8px',
                height: '8px',
                backgroundColor: i === index ? '#FFFFFF' : 'rgba(255,255,255,0.3)',
              }}
              title={`Option ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
