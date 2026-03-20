import { useEffect, useRef, useState } from 'react'
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'

// Use the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

interface PdfViewerProps {
  url: string
  maxHeight?: number
}

export default function PdfViewer({ url, maxHeight }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadPdf() {
      setLoading(true)
      setError(null)
      try {
        const loadingTask = pdfjsLib.getDocument(url)
        const pdf = await loadingTask.promise
        if (cancelled) return
        pdfDocRef.current = pdf
        setTotalPages(pdf.numPages)
        setCurrentPage(1)
        await renderPage(pdf, 1)
      } catch (err) {
        if (!cancelled) {
          console.error('[PdfViewer] Failed to load PDF:', err)
          setError('Failed to load PDF')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadPdf()
    return () => { cancelled = true }
  }, [url])

  async function renderPage(pdf: pdfjsLib.PDFDocumentProxy, pageNum: number) {
    const canvas = canvasRef.current
    if (!canvas) return

    const page = await pdf.getPage(pageNum)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Scale to fit container width while maintaining aspect ratio
    const containerWidth = canvas.parentElement?.clientWidth || 800
    const viewport = page.getViewport({ scale: 1 })
    const scale = containerWidth / viewport.width
    // Cap scale for very small PDFs to avoid blurriness, use 2x for retina
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    const finalScale = scale * pixelRatio
    const scaledViewport = page.getViewport({ scale: finalScale })

    canvas.width = scaledViewport.width
    canvas.height = scaledViewport.height
    // Display size (CSS) is the non-retina size
    canvas.style.width = `${scaledViewport.width / pixelRatio}px`
    canvas.style.height = `${scaledViewport.height / pixelRatio}px`

    await page.render({ canvasContext: ctx, canvas, viewport: scaledViewport }).promise
  }

  const goToPage = async (pageNum: number) => {
    if (!pdfDocRef.current || pageNum < 1 || pageNum > totalPages) return
    setCurrentPage(pageNum)
    setLoading(true)
    await renderPage(pdfDocRef.current, pageNum)
    setLoading(false)
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-red-500">
        {error}
      </div>
    )
  }

  return (
    <div className="relative" onContextMenu={e => e.preventDefault()}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80 z-10">
          <Loader2 className="w-6 h-6 animate-spin text-off-black/30" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="w-full select-none"
        style={{ maxHeight: maxHeight ? `${maxHeight}px` : undefined, objectFit: 'contain' }}
      />
      {/* Page navigation — only show if multi-page */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 py-2 bg-gray-50 border-t border-border-gray">
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-off-black/60">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
