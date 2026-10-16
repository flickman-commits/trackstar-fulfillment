import { useState } from 'react'
import { ChevronDown, ExternalLink, Loader2, Package, Truck, AlertCircle, Database, Mail, X, Plus, Instagram, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { btnSecondary, chip, chipTone, textLink } from '@/lib/ui'
import { supportApi } from '@/lib/supportApi'
import { ago, day } from '@/lib/supportDates'
import { STATUS_LABEL, STATUS_TONE } from '@/lib/supportStatus'
import { Avatar } from '@/components/AssigneePicker'
import type { CustomerOrder, InstagramStatus, MailboxStatus, OrderItem, Teammate, ThreadDetail } from '@/types/support'

/**
 * The details panel, Intercom's right column: collapsible sections for the
 * customer, this conversation's attributes (assignee, priority, tags), the
 * customer's orders with fulfillment and tracking from Shopify and our own
 * rows beside them, their other conversations, and, for an admin, the
 * mailbox itself.
 */
function Section({ title, count, children, open: initial = true }: { title: string; count?: number; children: React.ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial)
  return (
    <div className="border-b border-border-gray">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between px-4 py-2.5 text-left">
        <span className="text-[12px] font-semibold text-off-black">{title}{count !== undefined && count > 0 && <span className="ml-1.5 text-off-black/40 font-normal tabular-nums">{count}</span>}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-off-black/40 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="px-4 pb-3 space-y-2">{children}</div>}
    </div>
  )
}

function Attr({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-xs">
      <span className="w-[86px] shrink-0 text-off-black/45 pt-0.5">{label}</span>
      <span className="min-w-0 flex-1 text-off-black">{children}</span>
    </div>
  )
}

const FULFILLMENT_TONE: Record<string, string> = {
  FULFILLED: chipTone.emerald, UNFULFILLED: chipTone.amber, PARTIALLY_FULFILLED: chipTone.amber, IN_PROGRESS: chipTone.blue, ON_HOLD: chipTone.slate, SCHEDULED: chipTone.slate,
}
const FINANCIAL_TONE: Record<string, string> = { PAID: chipTone.quiet, REFUNDED: chipTone.red, PARTIALLY_REFUNDED: chipTone.rose, PENDING: chipTone.amber, VOIDED: chipTone.red }
const ITEM_STATUS_LABEL: Record<string, string> = { pending: 'Researching', missing_year: 'Needs year', ready: 'Ready', flagged: 'Flagged', completed: 'Sent to production' }
const DESIGN_LABEL: Record<string, string> = {
  not_started: 'Design not started', in_progress: 'Designing', awaiting_review: 'Awaiting review', in_revision: 'In revision',
  approved_by_customer: 'Approved by customer', final_pdf_uploaded: 'Final uploaded', sent_to_production: 'Sent to production',
}
const titleCase = (s: string | null) => (s ? s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) : '')

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
    <div className="rounded-md border border-border-gray bg-white p-3">
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
      {o.items.map(it => <Item key={it.orderId} it={it} />)}
      {o.items.length === 0 && o.lineItems.map((li, i) => (
        <div key={i} className="pt-2 mt-2 border-t border-border-gray/80 text-xs">
          <div className="font-medium text-off-black">{li.title}{li.quantity > 1 ? ` ×${li.quantity}` : ''}</div>
          {li.variant && <div className="text-off-black/60">{li.variant}</div>}
          {Object.keys(li.properties).length > 0 && <button onClick={() => setMore(v => !v)} className="mt-0.5 text-off-black/45 hover:text-off-black/70">{more ? 'Hide' : 'Show'} what they typed</button>}
          {more && <dl className="mt-1 space-y-0.5">{Object.entries(li.properties).map(([k, v]) => <div key={k}><dt className="inline text-off-black/45">{k}: </dt><dd className="inline text-off-black/75">{v}</dd></div>)}</dl>}
        </div>
      ))}
      {o.adminUrl && <a href={o.adminUrl} target="_blank" rel="noopener noreferrer" className={`${textLink} mt-2`}>Open in Shopify <ExternalLink className="w-3 h-3" /></a>}
    </div>
  )
}

