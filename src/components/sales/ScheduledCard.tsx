import { useState } from 'react'
import { Clock, Loader2, Send, AlertCircle, Paperclip } from 'lucide-react'
import { btnPrimary, btnSecondary, btnGhost, cardLabel } from '@/lib/ui'
import type { Asset, ScheduledEmail } from '@/types/sales'
import { MotionTag } from './Queue'
import { whenLabel } from '@/lib/salesDates'

/**
 * One email waiting in Send later, in the composer's place.
 *
 * Scheduled: when it goes, and the email as it will go. Edit takes it back
 * into the composer; Cancel returns the deal to the queue. Held: the tool
 * stopped it at send time and says why; read that, then send it as it is
 * or edit it.
 */
export default function ScheduledCard({ item, assets, onEdit, onCancel, onSendNow }: {
  item: ScheduledEmail
  assets: Asset[]
  onEdit: () => Promise<void>
  onCancel: () => Promise<void>
  onSendNow: () => Promise<void>
}) {
  const [busy, setBusy] = useState<'edit' | 'cancel' | 'send' | null>(null)
  const run = (k: 'edit' | 'cancel' | 'send', fn: () => Promise<void>) => async () => { setBusy(k); try { await fn() } finally { setBusy(null) } }
  const who = item.deal?.person?.fullName || item.toEmail
  const held = item.status === 'held'
  const files = item.assetIds.map(id => assets.find(a => a.id === id)?.name || id.split(':').pop() || id)
  const chip = 'px-2 py-0.5 rounded bg-off-black/10 text-off-black/60 font-medium'

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0">
      <div className="px-6 py-4 border-b border-border-gray flex-shrink-0">
        <div className="text-lg font-bold text-off-black truncate flex items-center gap-2">
          <span className="truncate">{who}{item.deal && <span className="text-off-black/45 font-normal"> · {item.deal.name}</span>}</span>
          <MotionTag motion={item.deal?.motion} />
        </div>
        <div className="text-xs text-off-black/55 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{item.toEmail}</span>
          {item.touchNumber ? <span className={chip}>Touch {item.touchNumber}</span> : <span className={chip}>One-off</span>}
          {held
            ? <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-semibold">Held</span>
            : <span className={`${chip} inline-flex items-center gap-1`}><Clock className="w-3 h-3" /> Sends {whenLabel(new Date(item.sendAt))}</span>}
        </div>
      </div>

      {held && item.error && (
        <div className="mx-6 mt-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{item.error} It was set for {whenLabel(new Date(item.sendAt))}.</span>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-3 pb-4 space-y-3">
        <div>
          <span className={`${cardLabel} block px-2 mb-0.5`}>Subject</span>
          <p className="px-2 text-sm font-medium text-off-black">{item.subject}</p>
        </div>
        <div>
          <span className={`${cardLabel} block px-2 mb-0.5`}>Body</span>
          <p className="px-2 text-sm leading-relaxed text-off-black whitespace-pre-wrap">{item.body}</p>
          <p className="px-2 mt-2 text-xs text-off-black/40">Your signature is added when it sends.</p>
        </div>
        {files.length > 0 && (
          <div className="px-2 flex flex-wrap items-center gap-2 text-xs">
            <Paperclip className="w-3.5 h-3.5 text-off-black/40" />
            {files.map(f => <span key={f} className="px-2 py-1 rounded border border-border-gray bg-white font-medium">{f}</span>)}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-6 py-3 border-t border-border-gray flex-shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={run('cancel', onCancel)} disabled={Boolean(busy)} className={btnGhost}>{busy === 'cancel' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Cancel send</button>
          <button onClick={run('edit', onEdit)} disabled={Boolean(busy)} className={btnSecondary}>{busy === 'edit' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Edit</button>
        </div>
        {held && (
          <button onClick={run('send', onSendNow)} disabled={Boolean(busy)} className={`${btnPrimary} px-5 py-2.5 text-sm`}>
            {busy === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send now
          </button>
        )}
      </div>
    </div>
  )
}
