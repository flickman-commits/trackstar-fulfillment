import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { btnPrimary, btnGhost, inputBase } from '@/lib/ui'
import { sendFeatureRequest } from '@/components/FeatureRequestsPanel'

/** Request feature, from Support: one line and an optional why, into Settings > Feature Requests. */
export default function RequestFeatureModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)

  const send = async () => {
    setBusy(true)
    try {
      await sendFeatureRequest(title, detail, 'support')
      toast.success('Sent. It is on the Feature Requests list in Settings.')
      onClose()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={() => { if (!busy) onClose() }}
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape' && !busy) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label="Request a feature" className="bg-white rounded-lg shadow-2xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-off-black">Request a feature</h3>
            <p className="text-xs text-off-black/55 mt-0.5">Something that would make the work faster or easier. It goes on the list in <Link to="/settings/features" className="underline" onClick={onClose}>Settings &gt; Feature Requests</Link>.</p>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1 -m-1 text-off-black/40 hover:text-off-black" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What would you like built?" className={`${inputBase} w-full`} autoFocus
          onKeyDown={e => { if (e.key === 'Enter' && title.trim() && !busy) send() }} />
        <textarea value={detail} onChange={e => setDetail(e.target.value)} placeholder="Why it would help, or an example (optional)" rows={4} className={`${inputBase} w-full`} />
        <div className="flex justify-end gap-2">
          <button className={btnGhost} onClick={onClose} disabled={busy}>Cancel</button>
          <button className={btnPrimary} onClick={send} disabled={busy || !title.trim()}>{busy && <Loader2 className="w-3 h-3 animate-spin" />} Send request</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
