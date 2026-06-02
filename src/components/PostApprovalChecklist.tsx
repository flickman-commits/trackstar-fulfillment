import { useState, useEffect } from 'react'
import { CheckCircle2, ExternalLink, Loader2, Send, Square, CheckSquare, Download } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'

const API_BASE = import.meta.env.VITE_API_URL || ''
const GOOGLE_DRIVE_FOLDER = 'https://drive.google.com/drive/folders/1hvHh3F9Wdo8cpLPziSbIC1SUHe6Tq1OI'

interface ChosenProof {
  imageUrl: string
  thumbnailUrl: string | null
  fileName: string | null
  version: number
}

interface PostApprovalChecklistProps {
  orderId: string
  orderNumber: string
  displayOrderNumber: string
  designStatus: string
  onDesignStatusChange: (newStatus: string) => void
}

export default function PostApprovalChecklist({
  orderId,
  displayOrderNumber,
  designStatus,
  onDesignStatusChange,
}: PostApprovalChecklistProps) {
  const [isSending, setIsSending] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const [chosenProof, setChosenProof] = useState<ChosenProof | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)

  const isSentToProduction = designStatus === 'sent_to_production'

  // On the done-state view, fetch the winning design (the one proof the
  // customer approved) so Dan can see and re-download the final mockup.
  useEffect(() => {
    if (!isSentToProduction) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch(`${API_BASE}/api/proofs?orderId=${orderId}`)
        if (!res.ok) return
        const data = await res.json()
        const approved = (data.proofs || []).find((p: { status: string }) => p.status === 'approved')
        if (!cancelled && approved) setChosenProof(approved)
      } catch {
        /* non-critical — the done state still renders without the preview */
      }
    })()
    return () => { cancelled = true }
  }, [isSentToProduction, orderId])

  const isPdf = (url: string) => url.toLowerCase().includes('.pdf')

  const downloadMockup = async () => {
    if (!chosenProof) return
    setIsDownloading(true)
    try {
      const res = await fetch(chosenProof.imageUrl)
      const blob = await res.blob()
      const ext = isPdf(chosenProof.imageUrl) ? 'pdf' : (chosenProof.imageUrl.split('.').pop()?.split('?')[0] || 'jpg')
      const name = chosenProof.fileName || `mockup-order-${displayOrderNumber}.${ext}`
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } catch {
      // Fallback: open in a new tab if the blob fetch is blocked
      window.open(chosenProof.imageUrl, '_blank', 'noopener,noreferrer')
    } finally {
      setIsDownloading(false)
    }
  }

  const notifyEliAndSendToProduction = async () => {
    setIsSending(true)
    try {
      // Send Slack notification to Eli
      await apiFetch(`${API_BASE}/api/proofs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'notify-production', orderId })
      })
      // Update design status
      onDesignStatusChange('sent_to_production')
      toast.success('Eli has been notified — sent to production!')
    } catch {
      toast.error('Failed to notify Eli')
    } finally {
      setIsSending(false)
    }
  }

  if (isSentToProduction) {
    return (
      <div className="space-y-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-md p-4 text-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
          <p className="text-sm font-medium text-emerald-800">Sent to Production</p>
          <p className="text-xs text-emerald-600 mt-1">Eli has been notified.</p>
        </div>

        {/* Winning design — the proof the customer approved */}
        {chosenProof && (
          <div className="bg-subtle-gray border border-border-gray rounded-md p-4">
            <p className="text-[10px] font-semibold text-off-black/40 uppercase tracking-wider mb-3">Final Design</p>
            {isPdf(chosenProof.imageUrl) ? (
              <a
                href={chosenProof.imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-full py-10 rounded-md border border-border-gray bg-white text-5xl hover:opacity-90 transition-opacity"
                title="Open PDF"
              >
                📄
              </a>
            ) : (
              <a
                href={chosenProof.imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
                title="View full size"
              >
                <img
                  src={chosenProof.imageUrl}
                  alt="Final approved design"
                  className="w-full max-h-[28rem] object-contain rounded-md border border-border-gray bg-white hover:opacity-90 transition-opacity"
                />
              </a>
            )}
            <div className="text-center mt-3">
              <button
                onClick={downloadMockup}
                disabled={isDownloading}
                className="inline-flex items-center gap-1.5 text-sm text-off-black/60 hover:text-off-black underline underline-offset-2 transition-colors disabled:opacity-50"
              >
                {isDownloading ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Downloading...</>
                ) : (
                  <><Download className="w-3.5 h-3.5" /> Download Mockup</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Step 1: Open Google Drive to upload */}
      <a
        href={GOOGLE_DRIVE_FOLDER}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-md transition-colors"
      >
        <ExternalLink className="w-4 h-4" />
        Open Google Drive to Upload PDF
      </a>

      {/* Step 2: Checkbox — I've uploaded */}
      <button
        onClick={() => setUploaded(!uploaded)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-md border transition-colors text-left ${
          uploaded
            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
            : 'text-off-black/60 bg-subtle-gray border-border-gray hover:bg-white'
        }`}
      >
        {uploaded ? (
          <CheckSquare className="w-4 h-4 shrink-0 text-emerald-600" />
        ) : (
          <Square className="w-4 h-4 shrink-0 text-off-black/30" />
        )}
        PDF exported and uploaded to Google Drive
      </button>

      {/* Step 3: Notify Eli */}
      <button
        onClick={notifyEliAndSendToProduction}
        disabled={isSending}
        className="w-full px-4 py-3 text-sm font-medium text-white bg-off-black hover:opacity-90 rounded-md transition-opacity flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {isSending ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Notifying Eli...</>
        ) : (
          <><Send className="w-4 h-4" /> Files Uploaded — Notify Eli</>
        )}
      </button>
    </div>
  )
}
