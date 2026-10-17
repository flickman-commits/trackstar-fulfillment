import { useState } from 'react'
import { BadgePercent, ExternalLink, Link2, Loader2, MessageSquareWarning, Pencil, Search, StickyNote, Tag, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { btnSecondary, chip, chipTone } from '@/lib/ui'
import { supportApi } from '@/lib/supportApi'
import { day } from '@/lib/supportDates'
import type { CodeLookup, CustomerOrder, ThreadDetail } from '@/types/support'

/**
 * The Actions section: the playbook's repeat moves as buttons, beside the
 * conversation they belong to.
 *
 * Two kinds. "Insert" actions drop a line into the reply box: the tracking
 * link, the approval portal link, a one-line order summary. "Do" actions
 * change something and leave an event in the thread: a personal 15% code,
 * REPRINT on the Shopify order, a note on our order row, a name or year
 * fix before production, a ping to Matt in Slack. Refunds, cancellations
 * and edits are money and happen in Shopify, so those are links straight
 * to the right Shopify page. Every button is one press by a person.
 */
function ActionButton({ onClick, icon: Icon, children, busy, title, href }: { onClick?: () => void; icon: typeof Tag; children: React.ReactNode; busy?: boolean; title?: string; href?: string }) {
  const cls = `${btnSecondary} justify-start w-full text-left`
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" className={cls} title={title}><Icon className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{children}</span><ExternalLink className="w-3 h-3 ml-auto shrink-0 opacity-50" /></a>
  return <button onClick={onClick} disabled={busy} className={cls} title={title}>{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Icon className="w-3.5 h-3.5 shrink-0" />}<span className="truncate">{children}</span></button>
}

function summaryLine(o: CustomerOrder) {
  const it = o.items[0]
  const what = it ? `${it.size} ${it.frame}, ${it.race} ${it.year}` : o.lineItems[0]?.title || 'your print'
  const state = o.fulfillmentStatus === 'FULFILLED' ? 'shipped' : it?.status === 'completed' || it?.designStatus === 'sent_to_production' ? 'in production' : it?.designStatus && it.designStatus !== 'not_started' ? 'being designed' : 'in the queue'
  return `Your order #${o.number} (${what}) placed ${day(o.createdAt)} is ${state}.`
}

function OrderActions({ o, thread, onInsert, onChanged }: { o: CustomerOrder; thread: ThreadDetail; onInsert: (text: string) => void; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const run = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key)
    try { const msg = await fn(); if (msg) toast.success(msg); onChanged() }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(null) }
  }
  const tracking = o.tracking.find(t => t.url) || o.tracking[0] || null
  const approval = o.items.find(it => it.approvalUrl)?.approvalUrl || null
  const editable = o.items.filter(it => it.status !== 'completed' && it.designStatus !== 'sent_to_production')
  const first = (thread.customerName || '').split(/\s+/)[0] || ''
  return (
    <div className="rounded-md border border-border-gray bg-white p-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-off-black">#{o.number}</span>
        <span className="text-[11px] text-off-black/45">{o.items[0] ? `${o.items[0].runner} · ${o.items[0].race}` : day(o.createdAt)}</span>
      </div>
      <div className="space-y-1">
        {tracking && <ActionButton icon={Truck} onClick={() => onInsert(tracking.url ? `Here's your tracking link: ${tracking.url}` : `Your tracking number is ${tracking.number}${tracking.company ? ` (${tracking.company})` : ''}.`)}>Insert tracking link</ActionButton>}
        {approval && <ActionButton icon={Link2} onClick={() => onInsert(`You can view your design options here: ${approval}`)}>Insert approval link</ActionButton>}
        <ActionButton icon={Link2} onClick={() => onInsert(summaryLine(o))}>Insert order status line</ActionButton>
        {o.shopifyOrderId && (
          <ActionButton icon={Tag} busy={busy === 'reprint'} onClick={() => {
            const reason = window.prompt(`Why the reprint on #${o.number}? (goes on the Shopify order)`, 'Arrived damaged')
            if (reason === null) return
            run('reprint', async () => { await supportApi.action('tagReprint', { id: thread.id, shopifyOrderId: o.shopifyOrderId, reason }); return `#${o.number} tagged REPRINT` })
          }}>Tag REPRINT in Shopify</ActionButton>
        )}
        {editable[0] && (
          <ActionButton icon={Pencil} busy={busy === 'fix'} onClick={() => {
            const it = editable[0]
            const name = window.prompt(`Runner's name on #${o.number} (blank to keep "${it.runner}")`, it.runner)
            if (name === null) return
            const year = window.prompt(`Race year (blank to keep ${it.year})`, String(it.year))
            if (year === null) return
            run('fix', async () => { const out = await supportApi.action<{ what: string }>('fixPersonalization', { id: thread.id, orderId: it.orderId, runnerName: name, year: year || undefined }); return `Changed ${out.what}` })
          }} title="Before production only. After that it is a reprint.">Fix name or year</ActionButton>
        )}
        {o.items[0] && (
          <ActionButton icon={StickyNote} busy={busy === 'note'} onClick={() => {
            const text = window.prompt(`Note for fulfillment on #${o.number}`, first ? `${first} asked: ` : '')
            if (!text) return
            run('note', async () => { await supportApi.action('orderNote', { id: thread.id, orderId: o.items[0].orderId, text }); return 'Note left on the order' })
          }}>Note for fulfillment</ActionButton>
        )}
        {o.adminUrl && <ActionButton icon={ExternalLink} href={`${o.adminUrl}/edit`} title="Size, frame, add-ons, address">Edit order in Shopify</ActionButton>}
        {o.adminUrl && <ActionButton icon={ExternalLink} href={`${o.adminUrl}/refund`} title="Full or partial; over $150 is Matt's call">Refund in Shopify</ActionButton>}
      </div>
    </div>
  )
}

