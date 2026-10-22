import { useCallback, useEffect, useState } from 'react'
import { Plus, Loader2, X, Trash2, Copy, ExternalLink, Send, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import PrintPicker, { type PrintOption } from '@/components/PrintPicker'
import { btnPrimary, btnSecondary, btnGhost, inputBase, fieldLabel } from '@/lib/ui'

/**
 * A bulk deal (server/domain/bulk/deals.js): one organization's order across
 * any races and events, with what we agreed (standard or co-branded prints,
 * the discount, where it ships) and its Shopify invoice. Each line becomes a
 * bulk run, which keeps its own runner list, research and Artelo sheet.
 */

const API_BASE = import.meta.env.VITE_API_URL || ''

type Address = { company: string; name: string; address1: string; address2: string; city: string; province: string; zip: string; country: string }
const blankAddress = (): Address => ({ company: '', name: '', address1: '', address2: '', city: '', province: '', zip: '', country: 'US' })
type Line = { raceName: string; raceYear: string; eventType: string; quantity: string; productSize: string; frameType: string }
/** Race, year, event, quantity, size, frame, remove: the columns of a line, header and rows alike. */
const LINE_GRID = 'grid grid-cols-[minmax(0,1fr)_76px_150px_72px_96px_190px_32px] gap-2'
type CatalogPrint = PrintOption & { race: string }

const blankLine = (prev?: Line): Line => ({ raceName: prev?.raceName || '', raceYear: prev?.raceYear || String(new Date().getFullYear()), eventType: 'Marathon', quantity: '', productSize: prev?.productSize || '8x10', frameType: prev?.frameType || 'Unframed' })

export type DealRun = { id: string; number: string; raceName: string; raceYear: number; eventType: string | null; quantity: number; productSize: string; frameType: string; paidAt: string | null; status: string; _count?: { runners: number } }
export type Deal = {
  id: string; number: string; partnerName: string; contactName: string | null; contactEmail: string | null; contactPhone: string | null
  billingAddress: Address | null; printKind: 'standard' | 'cobranded'; discountKind: 'percent' | 'amount' | null; discountPercent: number | null; discountCents: number | null
  discountNote: string | null; shipping: 'runner' | 'organization'; shipToAddress: Address | null
  shopifyDraftId: string | null; shopifyDraftName: string | null; invoiceUrl: string | null; invoiceSentAt: string | null
  shopifyOrderName: string | null; paidAt: string | null; notes: string | null; runs: DealRun[]
}
type Quote = { lines: { number: string; raceName: string; raceYear: number; eventType: string; quantity: number; productSize: string; frameType: string; unitCents?: number; subtotalCents?: number | null; missing?: string }[]; subtotalCents: number; discountCents: number; totalCents: number; missing: string[] }

const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

async function dealApi<T>(body: Record<string, unknown>): Promise<T> {
  const res = await apiFetch(`${API_BASE}/api/bulk/deals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data as T
}

function AddressFields({ value, onChange, withCompany = false }: { value: Address; onChange: (a: Address) => void; withCompany?: boolean }) {
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value })
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {withCompany && <input className={`${inputBase} col-span-6`} value={value.company} onChange={set('company')} placeholder="Organization (on the invoice)" />}
      <input className={`${inputBase} col-span-6`} value={value.address1} onChange={set('address1')} placeholder="Street" />
      <input className={`${inputBase} col-span-6`} value={value.address2} onChange={set('address2')} placeholder="Suite, floor (optional)" />
      <input className={`${inputBase} col-span-3`} value={value.city} onChange={set('city')} placeholder="City" />
      <input className={`${inputBase} col-span-1`} value={value.province} onChange={set('province')} placeholder="ST" />
      <input className={`${inputBase} col-span-2`} value={value.zip} onChange={set('zip')} placeholder="ZIP" />
    </div>
  )
}

/** New bulk order: who, what we agreed, and one line per race and event. */
export function DealModal({ onClose, onCreated }: { onClose: () => void; onCreated: (deal: Deal) => void }) {
  // The discount is money: admins set it (api/bulk/deals.js ignores it from anyone else).
  const { isAdmin } = useAuth()
  const [opts, setOpts] = useState<{ events: string[]; sizes: string[]; frames: string[] }>({ events: ['Marathon', 'Half Marathon', '10 Miler', '10K', '8K', '5K'], sizes: ['8x10', '12x18', '16x24'], frames: ['Unframed', 'Natural Premium Oak', 'Black Premium Oak'] })
  const [f, setF] = useState({ partnerName: '', contactName: '', contactEmail: '', contactPhone: '', printKind: 'standard', discountKind: '', discountPercent: '', discountDollars: '', discountNote: '', shipping: 'runner', notes: '' })
  const [billing, setBilling] = useState<Address>(blankAddress())
  const [shipTo, setShipTo] = useState<Address>(blankAddress())
  const [lines, setLines] = useState<Line[]>([blankLine()])
  const [busy, setBusy] = useState(false)
  useEffect(() => { apiFetch(`${API_BASE}/api/bulk/deals?options=1`).then(r => r.json()).then(setOpts).catch(() => {}) }, [])
  const [catalog, setCatalog] = useState<CatalogPrint[] | null>(null)
  useEffect(() => { apiFetch(`${API_BASE}/api/bulk/deals?catalog=1`).then(r => r.json()).then(d => setCatalog(d.products || [])).catch(() => setCatalog([])) }, [])
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF(v => ({ ...v, [k]: e.target.value }))
  const setLine = (i: number, k: keyof Line, v: string) => setLines(ls => ls.map((l, j) => j === i ? { ...l, [k]: v } : l))
  const units = lines.reduce((n, l) => n + (parseInt(l.quantity, 10) || 0), 0)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (lines.some(l => !l.raceName)) { toast.error('Choose the race on every line'); return }
    setBusy(true)
    try {
      const out = await dealApi<{ deal: Deal }>({
        action: 'create', ...f,
        discountKind: f.discountKind || null,
        billingAddress: { ...billing, company: billing.company || f.partnerName, name: f.contactName },
        shipToAddress: f.shipping === 'organization' ? { ...shipTo, company: f.partnerName, name: f.contactName } : null,
        lines,
      })
      toast.success(`${out.deal.number} created with ${out.deal.runs.length} line${out.deal.runs.length === 1 ? '' : 's'}`)
      onCreated(out.deal)
    } catch (err) { toast.error((err as Error).message) } finally { setBusy(false) }
  }

  const label = (t: string) => <span className={fieldLabel}>{t}</span>
  return (
    <div className="fixed inset-0 z-50 bg-off-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()} className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-full overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between"><h3 className="text-base font-semibold">New bulk order</h3><button type="button" onClick={onClose} className={btnGhost}><X className="w-4 h-4" /></button></div>

        {/* Who */}
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 block">{label('Organization')}<input required value={f.partnerName} onChange={set('partnerName')} placeholder="American Heart Association, Philadelphia" className={`${inputBase} w-full`} /></label>
          <label className="block">{label('Contact')}<input value={f.contactName} onChange={set('contactName')} placeholder="Miles McCaskey" className={`${inputBase} w-full`} /></label>
          <label className="block">{label('Contact email (invoice goes here)')}<input type="email" value={f.contactEmail} onChange={set('contactEmail')} className={`${inputBase} w-full`} /></label>
          <div className="col-span-2">{label('Billing address')}<AddressFields value={billing} onChange={setBilling} /></div>
        </div>

        {/* What */}
        <div>
          {label('Prints')}
          <div className="grid grid-cols-2 gap-2">
            {(['standard', 'cobranded'] as const).map(k => (
              <label key={k} className={`flex items-start gap-2 rounded-md border px-3 py-2 cursor-pointer ${f.printKind === k ? 'border-[#4600D6] bg-[#4600D6]/[0.04]' : 'border-border-gray'}`}>
                <input type="radio" name="printKind" checked={f.printKind === k} onChange={() => setF(v => ({ ...v, printKind: k }))} className="mt-1 accent-[#4600D6]" />
                <span className="text-sm"><span className="font-semibold">{k === 'standard' ? 'Standard' : 'Co-branded'}</span><span className="block text-xs text-off-black/55">{k === 'standard' ? 'Our race design, rendered automatically' : 'Their logo or design, made by the designer'}</span></span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">{label(`Races and events · ${units} print${units === 1 ? '' : 's'}`)}</div>
          <div className="space-y-1.5">
            <div className={`${LINE_GRID} text-[11px] font-semibold text-off-black/45 uppercase tracking-wider`}>
              <span>Race</span><span>Year</span><span>Event</span><span>Qty</span><span>Size</span><span>Frame</span><span />
            </div>
            {lines.map((l, i) => (
              <div key={i} className={`${LINE_GRID} items-center`}>
                <PrintPicker<CatalogPrint> value={catalog?.find(c => c.race === l.raceName)?.title || null} options={catalog} placeholder={l.raceName || 'Choose the race'}
                  onChange={c => setLine(i, 'raceName', c.race)} />
                <input required value={l.raceYear} onChange={e => setLine(i, 'raceYear', e.target.value.replace(/\D/g, '').slice(0, 4))} className={inputBase} aria-label="Year" />
                <select value={l.eventType} onChange={e => setLine(i, 'eventType', e.target.value)} className={inputBase} aria-label="Event">{opts.events.map(o => <option key={o}>{o}</option>)}</select>
                <input required value={l.quantity} onChange={e => setLine(i, 'quantity', e.target.value.replace(/\D/g, ''))} placeholder="Qty" className={inputBase} aria-label="Quantity" />
                <select value={l.productSize} onChange={e => setLine(i, 'productSize', e.target.value)} className={inputBase} aria-label="Size">{opts.sizes.map(o => <option key={o}>{o}</option>)}</select>
                <select value={l.frameType} onChange={e => setLine(i, 'frameType', e.target.value)} className={inputBase} aria-label="Frame">{opts.frames.map(o => <option key={o}>{o}</option>)}</select>
                <button type="button" onClick={() => setLines(ls => ls.length === 1 ? ls : ls.filter((_, j) => j !== i))} disabled={lines.length === 1} className={`${btnGhost} disabled:opacity-30`} title="Remove line"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setLines(ls => [...ls, blankLine(ls[ls.length - 1])])} className={`${btnGhost} mt-1.5`}><Plus className="w-3.5 h-3.5" /> Add an event or race</button>
        </div>

        {/* The deal */}
        {isAdmin && <div className="grid grid-cols-2 gap-2">
          <label className="block">{label('Discount')}
            <select value={f.discountKind} onChange={set('discountKind')} className={`${inputBase} w-full`}>
              <option value="">None</option><option value="percent">Percent off</option><option value="amount">Dollars off the order</option>
            </select>
          </label>
          {f.discountKind === 'percent' && <label className="block">{label('Percent')}<input value={f.discountPercent} onChange={e => setF(v => ({ ...v, discountPercent: e.target.value.replace(/\D/g, '').slice(0, 3) }))} placeholder="15" className={`${inputBase} w-full`} /></label>}
          {f.discountKind === 'amount' && <label className="block">{label('Dollars off')}<input value={f.discountDollars} onChange={e => setF(v => ({ ...v, discountDollars: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="100" className={`${inputBase} w-full`} /></label>}
          {f.discountKind && <label className="col-span-2 block">{label('Discount name on the invoice')}<input value={f.discountNote} onChange={set('discountNote')} placeholder="Nonprofit rate" className={`${inputBase} w-full`} /></label>}
        </div>}

        <div>
          {label('Shipping')}
          <div className="grid grid-cols-2 gap-2">
            {(['runner', 'organization'] as const).map(k => (
              <label key={k} className={`flex items-start gap-2 rounded-md border px-3 py-2 cursor-pointer ${f.shipping === k ? 'border-[#4600D6] bg-[#4600D6]/[0.04]' : 'border-border-gray'}`}>
                <input type="radio" name="shipping" checked={f.shipping === k} onChange={() => setF(v => ({ ...v, shipping: k }))} className="mt-1 accent-[#4600D6]" />
                <span className="text-sm"><span className="font-semibold">{k === 'runner' ? 'To each runner' : 'All to the organization'}</span><span className="block text-xs text-off-black/55">{k === 'runner' ? 'Their list needs names and addresses' : 'Their list needs names only'}</span></span>
              </label>
            ))}
          </div>
          {f.shipping === 'organization' && (
            <div className="mt-2">
              <div className="flex items-center justify-between">{label('Ship everything to')}<button type="button" onClick={() => setShipTo({ ...billing })} className="text-[11px] text-[#4600D6] hover:underline">Same as billing</button></div>
              <AddressFields value={shipTo} onChange={setShipTo} />
            </div>
          )}
        </div>

        <label className="block">{label('Notes (internal)')}<textarea value={f.notes} onChange={set('notes')} rows={2} placeholder="Other markets interested for next year" className={`${inputBase} w-full`} /></label>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
          <button type="submit" disabled={busy} className={btnPrimary}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create bulk order'}</button>
        </div>
      </form>
    </div>
  )
}

/** The deal a run belongs to: the agreed terms, its lines, and the Shopify invoice. */
export function DealCard({ dealId, currentRunId, onOpenRun }: { dealId: string; currentRunId: string; onOpenRun: (runId: string) => void }) {
  const { isAdmin } = useAuth()
  const [deal, setDeal] = useState<Deal | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [d, q] = await Promise.all([
        apiFetch(`${API_BASE}/api/bulk/deals?id=${encodeURIComponent(dealId)}`).then(r => r.json()),
        // Prices are admins' only.
        isAdmin ? apiFetch(`${API_BASE}/api/bulk/deals?id=${encodeURIComponent(dealId)}&quote=1`).then(r => r.ok ? r.json() : null).catch(() => null) : null,
      ])
      setDeal(d.deal || null); setQuote(q)
    } catch { toast.error('Could not load the deal') }
  }, [dealId, isAdmin])
  useEffect(() => { load() }, [load])

  const buildInvoice = async () => {
    setBusy('invoice')
    try {
      const out = await dealApi<{ draftName: string; invoiceUrl: string; deal: Deal; quote: Quote }>({ action: 'invoice', id: dealId })
      setDeal(out.deal); setQuote(out.quote)
      toast.success(`Shopify invoice ${out.draftName} is ready`)
    } catch (err) { toast.error((err as Error).message) } finally { setBusy(null) }
  }
  const send = async () => {
    if (!deal?.contactEmail) { toast.error('Add the contact email first'); return }
    if (!window.confirm(`Shopify will email the invoice to ${deal.contactEmail}. Send it?`)) return
    setBusy('send')
    try {
      const out = await dealApi<{ sentTo: string; deal: Deal }>({ action: 'send-invoice', id: dealId })
      setDeal(out.deal)
      toast.success(`Invoice sent to ${out.sentTo}`)
    } catch (err) { toast.error((err as Error).message) } finally { setBusy(null) }
  }

  if (!deal) return <div className="bg-white border border-border-gray rounded-lg shadow-sm p-4 text-xs text-off-black/45 inline-flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Loading the deal…</div>
  const discount = deal.discountKind === 'percent' ? `${deal.discountPercent}% off` : deal.discountKind === 'amount' ? `${money(deal.discountCents || 0)} off` : 'No discount'

  return (
    <div className="bg-white border border-border-gray rounded-lg shadow-sm p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold text-off-black/50 uppercase tracking-wider">Bulk deal {deal.number}</div>
          <div className="text-lg font-bold text-off-black leading-tight">{deal.partnerName}</div>
          <div className="text-xs text-off-black/60 mt-0.5">
            {[deal.contactName, deal.contactEmail].filter(Boolean).join(' · ') || 'No contact yet'}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="inline-flex items-center px-2 py-1 rounded border border-border-gray font-semibold">{deal.printKind === 'cobranded' ? 'Co-branded' : 'Standard prints'}</span>
          {isAdmin && <span className="inline-flex items-center px-2 py-1 rounded border border-border-gray font-semibold">{discount}{deal.discountNote ? ` · ${deal.discountNote}` : ''}</span>}
          <span className="inline-flex items-center px-2 py-1 rounded border border-border-gray font-semibold">{deal.shipping === 'organization' ? 'Ships to them' : 'Ships to each runner'}</span>
        </div>
      </div>

      {/* The lines: each is a run with its own list; open one to work it. */}
      <table className="w-full text-sm">
        <thead className="text-[11px] uppercase tracking-wider text-off-black/45"><tr><th className="text-left font-semibold py-1">Line</th><th className="text-left font-semibold">Print</th><th className="text-right font-semibold">Names</th>{isAdmin && <th className="text-right font-semibold">Price</th>}</tr></thead>
        <tbody>
          {deal.runs.map(r => {
            const q = quote?.lines.find(l => l.number === r.number)
            return (
              <tr key={r.id} className={`border-t border-border-gray/70 ${r.id === currentRunId ? 'bg-[#4600D6]/[0.04]' : ''}`}>
                <td className="py-1.5">
                  <button onClick={() => onOpenRun(r.id)} className="text-left hover:underline font-medium" disabled={r.id === currentRunId}>{r.raceName} {r.raceYear} · {r.eventType || 'Marathon'}</button>
                  <span className="ml-1.5 font-mono text-[11px] text-off-black/40">{r.number}</span>
                </td>
                <td className="text-xs text-off-black/65">{r.quantity} × {r.productSize} {r.frameType === 'Unframed' ? 'unframed' : r.frameType.replace(' Premium', '')}</td>
                <td className="text-right text-xs text-off-black/65">{r._count?.runners ?? 0} of {r.quantity}</td>
                {isAdmin && <td className="text-right text-xs">{q?.missing ? <span className="text-red-600" title={q.missing}>No price</span> : q?.subtotalCents != null ? money(q.subtotalCents) : '…'}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>

      {quote && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-gray pt-3">
          <div className="text-sm">
            <span className="text-off-black/55">Subtotal {money(quote.subtotalCents)}</span>
            {quote.discountCents > 0 && <span className="text-off-black/55"> · Discount −{money(quote.discountCents)}</span>}
            <span className="ml-2 font-bold">Total {money(quote.totalCents)}</span>
            <span className="text-off-black/45 text-xs"> · free shipping, prices from Shopify</span>
          </div>
          {deal.paidAt ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-semibold bg-green-50 text-green-700 border-green-200">Paid{deal.shopifyOrderName ? ` · ${deal.shopifyOrderName}` : ''}</span>
          ) : isAdmin ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <button onClick={buildInvoice} disabled={busy !== null || quote.missing.length > 0} className={deal.shopifyDraftId ? btnSecondary : btnPrimary} title={quote.missing.join('; ') || undefined}>
                {busy === 'invoice' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Receipt className="w-3.5 h-3.5" />}{deal.shopifyDraftId ? `Update invoice ${deal.shopifyDraftName || ''}` : 'Build Shopify invoice'}
              </button>
              {deal.invoiceUrl && (
                <>
                  <button onClick={() => navigator.clipboard.writeText(deal.invoiceUrl!).then(() => toast.success('Invoice link copied'))} className={btnSecondary}><Copy className="w-3.5 h-3.5" /> Copy link</button>
                  <a href={deal.invoiceUrl} target="_blank" rel="noopener noreferrer" className={btnSecondary} title="Open the invoice"><ExternalLink className="w-3.5 h-3.5" /></a>
                  <button onClick={send} disabled={busy !== null} className={btnPrimary}>{busy === 'send' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}{deal.invoiceSentAt ? 'Send again' : 'Email invoice'}</button>
                </>
              )}
            </div>
          ) : (
            <span className="text-xs text-off-black/50">{deal.invoiceUrl ? 'Invoice built; Matt sends it' : 'Matt builds the invoice'}</span>
          )}
        </div>
      )}
      {quote && quote.missing.length > 0 && <p className="text-xs text-red-600">{quote.missing.join('; ')}</p>}
      {!isAdmin && <p className="text-xs text-off-black/50 border-t border-border-gray pt-3">{deal.paidAt ? `Paid${deal.shopifyOrderName ? ` · ${deal.shopifyOrderName}` : ''}` : 'Matt handles the invoice'}</p>}
      {isAdmin && deal.invoiceSentAt && !deal.paidAt && <p className="text-[11px] text-off-black/45">Invoice emailed {new Date(deal.invoiceSentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. It turns paid here on its own once they pay.</p>}
      {deal.notes && <p className="text-xs text-off-black/60">{deal.notes}</p>}
    </div>
  )
}
