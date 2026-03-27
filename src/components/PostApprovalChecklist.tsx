import { useState } from 'react'
import { CheckCircle2, ExternalLink, Loader2, Send, Square, CheckSquare } from 'lucide-react'
import { toast } from 'sonner'

const API_BASE = import.meta.env.VITE_API_URL || ''
const GOOGLE_DRIVE_FOLDER = 'https://drive.google.com/drive/folders/1hvHh3F9Wdo8cpLPziSbIC1SUHe6Tq1OI'

interface PostApprovalChecklistProps {
  orderId: string
  orderNumber: string
  displayOrderNumber: string
  designStatus: string
  onDesignStatusChange: (newStatus: string) => void
}

export default function PostApprovalChecklist({
  orderId,
  designStatus,
  onDesignStatusChange,
}: PostApprovalChecklistProps) {
  const [isSending, setIsSending] = useState(false)
  const [uploaded, setUploaded] = useState(false)

  const isSentToProduction = designStatus === 'sent_to_production'

  const notifyEliAndSendToProduction = async () => {
    setIsSending(true)
    try {
      // Send Slack notification to Eli
      await fetch(`${API_BASE}/api/proofs`, {
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
      <div className="bg-emerald-50 border border-emerald-200 rounded-md p-4 text-center">
        <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
        <p className="text-sm font-medium text-emerald-800">Sent to Production</p>
        <p className="text-xs text-emerald-600 mt-1">Eli has been notified.</p>
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