export default function Actions({ thread, onInsert, onChanged }: { thread: ThreadDetail; onInsert: (text: string) => void; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [lookup, setLookup] = useState<CodeLookup | null>(null)
  const first = (thread.customerName || '').trim().split(/\s+/)[0] || ''
  const run = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key)
    try { const msg = await fn(); if (msg) toast.success(msg); onChanged() }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(null) }
  }
  const checkCode = async () => {
    const c = code.trim()
    if (!c) return
    setBusy('lookup')
    try { setLookup(await supportApi.action<CodeLookup>('lookupCode', { code: c })) }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(null) }
  }
  return (
    <div className="space-y-2">
      <ActionButton icon={BadgePercent} busy={busy === 'code'} onClick={() => run('code', async () => {
        const out = await supportApi.action<{ code: string; percent: number; endsAt: string }>('discount15', { id: thread.id })
        onInsert(`Use code ${out.code} for ${out.percent}% off your next print (good for 30 days).`)
        return `${out.code} created and dropped into the reply`
      })} title="One use, 30 days, named after them. The Make-It-Right toolkit.">15% code for {first || 'them'}</ActionButton>

      <div className="rounded-md border border-border-gray bg-white p-2">
        <div className="flex items-center gap-1.5">
          <Search className="w-3.5 h-3.5 text-off-black/40 shrink-0" />
          <input value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') checkCode() }} placeholder="Check a code they pasted" className="flex-1 min-w-0 text-xs focus:outline-none placeholder:text-off-black/35" />
          <button onClick={checkCode} disabled={!code.trim() || busy === 'lookup'} className="text-[11px] font-medium text-off-black/60 hover:text-off-black disabled:opacity-40">{busy === 'lookup' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Check'}</button>
        </div>
        {lookup && (
          <div className="mt-2 pt-2 border-t border-border-gray/80 text-xs space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-off-black">{lookup.code}</span>
              {lookup.found && <span className={`${chip} ${/^Valid/.test(lookup.verdict) ? chipTone.emerald : chipTone.red}`}>{lookup.verdict}</span>}
              {lookup.fromKlaviyo && <span className={`${chip} ${chipTone.quiet}`}>Klaviyo</span>}
            </div>
            {lookup.found ? (
              <div className="text-off-black/60">{lookup.value}{lookup.usageLimit ? ` · ${lookup.used ?? 0} of ${lookup.usageLimit} uses` : ''}{lookup.endsAt ? ` · ends ${day(lookup.endsAt)}` : ''}{lookup.oncePerCustomer ? ' · once per customer' : ''}</div>
            ) : <div className="text-off-black/60">{lookup.verdict}</div>}
          </div>
        )}
      </div>

      {thread.context.orders.map(o => <OrderActions key={`${o.source}-${o.number}`} o={o} thread={thread} onInsert={onInsert} onChanged={onChanged} />)}
      {thread.context.orders.length === 0 && <div className="text-[11px] text-off-black/45">No orders found for this customer, so no order actions. Ask for the order number or the email on the order.</div>}

      <ActionButton icon={MessageSquareWarning} busy={busy === 'slack'} onClick={() => {
        const text = window.prompt('What should Matt know? (goes to Slack with a link to this thread)', '')
        if (text === null) return
        run('slack', async () => { await supportApi.action('slackMatt', { id: thread.id, text }); return 'Matt pinged in Slack, thread escalated' })
      }} title="Refund over $150, legal or press, race organizer, or unsure">Slack Matt</ActionButton>
    </div>
  )
}
