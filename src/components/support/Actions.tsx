import { useState } from 'react'
import { BadgePercent, Check, Copy, Image as ImageIcon, Link2, Loader2, MapPin, MessageSquareWarning, Pencil, Plus, Receipt, Search, Star, Truck, X } from 'lucide-react'
import { reviewAsk, reviewLinkFor } from '@/lib/reviewLinks'
import { toast } from 'sonner'
import { supportApi } from '@/lib/supportApi'
import type { Address, CodeLookup, CustomerOrder, Mockup, ThreadDetail } from '@/types/support'

/**
 * The Actions list, in the dashboard's own style: purple text links with an
 * icon, one per line, under a small grey heading.
 *
 * Per order: drop Artelo's tracking link (Artelo fulfills through Shopify,
 * so its tracking is on the Shopify fulfillment it creates) or the approval
 * link into the reply; change the ship-to (Shopify and our rows, then the
 * address copied for Artelo, which has no API to edit an order); fix the
 * name or year before production; a note for fulfillment; refund in Shopify. For the customer: a 15% code, Slack
 * Matt. Last and small: check a code they pasted. Every one is a person's
 * press, an event in the thread and an audit line.
 */
const linkCls = 'self-start inline-flex items-center gap-1.5 text-xs font-medium text-[#4600D6] hover:underline underline-offset-2 disabled:opacity-50 disabled:no-underline text-left'

function ActionLink({ icon: Icon, onClick, href, busy, title, children }: { icon: typeof Truck; onClick?: () => void; href?: string; busy?: boolean; title?: string; children: React.ReactNode }) {
  const icon = busy ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Icon className="w-3.5 h-3.5 shrink-0" />
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" className={linkCls} title={title}>{icon}{children}</a>
  return <button onClick={onClick} disabled={busy} className={linkCls} title={title}>{icon}{children}</button>
}

const heading = 'text-[10px] font-semibold text-off-black/40 uppercase tracking-wider mb-1.5'
const field = 'w-full px-2 py-1 text-xs bg-white border border-border-gray rounded focus:outline-none focus:ring-1 focus:ring-off-black/20'