/** Tags on the conversation: chips, a + to add, with the playbook's scenarios suggested. */
function Tags({ tags, suggestions, onChange }: { tags: string[]; suggestions: string[]; onChange: (tags: string[]) => void }) {
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const options = suggestions.filter(s => !tags.includes(s) && s.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
  const add = (t: string) => { const v = t.trim(); if (v && !tags.includes(v)) onChange([...tags, v]); setQ(''); setAdding(false) }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map(t => (
        <span key={t} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded bg-off-black/[0.06] text-[11px] text-off-black/75">
          {t}<button onClick={() => onChange(tags.filter(x => x !== t))} className="text-off-black/40 hover:text-off-black"><X className="w-3 h-3" /></button>
        </span>
      ))}
      {adding ? (
        <div className="relative">
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Tag"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(options[0] && !q.trim() ? options[0] : q) } if (e.key === 'Escape') { setAdding(false); setQ('') } }}
            onBlur={() => setTimeout(() => { setAdding(false); setQ('') }, 150)}
            className="w-32 px-2 py-0.5 text-[11px] border border-border-gray rounded focus:outline-none focus:ring-1 focus:ring-off-black/20" />
          {options.length > 0 && (
            <div className="absolute left-0 top-full mt-1 w-48 p-1 rounded-md bg-white border border-border-gray shadow-[0_6px_24px_rgba(0,0,0,0.12)] z-20">
              {options.map(o => <button key={o} onMouseDown={e => { e.preventDefault(); add(o) }} className="w-full text-left px-2 py-1 text-[12px] rounded hover:bg-subtle-gray">{o}</button>)}
            </div>
          )}
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-dashed border-off-black/25 text-[11px] text-off-black/50 hover:text-off-black hover:border-off-black/50"><Plus className="w-3 h-3" />Add</button>
      )}
    </div>
  )
}

