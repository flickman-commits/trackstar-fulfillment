import { useState, useEffect, useRef, useCallback } from 'react'
import { Upload, Copy, Loader2, Trash2, Check, ImagePlus, RefreshCw, Link2, CheckCircle2, AlertTriangle, X, Send, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

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

interface ApprovalToken {
  id: string
  orderId: string
  token: string
  expiresAt: string
  createdAt: string
}

interface ProofManagerProps {
  orderId: string
  orderNumber: string
  displayOrderNumber: string
  designStatus?: string
  customerEmail?: string | null
  onDesignStatusChange?: (newStatus: string) => void
  onLatestFeedback?: (feedback: string | null) => void
}

export default function ProofManager({ orderId, designStatus, customerEmail, onDesignStatusChange, onLatestFeedback }: ProofManagerProps) {
  const [proofs, setProofs] = useState<Proof[]>([])
  const [approvalToken, setApprovalToken] = useState<ApprovalToken | null>(null)
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [filePreviews, setFilePreviews] = useState<{ name: string; preview: string }[]>([])
  const [copied, setCopied] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [sendNote, setSendNote] = useState('')
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Compact mode: after approval, just show thumbnails — no upload UI, no big approval link
  const isCompact = ['approved_by_customer', 'final_pdf_uploaded', 'sent_to_production'].includes(designStatus || '')

  const fetchData = useCallback(async () => {
    try {
      const [proofsRes, tokenRes] = await Promise.all([
        fetch(`${API_BASE}/api/proofs?orderId=${orderId}`),
        fetch(`${API_BASE}/api/proofs?action=token&orderId=${orderId}`)
      ])

      if (proofsRes.ok) {
        const data = await proofsRes.json()
        setProofs(data.proofs)
        // Expose latest customer feedback for revision banner
        const revisionProof = [...data.proofs].reverse().find((p: Proof) => p.status === 'revision_requested' && p.customerFeedback)
        onLatestFeedback?.(revisionProof?.customerFeedback || null)
      }

      if (tokenRes.ok) {
        const data = await tokenRes.json()
        setApprovalToken(data.approvalToken)
        // Build URL client-side to always use the correct frontend origin
        setApprovalUrl(`${window.location.origin}/approve/${data.approvalToken.token}`)
      }
    } catch (err) {
      console.error('[ProofManager] Fetch error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const addFiles = (files: File[]) => {
    const remaining = 7 - selectedFiles.length
    const toAdd = files.slice(0, remaining)
    if (toAdd.length === 0) {
      toast.error('Maximum 7 files')
      return
    }

    setSelectedFiles(prev => [...prev, ...toAdd])

    toAdd.forEach(file => {
      const isPdfFile = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      if (isPdfFile) {
        setFilePreviews(prev => [...prev, { name: file.name, preview: 'pdf' }])
      } else {
        const reader = new FileReader()
        reader.onload = (ev) => {
          setFilePreviews(prev => [...prev, { name: file.name, preview: ev.target?.result as string }])
        }
        reader.readAsDataURL(file)
      }
    })
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    addFiles(files)
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) addFiles([file])
        break
      }
    }
  }

  const removeFile = (idx: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== idx))
    setFilePreviews(prev => prev.filter((_, i) => i !== idx))
  }

  const clearFiles = () => {
    setSelectedFiles([])
    setFilePreviews([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const uploadProofs = async () => {
    if (selectedFiles.length === 0) return
    setIsUploading(true)

    let uploaded = 0
    let lastToken: typeof approvalToken = null
    let lastUrl: string | null = null

    try {
      for (const file of selectedFiles) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('orderId', orderId)

        const res = await fetch(`${API_BASE}/api/proofs`, {
          method: 'POST',
          body: formData
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Upload failed' }))
          toast.error(`Failed to upload ${file.name}: ${data.error}`)
          continue
        }

        const data = await res.json()
        setProofs(prev => [...prev, data.proof])
        if (data.approvalToken) {
          lastToken = data.approvalToken
          lastUrl = `${window.location.origin}/approve/${data.approvalToken.token}`
        }
        uploaded++
      }

      if (lastToken) {
        setApprovalToken(lastToken)
        setApprovalUrl(lastUrl)
      }
      clearFiles()
      toast.success(`${uploaded} proof${uploaded !== 1 ? 's' : ''} uploaded`)

      // Auto-advance from not_started → in_progress on first upload
      if (designStatus === 'not_started' && uploaded > 0) {
        onDesignStatusChange?.('in_progress')
      }
    } catch {
      toast.error('Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const deleteProof = async (proofId: string) => {
    setDeletingId(proofId)
    try {
      const res = await fetch(`${API_BASE}/api/proofs`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proofId })
      })
      if (res.ok) {
        setProofs(prev => prev.filter(p => p.id !== proofId))
        toast.success('Proof deleted')
      }
    } catch {
      toast.error('Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  const generateToken = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/proofs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-token', orderId })
      })
      if (res.ok) {
        const data = await res.json()
        setApprovalToken(data.approvalToken)
        setApprovalUrl(`${window.location.origin}/approve/${data.approvalToken.token}`)
        toast.success('Approval link generated')
      }
    } catch {
      toast.error('Failed to generate link')
    }
  }

  const copyLink = async () => {
    if (!approvalUrl) return
    try {
      await navigator.clipboard.writeText(approvalUrl)
    } catch {
      // Fallback for HTTP / insecure contexts where clipboard API fails
      const textarea = document.createElement('textarea')
      textarea.value = approvalUrl
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    setCopied(true)
    toast.success('Approval link copied')
    setTimeout(() => setCopied(false), 2000)
  }

  const sendToCustomer = async () => {
    if (!customerEmail) {
      toast.error('No customer email on this order')
      return
    }
    setIsSending(true)
    try {
      const res = await fetch(`${API_BASE}/api/proofs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-to-customer', orderId, note: sendNote.trim() || null })
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to send')
        return
      }
      if (data.approvalUrl) {
        setApprovalUrl(data.approvalUrl)
      }
      onDesignStatusChange?.('awaiting_review')
      setSendNote('')
      toast.success(`Proofs emailed to ${customerEmail}`)
    } catch {
      toast.error('Failed to send email')
    } finally {
      setIsSending(false)
    }
  }

  const canSend = proofs.some(p => p.status === 'pending') && customerEmail
  const showSendButton = canSend && ['in_progress', 'in_revision'].includes(designStatus || '')
  const showResendButton = canSend && designStatus === 'awaiting_review'
  const isRevision = designStatus === 'in_revision'

  const statusBadge = (proof: Proof) => {
    if (proof.status === 'approved') {
      return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700"><CheckCircle2 className="w-2.5 h-2.5" />Approved</span>
    }
    if (proof.status === 'revision_requested') {
      // Show "Revision" (yellow) if this proof has feedback, otherwise "Not Selected" (red)
      if (proof.customerFeedback) {
        return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700"><AlertTriangle className="w-2.5 h-2.5" />Revision</span>
      }
      return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-600">Rejected</span>
    }
    return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">Pending</span>
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-off-black/30" />
      </div>
    )
  }

  // Lightbox overlay for full-screen proof viewing
  const lightbox = lightboxUrl && (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] cursor-pointer"
      onClick={() => setLightboxUrl(null)}
    >
      <button
        onClick={() => setLightboxUrl(null)}
        className="absolute top-4 right-4 text-white/70 hover:text-white z-10"
      >
        <X className="w-8 h-8" />
      </button>
      <img
        src={lightboxUrl}
        alt="Proof preview"
        className="max-w-[90vw] max-h-[90vh] object-contain select-none"
        onClick={e => e.stopPropagation()}
        draggable={false}
      />
    </div>
  )

  // ═══ COMPACT MODE: just thumbnails for reference ═══
  if (isCompact && proofs.length > 0) {
    return (
      <div className="space-y-2">
        {lightbox}
        <div className="flex flex-wrap gap-2">
          {[...proofs].reverse().map((proof) => (
            <div key={proof.id} className="relative group">
              {proof.imageUrl.toLowerCase().includes('.pdf') ? (
                <a href={proof.imageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2.5 py-2 rounded-md border border-border-gray bg-white hover:bg-gray-50 transition-colors">
                  <span className="text-sm">📄</span>
                  <span className="text-[10px] text-off-black/50 max-w-[80px] truncate">{proof.fileName || `v${proof.version}`}</span>
                </a>
              ) : (
                <button onClick={() => setLightboxUrl(proof.imageUrl)} className="block">
                  <img
                    src={proof.imageUrl}
                    alt={`Proof v${proof.version}`}
                    className="h-14 w-14 object-cover rounded-md border border-border-gray hover:opacity-90 transition-opacity cursor-pointer"
                  />
                </button>
              )}
              <div className="absolute -top-1 -right-1">
                {statusBadge(proof)}
              </div>
            </div>
          ))}
        </div>
        {/* Minimal approval link — just a copy button */}
        {approvalUrl && (
          <button
            onClick={copyLink}
            className="text-[10px] text-off-black/30 hover:text-off-black/50 flex items-center gap-1 transition-colors"
          >
            {copied ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
            {copied ? 'Copied approval link' : 'Copy approval link'}
          </button>
        )}
      </div>
    )
  }

  // ═══ FULL MODE: upload UI, approval link, proof history ═══
  return (
    <div className="space-y-3" onPaste={handlePaste}>
      {lightbox}
      {/* Approval Link — compact inline */}
      {approvalUrl ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={approvalUrl}
            className="flex-1 text-[10px] bg-blue-50 border border-blue-200 rounded px-2 py-1.5 text-blue-800 font-mono truncate"
          />
          <button
            onClick={copyLink}
            className="px-2 py-1.5 text-[10px] font-medium text-blue-600 hover:text-blue-800 rounded transition-colors flex items-center gap-1"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={generateToken}
            className="text-[10px] text-off-black/30 hover:text-off-black/50 transition-colors"
            title="Regenerate link"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={generateToken}
          className="w-full px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors flex items-center justify-center gap-1.5"
        >
          <Link2 className="w-3 h-3" />
          Generate Approval Link
        </button>
      )}

      {/* Upload Proofs */}
      <div className="bg-subtle-gray border border-border-gray rounded-md p-3">
        {filePreviews.length > 0 ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {filePreviews.map((fp, idx) => (
                <div key={idx} className="relative">
                  {fp.preview === 'pdf' ? (
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border-gray bg-white">
                      <span className="text-lg">📄</span>
                      <p className="text-[10px] font-medium text-off-black truncate max-w-[120px]">{fp.name}</p>
                    </div>
                  ) : (
                    <img src={fp.preview} alt={fp.name} className="h-16 w-16 object-cover rounded-md border border-border-gray" />
                  )}
                  <button
                    onClick={() => removeFile(idx)}
                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center hover:bg-red-600"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              {selectedFiles.length < 7 && (
                <label className="cursor-pointer flex items-center justify-center h-16 w-16 rounded-md border-2 border-dashed border-border-gray hover:border-off-black/30 transition-colors">
                  <ImagePlus className="w-4 h-4 text-off-black/30" />
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={uploadProofs}
                disabled={isUploading}
                className="flex-1 px-3 py-2 text-xs font-medium text-white bg-off-black hover:opacity-90 rounded-md transition-opacity disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isUploading ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''}...</>
                ) : (
                  <><Upload className="w-3.5 h-3.5" /> Upload {selectedFiles.length} proof{selectedFiles.length !== 1 ? 's' : ''}</>
                )}
              </button>
              <button
                onClick={clearFiles}
                className="px-3 py-2 text-xs text-off-black/40 hover:text-off-black/60 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        ) : (
          <label className="cursor-pointer flex items-center justify-center gap-2 py-3 text-xs text-off-black/50 hover:text-off-black/70 transition-colors">
            <ImagePlus className="w-4 h-4" />
            <span>Choose proof images (up to 7) or paste from clipboard</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>
        )}
      </div>

      {/* Send to Customer */}
      {showSendButton && (
        <div className="space-y-2">
          <textarea
            value={sendNote}
            onChange={(e) => setSendNote(e.target.value)}
            placeholder="Add a note for the customer (optional)..."
            className="w-full px-3 py-2 border border-border-gray rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-off-black/20 resize-none bg-white"
            rows={2}
          />
          <button
            onClick={sendToCustomer}
            disabled={isSending}
            className="w-full px-3 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
            ) : (
              <><Send className="w-4 h-4" /> {isRevision ? 'Send Updated Proofs' : 'Send Proofs to Customer'}</>
            )}
          </button>
        </div>
      )}

      {showResendButton && (
        <button
          onClick={sendToCustomer}
          disabled={isSending}
          className="w-full px-3 py-1.5 text-xs text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {isSending ? (
            <><Loader2 className="w-3 h-3 animate-spin" /> Resending...</>
          ) : (
            <><RotateCcw className="w-3 h-3" /> Re-send Email to Customer</>
          )}
        </button>
      )}

      {/* Proof History — thumbnail grid grouped by batch */}
      {(() => {
        const currentBatch = proofs.filter(p => p.status === 'pending')
        const previousBatch = proofs.filter(p => p.status !== 'pending')

        const renderThumbnail = (proof: Proof) => (
          <div key={proof.id} className="relative group">
            {proof.imageUrl.toLowerCase().includes('.pdf') ? (
              <a href={proof.imageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2.5 py-2 rounded-md border border-border-gray bg-white hover:bg-gray-50 transition-colors">
                <span className="text-sm">📄</span>
                <span className="text-[10px] text-off-black/50 max-w-[80px] truncate">{proof.fileName || `v${proof.version}`}</span>
              </a>
            ) : (
              <button onClick={() => setLightboxUrl(proof.imageUrl)} className="block">
                <img
                  src={proof.imageUrl}
                  alt={`Proof v${proof.version}`}
                  className="h-14 w-14 object-cover rounded-md border border-border-gray hover:opacity-90 transition-opacity cursor-pointer"
                />
              </button>
            )}
            <div className="absolute -top-1 -right-1">
              {statusBadge(proof)}
            </div>
            <button
              onClick={() => deleteProof(proof.id)}
              disabled={deletingId === proof.id}
              className="absolute -bottom-1 -right-1 bg-white border border-border-gray rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
              title="Delete"
            >
              {deletingId === proof.id ? (
                <Loader2 className="w-2.5 h-2.5 animate-spin text-off-black/30" />
              ) : (
                <Trash2 className="w-2.5 h-2.5 text-red-400" />
              )}
            </button>
          </div>
        )

        // Find the latest customer feedback from previous batch
        const latestFeedback = [...previousBatch].reverse().find(p => p.customerFeedback)

        return (
          <>
            {/* Current batch */}
            {currentBatch.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-off-black/40 uppercase tracking-wider mb-1.5">Current batch ({currentBatch.length})</p>
                <div className="flex flex-wrap gap-2">
                  {[...currentBatch].reverse().map(renderThumbnail)}
                </div>
              </div>
            )}

            {/* Previous batches */}
            {previousBatch.length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] font-semibold text-off-black/30 uppercase tracking-wider mb-1.5">Previous ({previousBatch.length})</p>
                {latestFeedback && (
                  <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-2">
                    <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-0.5">Customer Feedback</p>
                    <p className="text-xs text-amber-900">{latestFeedback.customerFeedback}</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 opacity-60">
                  {[...previousBatch].reverse().map(renderThumbnail)}
                </div>
              </div>
            )}
          </>
        )
      })()}
    </div>
  )
}
