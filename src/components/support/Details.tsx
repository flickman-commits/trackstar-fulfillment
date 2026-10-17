import { useEffect, useState } from 'react'
import { ArrowUpRight, Check, ChevronDown, Copy, Loader2, Package, Truck, AlertCircle, Database, Mail, X, Plus, Instagram, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { btnSecondary, chip } from '@/lib/ui'
import { supportApi } from '@/lib/supportApi'
import { ago, day } from '@/lib/supportDates'
import { STATUS_LABEL, STATUS_TONE } from '@/lib/supportStatus'
import { Avatar } from '@/components/AssigneePicker'
import type { CustomerOrder, InstagramStatus, MailboxStatus, Mockup, SenderFilter, Teammate, ThreadDetail } from '@/types/support'
import Actions from './Actions'
import { FilterSender } from './SenderFilter'

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

/** "Oct 7 (10 days ago)", the dashboard's wording. */
function placedAt(iso: string) {
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  const md = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (days <= 0) return `${md} (today)`
  if (days === 1) return `${md} (yesterday)`
  if (days < 14) return `${md} (${days} days ago)`
  if (days < 365) return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (${Math.floor(days / 7)} weeks ago)`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
const pill = 'inline-flex items-center px-2 py-0.5 bg-white border border-border-gray rounded text-xs font-semibold text-off-black'

/** Where the order is, in one chip: shipped, in production, being designed, or waiting. */
function stage(o: CustomerOrder): { label: string; cls: string } | null {
  if (o.financialStatus === 'REFUNDED') return { label: 'Refunded', cls: 'bg-red-50 border-red-200 text-red-700' }
  if (o.fulfillmentStatus === 'FULFILLED' || o.tracking.length) return { label: 'Shipped', cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' }
  const it = o.items[0]
  if (!it) return o.imported ? null : { label: 'Not imported yet', cls: 'bg-white border-border-gray text-off-black/55' }
  if (it.status === 'completed' || it.designStatus === 'sent_to_production') return { label: 'In production', cls: 'bg-blue-50 border-blue-200 text-blue-700' }
  if (it.designStatus && it.designStatus !== 'not_started') return { label: it.designStatus === 'approved_by_customer' ? 'Approved, not yet printed' : 'Being designed', cls: 'bg-purple-50 border-purple-200 text-purple-700' }
  return { label: 'In the queue', cls: 'bg-white border-border-gray text-off-black/60' }
}

/**
 * One order, the way the dashboard's order view shows it: the design's
 * picture, the race as the headline with the year beside it, size and
 * photo, when it was ordered, where it is now, then Open in Shopify and
 * Open in Artelo. Nothing else: totals, line items and properties are a
 * click away in Shopify.
 */
function OrderCard({ o }: { o: CustomerOrder }) {
  const it = o.items[0]
  const age = Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 86400000)
  const ageCls = o.fulfillmentStatus === 'FULFILLED' ? 'bg-white border-border-gray text-off-black/60'
    : age > 5 ? 'bg-red-50 border-red-200 text-red-700 font-medium' : age >= 3 ? 'bg-orange-50 border-orange-200 text-orange-700 font-medium' : 'bg-white border-border-gray text-off-black/60'
  const st = stage(o)
  const tracking = o.tracking.find(t => t.url) || o.tracking[0] || null
  const race = it?.race || o.lineItems[0]?.title || 'Order'
  return (
    <div className="space-y-2">
      <div className="bg-subtle-gray border border-border-gray rounded-md p-3">
        <div className="flex items-start gap-3">
          {it?.heroImageUrl ? (
            <a href={it.heroImageUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 block w-16 h-16 rounded border border-border-gray overflow-hidden bg-white hover:opacity-90" title="View full size">
              <img src={it.heroImageUrl} alt={it.productLabel || race} className="w-full h-full object-cover" />
            </a>
          ) : (
            <div className="flex-shrink-0 w-16 h-16 rounded border border-border-gray bg-white flex items-center justify-center text-off-black/25"><Package className="w-6 h-6" /></div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold text-off-black/40 uppercase tracking-wider">Order #{o.number}</div>
            <div className="flex items-baseline flex-wrap gap-x-1.5 gap-y-1 min-w-0">
              <h3 className="text-[15px] font-bold text-off-black leading-tight">{race}</h3>
              {it?.year ? <span className={pill}>{it.year}</span> : null}
            </div>
            {it?.runner && <div className="text-xs text-off-black/55 truncate mt-0.5">{it.runner}</div>}
            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              {it?.size && <span className={pill}>{it.size}</span>}
              {it?.hasPhoto && <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-semibold bg-[#4600D6]/10 text-[#4600D6] border-[#4600D6]/25">Photo</span>}
              {o.items.length > 1 && <span className={pill}>+{o.items.length - 1} more</span>}
              {!it && o.lineItems[0]?.variant && <span className={pill}>{o.lineItems[0].variant}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 border rounded text-xs ${ageCls}`} title={new Date(o.createdAt).toLocaleString()}>📅 Ordered {placedAt(o.createdAt)}</span>
              {st && <span className={`inline-flex items-center px-2 py-0.5 border rounded text-xs font-medium ${st.cls}`}>{st.label}</span>}
            </div>
            {tracking && (
              <div className="mt-1.5 text-xs inline-flex items-center gap-1.5 text-off-black/70 min-w-0">
                <Truck className="w-3 h-3 shrink-0" />
                {tracking.url ? <a href={tracking.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 truncate">{tracking.company || 'Tracking'} {tracking.number}</a> : <span className="truncate">{tracking.company || 'Tracking'} {tracking.number}</span>}
              </div>
            )}
            {o.discountCodes.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {o.discountCodes.map(c => <span key={c} className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium bg-yellow-50 text-yellow-900/70 border-yellow-200">Discount: {c}</span>)}
              </div>
            )}
          </div>
        </div>
      </div>
      {o.adminUrl && (
        <a href={o.adminUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-border-gray bg-white text-sm font-medium text-off-black hover:border-off-black/30 transition-colors">
          <img src="/shopify-icon.png" alt="" className="w-5 h-5" /> Open in Shopify <ArrowUpRight className="w-4 h-4 ml-auto opacity-40" />
        </a>
      )}
      {o.arteloUrl && (
        <a href={o.arteloUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-border-gray bg-white text-sm font-medium text-off-black hover:border-off-black/30 transition-colors">
          <img src="/artelo-icon.png" alt="" className="w-5 h-5 rounded-[4px]" /> Open in Artelo <ArrowUpRight className="w-4 h-4 ml-auto opacity-40" />
        </a>
      )}
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

/** Where new conversations go, for an admin: one person, on every channel, with a hand-over of what is open now. */
export function RoutingCard({ team, unassignedCount, onChanged }: { team: Teammate[]; unassignedCount: number; onChanged: () => void }) {
  const [value, setValue] = useState<string | null | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  useEffect(() => { supportApi.settings().then(r => setValue(r.defaultAssigneeId)).catch(() => setValue(null)) }, [])
  const who = team.find(u => u.id === value) || null
  const save = async (id: string | null, applyToOpen = false) => {
    setSaving(true)
    try {
      const out = await supportApi.saveSettings(id, applyToOpen)
      setValue(out.defaultAssigneeId)
      const name = team.find(u => u.id === out.defaultAssigneeId)?.firstName
      toast.success(out.defaultAssigneeId ? `New conversations go to ${name}${out.assigned ? `, and ${out.assigned} open ${out.assigned === 1 ? 'one' : 'ones'} handed over` : ''}` : 'New conversations go to nobody')
      onChanged()
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }
  return (
    <Section title="Routing">
      <Attr label="New ones go to">
        <select value={value || ''} disabled={value === undefined || saving} onChange={e => save(e.target.value || null)} className="w-full text-xs bg-white border border-border-gray rounded px-1.5 py-1 focus:outline-none">
          <option value="">Nobody (unassigned)</option>
          {team.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
        </select>
      </Attr>
      {who && unassignedCount > 0 && (
        <button onClick={() => save(who.id, true)} disabled={saving} className={btnSecondary}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Avatar user={who} size={14} />}
          Hand the {unassignedCount} open unassigned to {who.firstName}
        </button>
      )}
      <p className="text-[11px] text-off-black/45">Every new email or DM is assigned to them as it arrives. History imports stay unassigned.</p>
    </Section>
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

/** Copies to the clipboard and says so with a check for a moment. */
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) }
    catch { toast.error('Could not copy') }
  }
  return (
    <button onClick={copy} title={done ? 'Copied' : 'Copy'} className="shrink-0 mt-0.5 text-off-black/35 hover:text-off-black">
      {done ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

export default function Details({ thread, team, tagSuggestions, onOpenThread, onAssign, onPriority, onTags, onInsert, onAttach, onChanged, width, filters, onFiltersChanged }: {
  thread: ThreadDetail | null
  team: Teammate[]
  tagSuggestions: string[]
  onOpenThread: (id: string) => void
  onAssign: (id: string | null) => void
  onPriority: (p: boolean) => void
  onTags: (tags: string[]) => void
  /** Drops a line into the reply box. */
  onInsert: (text: string) => void
  /** Puts a mockup on the reply. */
  onAttach: (m: Mockup) => void
  /** Something changed on the thread; read it again. */
  onChanged: () => void
  /** A width the person dragged to, on wide screens. */
  width?: number
  filters: SenderFilter[]
  onFiltersChanged: () => void
}) {
  return (
    <aside style={width ? { width } : undefined} className="w-full lg:w-[272px] xl:w-[300px] shrink-0 lg:overflow-y-auto border-t lg:border-t-0 lg:border-l border-border-gray min-h-0 bg-white">
      {!thread && <div className="px-4 py-6 text-xs text-off-black/45">Pick a conversation to see the customer, their orders and the actions.</div>}
      {thread && (
        <>
          <Section title="Customer">
            <Attr label="Name">{thread.customer.name || <span className="text-off-black/40">Unknown</span>}</Attr>
            {thread.customer.email && <Attr label="Email"><span className="inline-flex items-start gap-1.5 min-w-0"><a href={`mailto:${thread.customer.email}`} className="text-blue-600 hover:text-blue-700 break-all">{thread.customer.email}</a><CopyButton text={thread.customer.email} /></span></Attr>}
            {thread.channel === 'instagram' && thread.igUsername && <Attr label="Instagram"><a href={`https://instagram.com/${thread.igUsername}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700">@{thread.igUsername}</a></Attr>}
            <Attr label="First seen">{day(thread.customer.firstSeen)}</Attr>
            <Attr label="Conversations">{thread.customer.conversations}</Attr>
            {thread.channel !== 'instagram' && thread.customer.email && (
              <div className="pt-1"><FilterSender email={thread.customer.email} filters={filters} onChanged={onFiltersChanged} /></div>
            )}
            {thread.pastThreads.length > 0 && (
              <div className="pt-2 space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-off-black/40">Other conversations</div>
                {thread.pastThreads.map(p => (
                  <button key={p.id} onClick={() => onOpenThread(p.id)} className="w-full text-left px-2.5 py-1.5 rounded-md border border-border-gray bg-white hover:bg-subtle-gray transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-off-black truncate">{p.subject || '(no subject)'}</span>
                      <span className="text-[11px] text-off-black/45 shrink-0">{ago(p.lastMessageAt)}</span>
                    </div>
                    <div className="mt-0.5"><span className={`${chip} ${STATUS_TONE[p.status]}`}>{p.status === 'waiting' ? 'Waiting' : STATUS_LABEL[p.status]}</span></div>
                  </button>
                ))}
              </div>
            )}
          </Section>
          <Section title="Conversation">
            <Attr label="Status"><span className={`${chip} ${STATUS_TONE[thread.status]}`}>{STATUS_LABEL[thread.status]}</span></Attr>
            <Attr label="Assignee">
              <select value={thread.assignee?.id || ''} onChange={e => onAssign(e.target.value || null)} className="w-full text-xs bg-white border border-border-gray rounded px-1.5 py-1 focus:outline-none">
                <option value="">Unassigned</option>
                {team.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
              </select>
            </Attr>
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
              ? <div className="text-xs text-off-black/50 inline-flex items-center gap-1.5"><Package className="w-3.5 h-3.5" />{thread.customerEmail ? `No orders under ${thread.customerEmail}.` : 'No email to look orders up by. Ask for the order number.'}</div>
              : <div className="space-y-4">{thread.context.orders.map(o => <OrderCard key={`${o.source}-${o.number}`} o={o} />)}</div>}
          </Section>
          <Section title="Actions">
            <Actions thread={thread} onInsert={onInsert} onAttach={onAttach} onChanged={onChanged} />
          </Section>
        </>
      )}
    </aside>
  )
}
