import { useState } from 'react'
import { ExternalLink, Loader2, Package, Truck, AlertCircle, Database, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { btnSecondary, cardLabel, chip, chipTone, infoCard, sectionLabel, textLink } from '@/lib/ui'
import { supportApi } from '@/lib/supportApi'
import { ago, day } from '@/lib/supportDates'
import { StatusChip } from './ThreadList'
import type { CustomerOrder, MailboxStatus, OrderItem, ThreadDetail } from '@/types/support'

/**
 * The right column: what we know about the person writing in.
 *
 * Their orders, from Shopify (paid, fulfilled, tracking, what they typed at
 * checkout) with our own rows for each line item beside them (research,
 * design status, the approval link), then their other threads. An admin
 * also sees the mailbox itself here: whether it is connected and how far
 * the history import has got.
 */
const FULFILLMENT_TONE: Record<string, string> = {
  FULFILLED: chipTone.emerald,
  UNFULFILLED: chipTone.amber,
  PARTIALLY_FULFILLED: chipTone.amber,
  IN_PROGRESS: chipTone.blue,
  ON_HOLD: chipTone.slate,
  SCHEDULED: chipTone.slate,
}
const FINANCIAL_TONE: Record<string, string> = {
  PAID: chipTone.quiet,
  REFUNDED: chipTone.red,
  PARTIALLY_REFUNDED: chipTone.rose,
  PENDING: chipTone.amber,
  VOIDED: chipTone.red,
}
const ITEM_STATUS_LABEL: Record<string, string> = {
  pending: 'Researching',
  missing_year: 'Needs year',
  ready: 'Ready',
  flagged: 'Flagged',
  completed: 'Sent to production',
}
const DESIGN_LABEL: Record<string, string> = {
  not_started: 'Design not started',
  in_progress: 'Designing',
  awaiting_review: 'Awaiting review',
  in_revision: 'In revision',
  approved_by_customer: 'Approved by customer',
  final_pdf_uploaded: 'Final uploaded',
  sent_to_production: 'Sent to production',
}

function titleCase(s: string | null) {
  return s ? s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) : ''
}

function Item({ it }: { it: OrderItem }) {
  return (
    <div className="pt-2 mt-2 border-t border-border-gray/80 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-off-black truncate">{it.runner}</span>
        <span className="text-off-black/50 shrink-0">{it.size} · {it.frame}</span>
      </div>
      <div className="text-off-black/60 truncate">{it.race} {it.year}{it.isRush ? ' · Rush' : ''}{it.hasPhoto ? ' · Photo' : ''}</div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className={`${chip} ${it.status === 'completed' || it.designStatus === 'sent_to_production' ? chipTone.emerald : it.status === 'flagged' ? chipTone.red : chipTone.quiet}`}>
          {it.designStatus ? DESIGN_LABEL[it.designStatus] || titleCase(it.designStatus) : ITEM_STATUS_LABEL[it.status] || titleCase(it.status)}
        </span>
        {it.type !== 'standard' && <span className={`${chip} ${chipTone.purple}`}>{titleCase(it.type)}</span>}
        {it.lookupVerified && <span className={`${chip} ${chipTone.quiet}`} title={`Bib ${it.customerBib || '?'} · ${it.customerFinishTime || ''}`}>Result confirmed</span>}
      </div>
      {it.dueDate && it.designStatus && it.designStatus !== 'sent_to_production' && <div className="mt-1 text-off-black/50">Designs due {day(it.dueDate)}{it.assignee ? ` · ${it.assignee.firstName}` : ''}</div>}
      {it.approvalUrl && <a href={it.approvalUrl} target="_blank" rel="noopener noreferrer" className={`${textLink} mt-1`}>Approval portal <ExternalLink className="w-3 h-3" /></a>}
    </div>
  )
}