/** The mailbox, for an admin: connect it, import its history, see when it last synced. */
export function MailboxCard({ status, isAdmin, onChanged }: { status: MailboxStatus | null; isAdmin: boolean; onChanged: () => void }) {
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [waiting, setWaiting] = useState(false)
  if (!status) return null
  const runBackfill = async () => {
    setImporting(true)
    let quotaHits = 0
    try {
      for (let i = 0; i < 400; i++) {
        try {
          const out = await supportApi.backfill()
          setProgress(out.total)
          setWaiting(false)
          quotaHits = 0
          if (out.done) { toast.success(`History imported: ${out.total} messages`); break }
        } catch (e) {
          // Gmail's per-minute quota: wait it out and carry on, a few times, before giving up.
          if (/rate limiting|quota/i.test((e as Error).message) && quotaHits++ < 6) {
            setWaiting(true)
            await new Promise(r => setTimeout(r, 65_000))
            continue
          }
          throw e
        }
      }
      onChanged()
    } catch (e) { toast.error((e as Error).message) }
    finally { setImporting(false); setWaiting(false) }
  }
  return (
    <Section title="Mailbox" open={!status.connected || !status.backfill.done}>
      <div className="text-xs space-y-1.5">
        <div className="flex items-center gap-2">
          <Mail className="w-3.5 h-3.5 text-off-black/50" />
          {status.connected ? <span className="text-off-black">{status.email}</span> : <span className="text-amber-700">Not connected{status.configured ? '' : ' (OAuth client not set)'}</span>}
        </div>
        {status.connected && <div className="text-off-black/50">Last import {status.lastImportedAt ? ago(status.lastImportedAt) + ' ago' : 'never'} · syncs every 5 minutes</div>}
        {status.connected && !status.backfill.done && isAdmin && (
          <div className="pt-1">
            <button onClick={runBackfill} disabled={importing} className={btnSecondary}>
              {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
              {importing ? (waiting ? `Waiting for Gmail's quota… ${progress ?? status.backfill.count} so far` : `Importing… ${progress ?? status.backfill.count}`) : status.backfill.inProgress ? `Continue history import (${status.backfill.count} so far)` : 'Import mailbox history'}
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
    </Section>
  )
}

/**
 * Instagram, for an admin: connect @trackstar_art (sign in, or paste the
 * long-lived token from the Meta dashboard), pull the recent conversations
 * once, see whether the webhook is set and when a DM last arrived.
 */
export function InstagramCard({ status, isAdmin, onChanged }: { status: InstagramStatus | null; isAdmin: boolean; onChanged: () => void }) {
  const [pasting, setPasting] = useState(false)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  if (!status) return null
  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true)
    try { const msg = await fn(); if (msg) toast.success(msg); onChanged() }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  const saveToken = () => run(async () => { const out = await supportApi.instagramToken(token.trim()); setToken(''); setPasting(false); return `Connected as @${out.username}` })
  const backfill = () => run(async () => { const out = await supportApi.instagramBackfill(); return `Imported ${out.imported} DM${out.imported === 1 ? '' : 's'} from ${out.conversations} conversation${out.conversations === 1 ? '' : 's'}` })
  const disconnect = () => { if (window.confirm(`Disconnect @${status.username}? DMs stop arriving until an admin connects again.`)) run(async () => { await supportApi.instagramDisconnect(); return 'Instagram disconnected' }) }
  return (
    <Section title="Instagram" open={!status.connected}>
      <div className="text-xs space-y-1.5">
        <div className="flex items-center gap-2">
          <Instagram className="w-3.5 h-3.5 text-pink-600" />
          {status.connected ? <span className="text-off-black">@{status.username}</span> : <span className="text-amber-700">Not connected{status.configured ? '' : ' (Meta app not set)'}</span>}
        </div>
        {status.connected && (
          <div className="text-off-black/50">
            Last DM {status.lastImportedAt ? ago(status.lastImportedAt) + ' ago' : 'none yet'} · arrives by webhook{status.webhookConfigured ? '' : ' (verify token not set)'}
            {status.humanAgent ? ' · 7-day replies' : ' · 24-hour replies'}
          </div>
        )}
        {status.connected && status.tokenExpiresAt && <div className="text-off-black/50">Token renews itself; good until {day(status.tokenExpiresAt)}</div>}
        {isAdmin && status.configured && (
          <div className="pt-1 flex flex-wrap items-center gap-1.5">
            {!status.connected && <a href={supportApi.instagramConnectUrl} className={btnSecondary}><Instagram className="w-3.5 h-3.5" />Connect @{status.expectedHandle}</a>}
            {!status.connected && <button onClick={() => setPasting(v => !v)} className={btnSecondary}><KeyRound className="w-3.5 h-3.5" />Paste a token</button>}
            {status.connected && <button onClick={backfill} disabled={busy} className={btnSecondary}>{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}Import recent DMs</button>}
            {status.connected && <button onClick={disconnect} disabled={busy} className={btnSecondary}>Disconnect</button>}
          </div>
        )}
        {isAdmin && status.configured && !status.connected && pasting && (
          <div className="pt-1 space-y-1">
            <input value={token} onChange={e => setToken(e.target.value)} placeholder="Long-lived access token from Meta's dashboard" className="w-full px-2 py-1 text-[11px] border border-border-gray rounded focus:outline-none focus:ring-1 focus:ring-off-black/20" />
            <div className="flex items-center gap-1.5">
              <button onClick={saveToken} disabled={busy || !token.trim()} className={btnSecondary}>{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}Save token</button>
              <span className="text-off-black/45">Instagram &gt; API setup with Instagram login &gt; Generate token, signed in as @{status.expectedHandle}.</span>
            </div>
          </div>
        )}
        {!status.connected && isAdmin && status.configured && !pasting && <p className="text-off-black/45">Sign in to Instagram as the Trackstar account. Any other account is refused.</p>}
        {!status.connected && isAdmin && !status.configured && <p className="text-off-black/45">Set INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET from the Meta app first (see .env.example).</p>}
        {!status.connected && !isAdmin && <div className="text-off-black/50">Ask an admin to connect it.</div>}
      </div>
    </Section>
  )
}

export default function Details({ thread, team, tagSuggestions, onOpenThread, onAssign, onPriority, onTags, status, instagram, isAdmin, onMailboxChanged }: {
  thread: ThreadDetail | null
  team: Teammate[]
  tagSuggestions: string[]
  onOpenThread: (id: string) => void
  onAssign: (id: string | null) => void
  onPriority: (p: boolean) => void
  onTags: (tags: string[]) => void
  status: MailboxStatus | null
  instagram: InstagramStatus | null
  isAdmin: boolean
  onMailboxChanged: () => void
}) {
  const ig = thread?.channel === 'instagram'
  return (
    <aside className="w-full lg:w-[300px] xl:w-[330px] shrink-0 lg:overflow-y-auto border-t lg:border-t-0 lg:border-l border-border-gray min-h-0 bg-white">
      {thread && (
        <>
          <Section title="Customer">
            <Attr label="Name">{thread.customer.name || <span className="text-off-black/40">Unknown</span>}</Attr>
            {ig && (
              <Attr label="Instagram">
                {thread.customer.instagram
                  ? <a href={`https://instagram.com/${thread.customer.instagram}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 break-all inline-flex items-center gap-1">@{thread.customer.instagram}<ExternalLink className="w-3 h-3" /></a>
                  : <span className="text-off-black/40">Handle not shared by Meta</span>}
              </Attr>
            )}
            {thread.customer.email
              ? <Attr label="Email"><a href={`mailto:${thread.customer.email}`} className="text-blue-600 hover:text-blue-700 break-all">{thread.customer.email}</a></Attr>
              : ig ? <Attr label="Email"><span className="text-off-black/40">None. Ask for the email on their order.</span></Attr> : null}
            <Attr label="First seen">{day(thread.customer.firstSeen)}</Attr>
            <Attr label="Conversations">{thread.customer.conversations}</Attr>
          </Section>
          <Section title="Conversation">
            <Attr label="Status"><span className={`${chip} ${STATUS_TONE[thread.status]}`}>{STATUS_LABEL[thread.status]}</span></Attr>
            <Attr label="Assignee">
              <select value={thread.assignee?.id || ''} onChange={e => onAssign(e.target.value || null)} className="w-full text-xs bg-white border border-border-gray rounded px-1.5 py-1 focus:outline-none">
                <option value="">Unassigned</option>
                {team.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
              </select>
            </Attr>
            {thread.assignee && <Attr label=""><span className="inline-flex items-center gap-1.5 text-off-black/60"><Avatar user={thread.assignee} size={16} />{thread.assignee.firstName} has it</span></Attr>}
            <Attr label="Priority">
              <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={thread.priority} onChange={e => onPriority(e.target.checked)} className="accent-amber-500" />{thread.priority ? 'Priority' : 'Normal'}</label>
            </Attr>
            <Attr label="Tags"><Tags tags={thread.tags} suggestions={tagSuggestions} onChange={onTags} /></Attr>
            <Attr label="Started">{day(thread.createdAt)}</Attr>
            {thread.lastInboundAt && <Attr label="Last from them">{ago(thread.lastInboundAt)} ago</Attr>}
            {thread.lastOutboundAt && <Attr label="Last from us">{ago(thread.lastOutboundAt)} ago</Attr>}
          </Section>
          <Section title="Orders" count={thread.context.orders.length}>
            {thread.context.shopifyError && <div className="text-xs text-amber-700 inline-flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />Shopify did not answer; showing what we have on file.</div>}
            {thread.context.orders.length === 0
              ? <div className="text-xs text-off-black/50 inline-flex items-start gap-1.5"><Package className="w-3.5 h-3.5 shrink-0 mt-0.5" />{ig ? 'A DM comes without an email, so no orders are matched. Ask for their order number or the email they ordered with.' : `No orders under ${thread.customerEmail || 'this address'}.`}</div>
              : thread.context.orders.map(o => <OrderCard key={`${o.source}-${o.number}`} o={o} />)}
          </Section>
          {thread.pastThreads.length > 0 && (
            <Section title="Other conversations" count={thread.pastThreads.length}>
              {thread.pastThreads.map(p => (
                <button key={p.id} onClick={() => onOpenThread(p.id)} className="w-full text-left px-3 py-2 rounded-md border border-border-gray bg-white hover:bg-subtle-gray transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-off-black truncate">{p.subject || '(no subject)'}</span>
                    <span className="text-[11px] text-off-black/45 shrink-0">{ago(p.lastMessageAt)}</span>
                  </div>
                  <div className="mt-1"><span className={`${chip} ${STATUS_TONE[p.status]}`}>{p.status === 'waiting' ? 'Waiting' : STATUS_LABEL[p.status]}</span></div>
                </button>
              ))}
            </Section>
          )}
        </>
      )}
      {(isAdmin || !status?.connected) && <MailboxCard status={status} isAdmin={isAdmin} onChanged={onMailboxChanged} />}
      {(isAdmin || !instagram?.connected) && <InstagramCard status={instagram} isAdmin={isAdmin} onChanged={onMailboxChanged} />}
    </aside>
  )
}
