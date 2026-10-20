import { useState } from 'react'
import { Filter, Loader2, Undo2, X } from 'lucide-react'
import { toast } from 'sonner'
import { supportApi } from '@/lib/supportApi'
import { filterFor } from '@/lib/senderFilters'
import { useIsAdmin } from '@/lib/auth'
import type { SenderFilter } from '@/types/support'

const linkCls = 'self-start inline-flex items-center gap-1.5 text-xs font-medium text-[#4600D6] hover:underline underline-offset-2 disabled:opacity-50'

/**
 * On a conversation: keep this sender out of the inbox, by address or by
 * their whole domain, or, when a filter already catches them, undo it. A
 * whole domain is an admin's (the server holds the same line).
 */
export function FilterSender({ email, filters, onChanged }: { email: string; filters: SenderFilter[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const isAdmin = useIsAdmin()
  const e = (email || '').toLowerCase()
  const domain = e.split('@')[1] || ''
  // Freemail is a person, not a vendor: offer the address only.
  const personal = /^(gmail|googlemail|yahoo|aol|icloud|me|mac|hotmail|outlook|live|msn|comcast|att|verizon|proton|protonmail)\./.test(domain)
  const caught = filterFor(e, filters)
  const run = async (fn: () => Promise<string>) => {
    setBusy(true)
    try { toast.success(await fn()); onChanged() }
    catch (err) { toast.error((err as Error).message) }
    finally { setBusy(false) }
  }
  if (!e) return null
  if (caught) {
    return (
      <div className="space-y-1">
        <div className="text-[11px] text-off-black/55">Filtered out by <span className="font-mono">{caught.pattern}</span>: not in the inbox.</div>
        <button disabled={busy} className={linkCls} onClick={() => run(async () => { const out = await supportApi.removeFilter(caught.pattern); return `${caught.pattern} unfiltered, ${out.restored} back in the inbox` })}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}Stop filtering {caught.pattern}
        </button>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      {isAdmin && !personal && domain && (
        <button disabled={busy} className={linkCls} title="Vendors, alerts, newsletters: kept, but out of the inbox" onClick={() => run(async () => { const out = await supportApi.addFilter(domain); return `Filtering ${out.pattern}: ${out.filed} conversation${out.filed === 1 ? '' : 's'} moved to Filtered` })}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Filter className="w-3.5 h-3.5" />}Filter all mail from {domain}
        </button>
      )}
      <button disabled={busy} className={linkCls} onClick={() => run(async () => { const out = await supportApi.addFilter(e); return `Filtering ${out.pattern}: ${out.filed} conversation${out.filed === 1 ? '' : 's'} moved to Filtered` })}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Filter className="w-3.5 h-3.5" />}Filter only {e}
      </button>
    </div>
  )
}

/** In Settings: every filter, with who added it, removable, and a box to add one. */
export function FilterList({ filters, onChanged }: { filters: SenderFilter[]; onChanged: () => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<string>) => {
    setBusy(true)
    try { toast.success(await fn()); onChanged() }
    catch (err) { toast.error((err as Error).message) }
    finally { setBusy(false) }
  }
  const add = () => { const v = value.trim(); if (v) run(async () => { const out = await supportApi.addFilter(v); setValue(''); return `Filtering ${out.pattern}: ${out.filed} moved to Filtered` }) }
  return (
    <div className="border-b border-border-gray px-4 py-3 space-y-2">
      <div className="text-[12px] font-semibold text-off-black">Filtered senders</div>
      <p className="text-[11px] text-off-black/50">Mail from these is kept but stays out of the inbox, under Filtered. A domain covers its subdomains.</p>
      {filters.length === 0 && <div className="text-xs text-off-black/45">None yet.</div>}
      <div className="space-y-1">
        {filters.map(f => (
          <div key={f.pattern} className="flex items-center gap-2 text-xs">
            <span className="font-mono text-off-black">{f.pattern}</span>
            <span className="text-off-black/40">{f.addedBy ? `by ${f.addedBy}` : ''}</span>
            <button disabled={busy} onClick={() => run(async () => { const out = await supportApi.removeFilter(f.pattern); return `${f.pattern} unfiltered, ${out.restored} back in the inbox` })} className="ml-auto text-off-black/40 hover:text-red-600" title="Stop filtering"><X className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <input value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} placeholder="artelo.com or someone@example.com" className="flex-1 px-2 py-1 text-xs bg-white border border-border-gray rounded focus:outline-none focus:ring-1 focus:ring-off-black/20" />
        <button onClick={add} disabled={busy || !value.trim()} className="px-2.5 py-1 text-xs font-medium rounded bg-dark-fill text-white hover:bg-off-black/85 disabled:opacity-50">Add</button>
      </div>
    </div>
  )
}
