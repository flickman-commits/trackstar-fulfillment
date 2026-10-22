import { useEffect, useState } from 'react'
import { Loader2, Truck, ArrowUpRight } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { chip, chipTone } from '@/lib/ui'

/**
 * Production & shipping for the order view: Artelo's production status and
 * Shopify's tracking, read live when the order opens
 * (server/domain/orders/productionStatus.js), so a completed order can still
 * be checked on. The same data Support shows for a customer's orders.
 */
type Tracking = { url: string | null; number: string | null; company: string | null; shippedAt: string | null; deliveredAt: string | null; estimatedAt: string | null; status: string | null }
type Status = {
  stage: string | null
  production: { status: string | null; itemStatus: string | null; url: string | null } | null
  fulfillment: { status: string | null; financial: string | null; cancelled: boolean } | null
  tracking: Tracking[]
  errors: string[]
}

function day(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
}

function stageTone(stage: string | null): keyof typeof chipTone {
  if (!stage) return 'quiet'
  if (stage === 'Delivered') return 'emerald'
  if (/^(Shipped|In transit|Out for delivery)$/.test(stage)) return 'blue'
  if (/^In production/.test(stage)) return 'purple'
  if (/Refunded|cancelled/.test(stage)) return 'red'
  return 'quiet'
}

export default function OrderProduction({ orderId }: { orderId: string }) {
  const [data, setData] = useState<Status | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    setData(null); setFailed(false)
    apiFetch(`/api/orders/production?orderId=${encodeURIComponent(orderId)}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { if (live) setData(d) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [orderId])

  return (
    <div>
      <h4 className="text-[10px] font-semibold text-off-black/40 uppercase tracking-wider mb-1.5">Production &amp; shipping</h4>
      {!data && !failed && <p className="text-xs text-off-black/45 inline-flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Checking Artelo and Shopify…</p>}
      {failed && <p className="text-xs text-off-black/45">Could not check right now.</p>}
      {data && (
        <div className="space-y-1.5 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`${chip} ${chipTone[stageTone(data.stage)]}`}>{data.stage}</span>
            {data.production?.url && (
              <a href={data.production.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-off-black/55 hover:text-off-black" title="Open the Artelo order">
                Artelo: {data.production.itemStatus || data.production.status || 'open'} <ArrowUpRight className="w-3 h-3" />
              </a>
            )}
          </div>
          {data.tracking.map((t, i) => (
            <div key={i} className="flex items-start gap-1.5 text-off-black/65 min-w-0">
              <Truck className="w-3.5 h-3.5 mt-px flex-shrink-0 text-off-black/40" />
              <span className="min-w-0">
                {t.url
                  ? <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 break-all">{t.company || 'Tracking'} {t.number}</a>
                  : <span className="break-all">{t.company || 'Tracking'} {t.number}</span>}
                <span className="block text-[11px] text-off-black/45">
                  {t.shippedAt ? `Shipped ${day(t.shippedAt)}` : ''}
                  {t.deliveredAt ? ` · Delivered ${day(t.deliveredAt)}` : t.estimatedAt ? ` · Expected ${day(t.estimatedAt)}` : ''}
                </span>
              </span>
            </div>
          ))}
          {data.errors.length > 0 && <p className="text-[11px] text-amber-700">{data.errors.join('. ')}; this may be incomplete.</p>}
        </div>
      )}
    </div>
  )
}
