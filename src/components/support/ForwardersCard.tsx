import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { supportApi } from '@/lib/supportApi'

/**
 * The other inboxes the team still gets support mail in. A customer's email
 * forwarded to fast@ from one of these (or from @trackstar.art, or from a
 * teammate's sign-in address) becomes that customer's conversation; a reply
 * goes to the customer from fast@ as if they had written there.
 */
export default function ForwardersCard({ isAdmin }: { isAdmin: boolean }) {
  const [list, setList] = useState<string[] | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { supportApi.settings().then(r => setList(r.forwarders || [])).catch(() => setList([])) }, [])
  const save = async (next: string[]) => {
    setBusy(true)
    try { const r = await supportApi.saveForwarders(next); setList(r.forwarders); setDraft(''); toast.success('Saved') }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  if (list === null) return null
  return (
    <div className="border-b border-border-gray px-4 py-3 space-y-2">
      <div className="text-[12px] font-semibold text-off-black">Forwarding addresses</div>
      <p className="text-[11px] text-off-black/50">Forward a customer's email to fast@ from one of these and it becomes their conversation, as if they wrote to fast@. Anyone @trackstar.art and every teammate's sign-in address count already.</p>
      <div className="flex flex-wrap gap-1.5">
        {list.map(e => (
          <span key={e} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full border border-border-gray bg-white text-xs text-off-black/75">
            {e}
            {isAdmin && <button disabled={busy} onClick={() => save(list.filter(x => x !== e))} className="text-off-black/35 hover:text-off-black" title="Remove"><X className="w-3 h-3" /></button>}
          </span>
        ))}
        {!list.length && <span className="text-xs text-off-black/40">None yet.</span>}
      </div>
      {isAdmin && (
        <div className="flex items-center gap-2">
          <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && draft.trim()) save([...list, draft.trim()]) }} placeholder="you@yourotherdomain.com"
            className="flex-1 px-2.5 py-1 text-xs bg-white border border-border-gray rounded focus:outline-none focus:ring-1 focus:ring-off-black/20" />
          <button disabled={busy || !draft.trim()} onClick={() => save([...list, draft.trim()])} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-dark-fill text-white hover:bg-off-black/85 disabled:opacity-50">{busy && <Loader2 className="w-3 h-3 animate-spin" />}Add</button>
        </div>
      )}
    </div>
  )
}