function OrderCard({ o }: { o: CustomerOrder }) {
  const [more, setMore] = useState(false)
  return (
    <div className={infoCard}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-off-black">#{o.number}</span>
        <span className="text-xs text-off-black/50">{day(o.createdAt)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {o.fulfillmentStatus && <span className={`${chip} ${FULFILLMENT_TONE[o.fulfillmentStatus] || chipTone.quiet}`}>{titleCase(o.fulfillmentStatus)}</span>}
        {o.financialStatus && o.financialStatus !== 'PAID' && <span className={`${chip} ${FINANCIAL_TONE[o.financialStatus] || chipTone.quiet}`}>{titleCase(o.financialStatus)}</span>}
        {o.total && <span className="text-xs text-off-black/60 tabular-nums">{o.currency === 'USD' ? '$' : `${o.currency} `}{o.total}</span>}
        {o.source === 'etsy' && <span className={`${chip} ${chipTone.quiet}`}>Etsy</span>}
        {!o.imported && <span className={`${chip} ${chipTone.quiet}`} title="Not in the fulfillment queue yet">Not imported yet</span>}
      </div>
      {o.discountCodes.length > 0 && <div className="mt-1 text-xs text-off-black/55">Code{o.discountCodes.length > 1 ? 's' : ''}: {o.discountCodes.join(', ')}</div>}
      {o.tracking.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {o.tracking.map((t, i) => (
            <div key={i} className="text-xs inline-flex items-center gap-1.5 text-off-black/70">
              <Truck className="w-3 h-3 shrink-0" />
              {t.url ? <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700">{t.company || 'Tracking'} {t.number}</a> : <span>{t.company || 'Tracking'} {t.number}</span>}
              {t.at && <span className="text-off-black/40">· {ago(t.at)}</span>}
            </div>
          ))}
        </div>
      )}
      {o.shipTo && <div className="mt-1 text-xs text-off-black/50 truncate" title={o.shipTo}>To: {o.shipTo}</div>}
      {o.items.map(it => <Item key={`${it.orderId}`} it={it} />)}
      {o.items.length === 0 && o.lineItems.map((li, i) => (
        <div key={i} className="pt-2 mt-2 border-t border-border-gray/80 text-xs">
          <div className="font-medium text-off-black">{li.title}{li.quantity > 1 ? ` ×${li.quantity}` : ''}</div>
          {li.variant && <div className="text-off-black/60">{li.variant}</div>}
          {Object.keys(li.properties).length > 0 && (
            <button onClick={() => setMore(v => !v)} className="mt-0.5 text-off-black/45 hover:text-off-black/70">{more ? 'Hide' : 'Show'} what they typed</button>
          )}
          {more && <dl className="mt-1 space-y-0.5">{Object.entries(li.properties).map(([k, v]) => <div key={k}><dt className="inline text-off-black/45">{k}: </dt><dd className="inline text-off-black/75">{v}</dd></div>)}</dl>}
        </div>
      ))}
      {o.adminUrl && <a href={o.adminUrl} target="_blank" rel="noopener noreferrer" className={`${textLink} mt-2`}>Open in Shopify <ExternalLink className="w-3 h-3" /></a>}
    </div>
  )
}

/** The mailbox, for an admin: connect it, import its history, see when it last synced. */
export function MailboxCard({ status, isAdmin, onChanged }: { status: MailboxStatus | null; isAdmin: boolean; onChanged: () => void }) {
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  if (!status) return null

  const runBackfill = async () => {
    setImporting(true)
    try {
      for (let i = 0; i < 200; i++) {
        const out = await supportApi.backfill()
        setProgress(out.total)
        if (out.done) { toast.success(`History imported: ${out.total} messages`); break }
      }
      onChanged()
    } catch (e) {
      toast.error((e as Error).message)
    } finally { setImporting(false) }
  }

  return (
    <div>
      <div className={sectionLabel}>Mailbox</div>
      <div className={`${infoCard} mt-2 text-xs space-y-1.5`}>
        <div className="flex items-center gap-2">
          <Mail className="w-3.5 h-3.5 text-off-black/50" />
          {status.connected
            ? <span className="text-off-black">{status.email}</span>
            : <span className="text-amber-700">Not connected{status.configured ? '' : ' (OAuth client not set)'}</span>}
        </div>
        {status.connected && <div className="text-off-black/50">Last import {status.lastImportedAt ? ago(status.lastImportedAt) + ' ago' : 'never'} · syncs every 5 minutes</div>}
        {status.connected && !status.backfill.done && isAdmin && (
          <div className="pt-1">
            <button onClick={runBackfill} disabled={importing} className={btnSecondary}>
              {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
              {importing ? `Importing… ${progress ?? status.backfill.count}` : status.backfill.inProgress ? `Continue history import (${status.backfill.count} so far)` : 'Import mailbox history'}
            </button>
            <p className="mt-1 text-off-black/45">Reads every past thread once so the inbox has its history. Safe to run again.</p>
          </div>
        )}
        {status.connected && status.backfill.done && <div className="text-off-black/50">History imported ({status.backfill.count} messages)</div>}
        {!status.connected && isAdmin && status.configured && (
          <div className="pt-1">
            <a href={supportApi.connectUrl} className={btnSecondary}>Connect {status.expectedEmail}</a>
            <p className="mt-1 text-off-black/45">Sign in to Google as the support account. Any other account is refused.</p>
          </div>
        )}
        {!status.connected && !isAdmin && <div className="text-off-black/50">Ask an admin to connect it.</div>}
      </div>
    </div>
  )
}

export default function ContextPane({ thread, onOpenThread }: { thread: ThreadDetail | null; onOpenThread: (id: string) => void }) {
  if (!thread) return null
  const { orders, shopifyError } = thread.context
  return (
    <>
      <div>
        <div className="flex items-center justify-between">
          <span className={sectionLabel}>Orders</span>
          {orders.length > 0 && <span className={cardLabel}>{orders.length}</span>}
        </div>
        {shopifyError && <div className="mt-2 text-xs text-amber-700 inline-flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />Shopify did not answer; showing what we have on file.</div>}
        {orders.length === 0
          ? <div className="mt-2 text-xs text-off-black/50 inline-flex items-center gap-1.5"><Package className="w-3.5 h-3.5" />No orders under {thread.customerEmail || 'this address'}.</div>
          : <div className="mt-2 space-y-2">{orders.map(o => <OrderCard key={`${o.source}-${o.number}`} o={o} />)}</div>}
      </div>
      {thread.pastThreads.length > 0 && (
        <div>
          <div className={sectionLabel}>Other threads</div>
          <div className="mt-2 space-y-1">
            {thread.pastThreads.map(p => (
              <button key={p.id} onClick={() => onOpenThread(p.id)} className="w-full text-left px-3 py-2 rounded-md border border-border-gray bg-white hover:bg-subtle-gray transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-off-black truncate">{p.subject || '(no subject)'}</span>
                  <span className="text-[11px] text-off-black/45 shrink-0">{ago(p.lastMessageAt)}</span>
                </div>
                <div className="mt-1"><StatusChip status={p.status} compact /></div>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
