import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2 } from 'lucide-react'
import { Suspense, lazy } from 'react'

const PdfViewer = lazy(() => import('@/components/PdfViewer'))

const MIN_SCALE = 1
const MAX_SCALE = 5
/** What a click, a double-tap or one press of + jumps to from a fitted view. */
const STEP_SCALE = 2.5

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
  // A number, not a boolean. Zoom used to be fit-or-2.5x with nothing in
  // between, which is fine for a peek and useless for reading small type on a
  // poster. Every control now moves the same value.
  const [scale, setScale] = useState(1)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const pinch = useRef<{ dist: number; scale: number } | null>(null)
  /**
   * Where to re-centre once the new size is on screen.
   *
   * Scrolling straight after setScale does nothing useful: React has not
   * re-rendered the image at its new size yet, so the scroll position is
   * clamped against the OLD dimensions and collapses to zero. Stash the intent
   * and apply it in a layout effect, which runs after the DOM is updated and
   * before paint, so there is no visible jump.
   */
  const anchor = useRef<{ px: number; py: number; ratio: number } | null>(null)
  const zoomed = scale > 1

  const proof = proofs[index]
  const many = proofs.length > 1

  // The fitted size has to be a concrete number of pixels: every zoom level is
  // a multiple of it, and the scroll extents depend on it.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    const a = anchor.current
    const el = scrollRef.current
    anchor.current = null
    if (!a || !el) return
    el.scrollLeft = (el.scrollLeft + a.px) * a.ratio - a.px
    el.scrollTop = (el.scrollTop + a.py) * a.ratio - a.py
  }, [scale])

  const PAD = 16
  const fitted = natural && box
    ? (() => {
        const r = Math.min((box.w - PAD * 2) / natural.w, (box.h - PAD * 2) / natural.h, 1)
        return { w: Math.max(1, natural.w * r), h: Math.max(1, natural.h * r) }
      })()
    : null

  /**
   * Change zoom while keeping the point under the cursor or fingers still.
   *
   * Without this the image jumps to a different part of itself on every step,
   * which is what makes a zoom feel broken: you aim at the finish time, zoom,
   * and end up looking at the sky.
   */
  const zoomAt = useCallback((next: number, clientX?: number, clientY?: number) => {
    const el = scrollRef.current
    const target = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next))
    setScale(prev => {
      if (!el || target === prev) return target
      const rect = el.getBoundingClientRect()
      const px = (clientX ?? rect.left + rect.width / 2) - rect.left
      const py = (clientY ?? rect.top + rect.height / 2) - rect.top
      anchor.current = { px, py, ratio: target / prev }
      return target
    })
  }, [])

  const go = useCallback(
    (delta: number) => {
      if (!many) return
      const next = (index + delta + proofs.length) % proofs.length
      setScale(1)
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
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(scale === 1 ? STEP_SCALE : scale * 1.4) }
      if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomAt(scale / 1.4) }
      if (e.key === '0') { e.preventDefault(); zoomAt(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose, zoomAt, scale])

  // Hold the page still underneath, and put it back exactly as it was.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Reset the scroll position when the option changes, or the next design opens
  // halfway down.
  useEffect(() => {
    setScale(1)
    setNatural(null)
    scrollRef.current?.scrollTo({ left: 0, top: 0 })
  }, [index])

  // Native listeners, deliberately. React attaches wheel and touchmove as
  // passive, so preventDefault there is ignored and the browser zooms the whole
  // page instead - header, buttons and all. These have to be non-passive to
  // keep the zoom on the artwork.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      // ctrlKey is how a macOS trackpad pinch arrives, and how ctrl/cmd+wheel
      // arrives on a mouse. A plain wheel keeps scrolling the zoomed image.
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setScale(prev => {
        const target = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
        if (target === prev) return prev
        const rect = el.getBoundingClientRect()
        anchor.current = { px: e.clientX - rect.left, py: e.clientY - rect.top, ratio: target / prev }
        return target
      })
    }

    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)

    const onTouchStartNative = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      pinch.current = { dist: dist(e.touches), scale }
    }
    const onTouchMoveNative = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch.current) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2
      const nextRaw = pinch.current.scale * (dist(e.touches) / pinch.current.dist)
      const target = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextRaw))
      setScale(prev => {
        if (target === prev) return prev
        anchor.current = { px: midX - rect.left, py: midY - rect.top, ratio: target / prev }
        return target
      })
    }
    const onTouchEndNative = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch.current = null
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStartNative, { passive: false })
    el.addEventListener('touchmove', onTouchMoveNative, { passive: false })
    el.addEventListener('touchend', onTouchEndNative)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStartNative)
      el.removeEventListener('touchmove', onTouchMoveNative)
      el.removeEventListener('touchend', onTouchEndNative)
    }
  }, [scale])

  /** Zoom toward the point that was clicked, rather than to the middle. */
  const toggleZoomAt = (clientX: number, clientY: number) =>
    zoomAt(zoomed ? 1 : STEP_SCALE, clientX, clientY)

  // Swipe changes option, but only while fitted: once zoomed, a horizontal drag
  // is the user panning around the print and must not also flip the page.
  const onTouchStart = (e: React.TouchEvent) => {
    if (zoomed || !many || e.touches.length > 1) { touchStart.current = null; return }
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start || pinch.current) return
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
            <>
              {/* Separate in and out, rather than one toggle that only knew two
                  states. The percentage doubles as the reset. */}
              <button
                onClick={() => zoomAt(scale / 1.4)}
                disabled={scale <= MIN_SCALE}
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-white/10 disabled:opacity-30"
                style={{ color: '#FFFFFF' }}
                title="Zoom out (minus key)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={() => zoomAt(1)}
                className="px-2 py-1.5 rounded-lg text-[12px] font-medium tabular-nums transition-colors hover:bg-white/10"
                style={{ color: zoomed ? '#FFFFFF' : 'rgba(255,255,255,0.55)' }}
                title="Reset to fit (0)"
              >
                {Math.round(scale * 100)}%
              </button>
              <button
                onClick={() => zoomAt(scale === 1 ? STEP_SCALE : scale * 1.4)}
                disabled={scale >= MAX_SCALE}
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-white/10 disabled:opacity-30"
                style={{ color: '#FFFFFF' }}
                title="Zoom in (plus key)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </>
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
                onLoad={e => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                onClick={e => toggleZoomAt(e.clientX, e.clientY)}
                className={`select-none ${zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'} ${fitted ? '' : 'max-w-full max-h-full object-contain'}`}
                // Sized from the fitted dimensions so every zoom level is an
                // exact multiple of "fits the screen", and so the scroll extents
                // match what is actually drawn. Falls back to object-contain
                // until the image reports its natural size.
                style={fitted ? { width: fitted.w * scale, height: fitted.h * scale, maxWidth: 'none' } : undefined}
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

      {/* The shortcuts were already bound and completely invisible, which is the
          same as not having them. Desktop only: there are no keys to press on a
          phone, and pinch needs no instructions. */}
      <div className="hidden md:block text-center pb-1 pt-2 shrink-0" style={{ backgroundColor: '#141414' }}>
        <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {pdf
            ? 'Arrow keys to change option · Esc to close'
            : 'Scroll to zoom · click the design to zoom in · + and − to step · 0 to fit · arrow keys to change option · Esc to close'}
        </span>
      </div>

      {many && (
        <div className="flex items-center justify-center gap-1.5 pb-3 pt-1 shrink-0" style={{ backgroundColor: '#141414' }}>
          {proofs.map((p, i) => (
            <button
              key={p.id}
              onClick={() => { setScale(1); onIndexChange(i) }}
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
