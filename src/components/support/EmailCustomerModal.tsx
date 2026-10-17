import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Loader2, Mail, X } from 'lucide-react'
import { toast } from 'sonner'
import { supportApi } from '@/lib/supportApi'
import { btnPrimary, btnSecondary } from '@/lib/ui'

/**
 * "Email customer" from an order in the fulfillment tool. Usually it is the
 * same note: we need one more detail (a bib number, the last name they
 * registered under, a finish time). It sends from fast@ through the support
 * mailbox, so the conversation and their reply live in Support.
 */
export interface EmailCustomerOrder {
  id: string
  /** The number the customer knows (Shopify's order name), not our row's id. */
  displayNumber: string
  customerEmail?: string | null
  customerName?: string | null
  runnerName?: string | null
  raceName?: string | null
  raceYear?: number | string | null
}

const ASK = '[what we need]'
const ASKS: { label: string; text: string }[] = [
  { label: 'Bib number', text: "their bib number from the race. It's on the race app, the confirmation email, or the bib itself" },
  { label: 'Last name', text: 'the full name they registered under, exactly as on the results (a maiden name, a hyphenated name or a nickname is often why we cannot find them)' },
  { label: 'Finish time', text: 'their official finish time (chip time if you have it)' },
  { label: 'Which race', text: 'which race and year this print is for, and the distance they ran' },
]

function firstName(name?: string | null) {
  const f = String(name || '').trim().split(/\s+/)[0] || ''
  return f ? f[0].toUpperCase() + f.slice(1) : ''
}

function template(o: EmailCustomerOrder, rep: string) {
  const who = firstName(o.customerName)
  const runner = String(o.runnerName || '').trim()
  const race = [o.raceName, o.raceYear].filter(Boolean).join(' ')
  const forWhat = runner && race ? `${runner}'s ${race} print` : race ? `your ${race} print` : 'your print'
  return `Hey${who ? ` ${who}` : ''},

Thanks so much for your order! We're getting started on ${forWhat}, and we need one more thing from you before we can finish it: ${ASK}.

Just reply to this email and we'll take it from there.

Thanks,
${rep} from Trackstar`
}

export default function EmailCustomerModal({ order, repName, onClose }: { order: EmailCustomerOrder; repName: string; onClose: () => void }) {
  const [subject, setSubject] = useState(`Trackstar Order ${String(order.displayNumber).replace(/^#/, '')} (Action Required)`)
  const [text, setText] = useState(() => template(order, repName || 'The team'))
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<{ threadId: string; to: string } | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const unfilled = text.includes(ASK)
  const ask = (t: string) => {
    if (text.includes(ASK)) setText(text.replace(ASK, t))
    else setText(text.replace(/(\n\nJust reply)/, `\n\nAlso: ${t}.$1`))
    box.current?.focus()
  }
  const send = async () => {
    setBusy(true)
    try {
      const out = await supportApi.emailCustomer(order.id, subject, text)
      setSent(out)
      toast.success(`Sent to ${out.to}`)
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onMouseDown={() => !busy && onClose()}>
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-border-gray" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-gray">
          <h2 className="text-sm font-semibold text-off-black inline-flex items-center gap-2"><Mail className="w-4 h-4" />Email customer</h2>
          <button onClick={onClose} disabled={busy} className="p-1 rounded text-off-black/50 hover:text-off-black"><X className="w-4 h-4" /></button>
        </div>
        {sent ? (
          <div className="px-5 py-6 space-y-3 text-sm">
            <p className="text-off-black">Sent from fast@ to <b>{sent.to}</b>. Their reply comes into Support, assigned to you, and the order has a comment saying it went out.</p>
            <div className="flex items-center gap-2 justify-end">
              <a href={`/support?thread=${encodeURIComponent(sent.threadId)}`} target="_blank" rel="noopener noreferrer" className={`${btnSecondary} inline-flex items-center gap-1.5`}>Open in Support<ArrowUpRight className="w-3.5 h-3.5" /></a>
              <button onClick={onClose} className={btnPrimary}>Done</button>
            </div>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-3">
            <div className="grid grid-cols-[56px_1fr] items-center gap-y-2 text-sm">
              <span className="text-off-black/50 text-xs">To</span>
              <span className="text-off-black truncate">{order.customerName ? `${order.customerName} · ` : ''}{order.customerEmail}</span>
              <span className="text-off-black/50 text-xs">Subject</span>
              <input value={subject} onChange={e => setSubject(e.target.value)} className="w-full px-2.5 py-1.5 text-sm border border-border-gray rounded focus:outline-none focus:ring-1 focus:ring-off-black/20" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                <span className="text-[11px] text-off-black/50">We need:</span>
                {ASKS.map(a => (
                  <button key={a.label} onClick={() => ask(a.text)} className="px-2 py-0.5 rounded-full border border-[#4600D6]/25 text-[11px] text-[#4600D6] hover:bg-[#4600D6]/5">{a.label}</button>
                ))}
              </div>
              <textarea ref={box} value={text} onChange={e => setText(e.target.value)} rows={11}
                className="w-full px-3 py-2 text-sm leading-relaxed border border-border-gray rounded focus:outline-none focus:ring-1 focus:ring-off-black/20" />
              {unfilled && <p className="text-[11px] text-amber-700 mt-1">Pick what we need above, or replace {ASK} yourself.</p>}
            </div>
            <div className="flex items-center gap-2 justify-end">
              <span className="text-[11px] text-off-black/45 mr-auto">Sends from fast@trackstar.art</span>
              <button onClick={onClose} disabled={busy} className={btnSecondary}>Cancel</button>
              <button onClick={send} disabled={busy || unfilled || !text.trim() || !subject.trim()} className={`${btnPrimary} inline-flex items-center gap-1.5 disabled:opacity-50`}>{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Send</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