/** The ship-to form, prefilled from Shopify (or Artelo's copy), then the hand-off to Artelo. */
function AddressForm({ o, thread, onDone, onCancel }: { o: CustomerOrder; thread: ThreadDetail; onDone: () => void; onCancel: () => void }) {
  const start: Address = o.shipTo || o.arteloAddress || { name: thread.customerName || '', address1: '', address2: '', city: '', province: '', zip: '', country: 'US', phone: '' }
  const [a, setA] = useState<Address>(start)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<{ pasted: string; arteloUrl: string | null } | null>(null)
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) => setA({ ...a, [k]: e.target.value })
  const save = async () => {
    setBusy(true)
    try {
      const out = await supportApi.action<{ pasted: string; arteloUrl: string | null }>('shippingAddress', { id: thread.id, shopifyOrderId: o.shopifyOrderId, address: a })
      try { await navigator.clipboard.writeText(out.pasted) } catch { /* the button below copies too */ }
      setSaved(out)
      toast.success(`#${o.number} updated in Shopify. Address copied for Artelo.`)
      onDone()
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  if (saved) {
    return (
      <div className="w-full bg-subtle-gray border border-border-gray rounded-md p-2.5 space-y-1.5 text-xs">
        <div className="inline-flex items-center gap-1.5 text-emerald-700 font-medium"><Check className="w-3.5 h-3.5" />Changed in Shopify. Now paste it into Artelo:</div>
        <pre className="whitespace-pre-wrap font-sans text-off-black/75 bg-white border border-border-gray rounded p-2">{saved.pasted}</pre>
        <div className="flex items-center gap-3">
          <button onClick={() => { navigator.clipboard.writeText(saved.pasted).then(() => toast.success('Copied')).catch(() => {}) }} className={linkCls}><Copy className="w-3.5 h-3.5" />Copy again</button>
          {saved.arteloUrl && <a href={saved.arteloUrl} target="_blank" rel="noopener noreferrer" className={linkCls}><img src="/artelo-icon.png" alt="" className="w-3.5 h-3.5 rounded-[3px]" />Open in Artelo</a>}
          <button onClick={onCancel} className="ml-auto text-off-black/45 hover:text-off-black">Done</button>
        </div>
      </div>
    )
  }
  return (
    <div className="w-full bg-subtle-gray border border-border-gray rounded-md p-2.5 space-y-1.5">
      <input className={field} value={a.name} onChange={set('name')} placeholder="Name" />
      <input className={field} value={a.address1} onChange={set('address1')} placeholder="Street" />
      <input className={field} value={a.address2} onChange={set('address2')} placeholder="Apt, suite (optional)" />
      <div className="grid grid-cols-[1fr_56px_72px] gap-1.5">
        <input className={field} value={a.city} onChange={set('city')} placeholder="City" />
        <input className={field} value={a.province} onChange={set('province')} placeholder="State" />
        <input className={field} value={a.zip} onChange={set('zip')} placeholder="ZIP" />
      </div>
      <div className="grid grid-cols-[56px_1fr] gap-1.5">
        <input className={field} value={a.country} onChange={set('country')} placeholder="US" />
        <input className={field} value={a.phone} onChange={set('phone')} placeholder="Phone (optional)" />
      </div>
      <div className="flex items-center gap-2 pt-0.5">
        <span className="text-[11px] text-off-black/45 flex-1">Saves to Shopify; you paste it into Artelo.</span>
        <button onClick={onCancel} className="px-2 py-1 text-xs text-off-black/50 hover:text-off-black">Cancel</button>
        <button onClick={save} disabled={busy} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-dark-fill text-white hover:bg-off-black/85 disabled:opacity-50">{busy && <Loader2 className="w-3 h-3 animate-spin" />}Save</button>
      </div>
    </div>
  )
}

function OrderActions({ o, thread, multiple, onInsert, onAttach, onChanged }: { o: CustomerOrder; thread: ThreadDetail; multiple: boolean; onInsert: (text: string) => void; onAttach: (m: Mockup) => void; onChanged: () => void }) {
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [editingAddress, setEditingAddress] = useState(false)
  const run = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key)
    try { const msg = await fn(); if (msg) toast.success(msg); onChanged() }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(null) }
  }
  // Artelo's fulfillment first, the newest one: a reprint ships with fresh tracking.
  const tracking = [...o.tracking].reverse().find(t => t.fromArtelo && t.url) || [...o.tracking].reverse().find(t => t.url) || o.tracking[o.tracking.length - 1] || null
  const approval = o.items.find(it => it.approvalUrl)?.approvalUrl || null
  const editable = o.items.filter(it => it.status !== 'completed' && it.designStatus !== 'sent_to_production')
  const shipped = o.fulfillmentStatus === 'FULFILLED' || o.tracking.length > 0
  const first = (thread.customerName || '').split(/\s+/)[0] || ''
  return (
    <div>
      {multiple && <div className={heading}>#{o.number}{o.items[0] ? ` · ${o.items[0].race}` : ''}</div>}
      <div className="flex flex-col items-stretch gap-1.5">
        {tracking
          ? <ActionLink icon={Truck} title={`${tracking.company || 'Carrier'} ${tracking.number || ''}`} onClick={() => onInsert(tracking.url ? `Here's your tracking link: ${tracking.url}` : `Your ${tracking.company || ''} tracking number is ${tracking.number}.`.replace('  ', ' '))}>Insert {tracking.fromArtelo ? 'Artelo ' : ''}tracking link</ActionLink>
          : <span className="self-start inline-flex items-center gap-1.5 text-xs text-off-black/40"><Truck className="w-3.5 h-3.5" />No tracking from Artelo yet</span>}
        {o.mockups.length > 0 && (o.mockups.length === 1
          ? <ActionLink icon={ImageIcon} title={o.mockups[0].label} onClick={() => { onAttach(o.mockups[0]); toast.success('Mockup attached to the reply') }}>Attach mockup</ActionLink>
          : <ActionLink icon={ImageIcon} onClick={() => setPicking(v => !v)}>Attach mockup <span className="text-off-black/40 font-normal">({o.mockups.length})</span></ActionLink>)}
        {picking && o.mockups.length > 1 && (
          <div className="flex flex-wrap gap-1.5 pl-5">
            {o.mockups.map(m => (
              <button key={m.ref} onClick={() => { onAttach(m); toast.success(`${m.label} attached`) }} className="w-16 text-left group" title={`Attach ${m.label}`}>
                <span className="block w-16 h-16 rounded border border-border-gray bg-white overflow-hidden group-hover:border-[#4600D6]">
                  {m.thumbUrl ? <img src={m.thumbUrl} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5 m-auto mt-5 text-off-black/25" />}
                </span>
                <span className="block text-[10px] text-off-black/55 leading-tight mt-0.5 truncate">{m.label}</span>
              </button>
            ))}
          </div>
        )}
        {approval && <ActionLink icon={Link2} onClick={() => onInsert(`You can view your design options here: ${approval}`)}>Insert approval link</ActionLink>}
        {/* Only once it has shipped: a review is for someone holding the print. */}
        {shipped && (() => {
          const it = o.items[0]
          const review = reviewLinkFor(it?.race || o.lineItems[0]?.title, it?.type)
          const delivered = o.tracking.map(t => t.deliveredAt).filter(Boolean).sort().pop() || null
          const sent = o.tracking[o.tracking.length - 1]?.at
          const when = delivered ? `delivered ${new Date(delivered).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
            : sent ? `shipped ${Math.max(0, Math.floor((Date.now() - new Date(sent).getTime()) / 86400000))}d ago, no delivery scan` : 'shipped'
          const asked = thread.tags.includes('Review requested')
          if (!review) return <span className="self-start inline-flex items-center gap-1.5 text-xs text-off-black/40" title="Add it to src/lib/reviewLinks.ts"><Star className="w-3.5 h-3.5" />No Yotpo link for {it?.race || 'this product'}</span>
          return (
            <span className="self-start inline-flex items-baseline gap-1.5 flex-wrap">
              <ActionLink icon={Star} busy={busy === 'review'} title={`${review.name} review link. Only for a good experience, after they have the print.`} onClick={() => run('review', async () => {
                onInsert(reviewAsk(review.link))
                if (!asked) await supportApi.setTags(thread.id, [...thread.tags, 'Review requested'])
                return asked ? 'Review link added to the reply' : 'Review link added; tagged Review requested'
              })}>{asked ? 'Ask for a review again' : 'Ask for a review'}</ActionLink>
              <span className={`text-[11px] ${delivered ? 'text-emerald-700' : 'text-off-black/40'}`}>{when}</span>
            </span>
          )
        })()}
        {o.shopifyOrderId && !shipped && (editingAddress
          ? <AddressForm o={o} thread={thread} onDone={onChanged} onCancel={() => setEditingAddress(false)} />
          : <ActionLink icon={MapPin} onClick={() => setEditingAddress(true)} title={o.shipToLine || 'No address on file'}>Edit shipping address</ActionLink>)}
        {editable[0] && (
          <ActionLink icon={Pencil} busy={busy === 'fix'} title="Before production only. After that it is a reprint." onClick={() => {
            const it = editable[0]
            const name = window.prompt(`Runner's name on #${o.number}`, it.runner)
            if (name === null) return
            const year = window.prompt('Race year', String(it.year))
            if (year === null) return
            run('fix', async () => { const out = await supportApi.action<{ what: string }>('fixPersonalization', { id: thread.id, orderId: it.orderId, runnerName: name, year: year || undefined }); return `Changed ${out.what}` })
          }}>Fix name or year</ActionLink>
        )}
        {o.items[0] && (
          <ActionLink icon={Plus} busy={busy === 'note'} onClick={() => {
            const text = window.prompt(`Note for fulfillment on #${o.number}`, first ? `${first} asked: ` : '')
            if (!text) return
            run('note', async () => { await supportApi.action('orderNote', { id: thread.id, orderId: o.items[0].orderId, text }); return 'Note left on the order' })
          }}>Note for fulfillment</ActionLink>
        )}
        {o.adminUrl && <ActionLink icon={Receipt} href={`${o.adminUrl}/refund`} title="Full or partial. Over $150 is Matt's call.">Refund in Shopify</ActionLink>}
      </div>
    </div>
  )
}

