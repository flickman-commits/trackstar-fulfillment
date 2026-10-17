import { useEffect, useState } from 'react'
import { ArrowUpRight, Inbox, Instagram } from 'lucide-react'
import { supportApi, type OrderConversation } from '@/lib/supportApi'
import { STATUS_LABEL, STATUS_TONE } from '@/lib/supportStatus'
import { ago } from '@/lib/supportDates'
import { chip } from '@/lib/ui'

/**
 * Under an order's actions in the fulfillment tool: the customer's Support
 * conversations that are still going, each opening in Support. Shows
 * nothing when there are none, or for someone without Support.
 */
export default function OrderConversations({ orderId, enabled }: { orderId: string; enabled: boolean }) {
  const [threads, setThreads] = useState<OrderConversation[]>([])
  useEffect(() => {
    if (!enabled) return
    let live = true
    setThreads([])
    supportApi.orderConversations(orderId).then(r => { if (live) setThreads(r.threads) }).catch(() => {})
    return () => { live = false }
  }, [orderId, enabled])
  if (!enabled || threads.length === 0) return null
  return (
    <div className="pt-3">
      <div className="text-[10px] font-semibold text-off-black/40 uppercase tracking-wider mb-1.5 inline-flex items-center gap-1.5">
        <Inbox className="w-3 h-3" />Talking to Support · {threads.length}
      </div>
      <div className="space-y-1.5">
        {threads.map(t => (
          <a key={t.id} href={`/support?thread=${encodeURIComponent(t.id)}`} target="_blank" rel="noopener noreferrer"
            className="group block rounded-md border border-border-gray bg-white px-3 py-2 hover:border-off-black/30 transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              {t.channel === 'instagram' && <Instagram className="w-3.5 h-3.5 shrink-0 text-off-black/50" />}
              <span className="text-sm font-medium text-off-black truncate">{t.subject}</span>
              <ArrowUpRight className="w-3.5 h-3.5 ml-auto shrink-0 text-off-black/30 group-hover:text-off-black/60" />
            </div>
            {t.snippet && <div className="text-xs text-off-black/55 truncate mt-0.5">{t.snippet}</div>}
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-off-black/45">
              <span className={`${chip} ${STATUS_TONE[t.status]}`}>{t.snoozed ? 'Snoozed' : STATUS_LABEL[t.status]}</span>
              {t.assignee && <span>{t.assignee}</span>}
              <span className="ml-auto tabular-nums">{ago(t.lastMessageAt)}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