/** Check a code the customer pasted: one line, the answer under it. */
function CodeCheck() {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [lookup, setLookup] = useState<CodeLookup | null>(null)
  const check = async () => {
    const c = code.trim()
    if (!c) return
    setBusy(true)
    try { setLookup(await supportApi.action<CodeLookup>('lookupCode', { code: c })) }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  const ok = lookup?.found && /^Valid/.test(lookup.verdict)
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs">
        <Search className="w-3.5 h-3.5 text-off-black/35 shrink-0" />
        <input value={code} onChange={e => { setCode(e.target.value); setLookup(null) }} onKeyDown={e => { if (e.key === 'Enter') check() }} placeholder="Check a discount code" className="flex-1 min-w-0 bg-transparent border-b border-dashed border-off-black/20 focus:border-off-black/50 focus:outline-none py-0.5 placeholder:text-off-black/35" />
        {code && <button onClick={check} disabled={busy} className="text-[#4600D6] font-medium hover:underline underline-offset-2">{busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Check'}</button>}
        {lookup && <button onClick={() => { setLookup(null); setCode('') }} className="text-off-black/35 hover:text-off-black"><X className="w-3 h-3" /></button>}
      </div>
      {lookup && (
        <div className={`mt-1 ml-5 text-[11px] ${ok ? 'text-emerald-700' : 'text-red-700'}`}>
          {lookup.verdict}
          {lookup.found && <span className="text-off-black/50"> {lookup.value}{lookup.fromKlaviyo ? ' · Klaviyo' : ''}</span>}
        </div>
      )}
    </div>
  )
}

export default function Actions({ thread, onInsert, onAttach, onChanged }: { thread: ThreadDetail; onInsert: (text: string) => void; onAttach: (m: Mockup) => void; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const first = (thread.customerName || '').trim().split(/\s+/)[0] || ''
  const run = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key)
    try { const msg = await fn(); if (msg) toast.success(msg); onChanged() }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(null) }
  }
  const orders = thread.context.orders
  return (
    <div className="space-y-4">
      {orders.map(o => <OrderActions key={`${o.source}-${o.number}`} o={o} thread={thread} multiple={orders.length > 1} onInsert={onInsert} onAttach={onAttach} onChanged={onChanged} />)}
      <div>
        {orders.length > 1 && <div className={heading}>Customer</div>}
        <div className="flex flex-col items-stretch gap-1.5">
          <ActionLink icon={BadgePercent} busy={busy === 'code'} title="One use, 30 days, named after them" onClick={() => run('code', async () => {
            const out = await supportApi.action<{ code: string; percent: number }>('discount15', { id: thread.id })
            onInsert(`Use code ${out.code} for ${out.percent}% off your next print (good for 30 days).`)
            return `${out.code} created and added to the reply`
          })}>Create 15% code for {first || 'them'}</ActionLink>
          <ActionLink icon={MessageSquareWarning} busy={busy === 'slack'} title="Posts to Slack with a link to this thread, and marks it escalated" onClick={() => {
            const text = window.prompt('What should Matt know? (goes to Slack with a link to this thread)', '')
            if (text === null) return
            run('slack', async () => { await supportApi.action('slackMatt', { id: thread.id, text }); return 'Matt pinged in Slack, thread escalated' })
          }}>Slack Matt</ActionLink>
        </div>
      </div>
      <CodeCheck />
    </div>
  )
}
