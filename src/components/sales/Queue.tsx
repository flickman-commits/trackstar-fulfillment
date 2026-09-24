import { useState } from 'react'
import { Check, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { chip, chipTone, listHead } from '@/lib/ui'
import type { Deal } from '@/types/sales'

/**
 * The left column: today's work, read from Attio.
 *
 * Two pills. New Outreach is the cap's worth of deals nobody has written to,
 * with the ones already sent today checked off at the top so the morning has
 * a shape. Follow Ups is every deal at Reached Out whose next touch is due,
 * with the not-yet-due ones folded underneath by date so the rep can see the
 * week coming. Each row says why it is here and, when it is late, by how much.
 */
export type QueueMode = 'new' | 'followups'

function fmtTime(s?: string | null) {
  return s ? new Date(s).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''
}
function fmtDay(s?: string | null) {
  return s ? new Date(`${s}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''
}

/** The motion, in Attio's colours and the fulfilment tool's chip shape. */
const MOTION_TONE: Record<string, string> = {
  Race: chipTone.race,
  Charity: chipTone.charity,
  Corporate: chipTone.corporate,
}

export function MotionTag({ motion }: { motion?: string | null }) {
  if (!motion) return null
  return <span className={`${chip} ${MOTION_TONE[motion] || chipTone.quiet}`}>{motion}</span>
}

function Row({ d, active, sent, pendingSend, onClick, hint, muted, index = 0 }: {
  d: Deal; active: boolean; sent?: boolean; pendingSend?: boolean; onClick: () => void; hint?: string; muted?: boolean; index?: number
}) {
  const who = d.person ? d.person.fullName || `${d.person.firstName} ${d.person.lastName}`.trim() : 'Nobody to email'
  return (
    <button
      onClick={onClick}
      className={`w-full text-left grid grid-cols-[16px_1fr_auto] items-center gap-3 px-5 py-3.5 border-b border-border-gray last:border-b-0 transition-colors ${
        active
          ? 'bg-off-black/[0.045] shadow-[inset_3px_0_0_0_#242424]'
          : `hover:bg-subtle-gray ${index % 2 === 1 ? 'bg-subtle-gray/30' : ''}`
      } ${muted && !active ? 'opacity-70' : ''}`}
    >
      <span className={`w-4 h-4 rounded-full border grid place-items-center shrink-0 ${
        sent ? 'bg-success-green border-success-green' : pendingSend ? 'border-amber-500' : active ? 'border-dark-fill' : 'border-border-gray'
      }`}>
        {sent && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
        {pendingSend && <Loader2 className="w-2.5 h-2.5 text-amber-600 animate-spin" />}
      </span>
      <span className="min-w-0">
        <span className={`block text-sm font-medium truncate ${sent ? 'line-through decoration-border-gray text-off-black/40' : 'text-off-black'}`}>
          {who} <span className="font-normal text-off-black/45">· {d.name}</span>
        </span>
        <span className={`block text-xs mt-0.5 truncate ${sent ? 'text-off-black/35' : 'text-off-black/50'}`}>
          {sent ? `Sent ${fmtTime(d.sentAt)}` : pendingSend ? 'Sending…' : d.reason}
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        <MotionTag motion={d.motion} />
        {hint && <span className="px-1.5 py-0.5 rounded border border-border-gray bg-white text-[10px] font-medium text-off-black/40">{hint}</span>}
      </span>
    </button>
  )
}

function Fold({ title, count, children, defaultOpen = false }: { title: string; count: number; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  if (!count) return null
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className={`w-full flex items-center justify-between gap-2 px-5 py-2.5 ${listHead} border-t hover:bg-off-black/[0.03]`}>
        <span className="truncate">{title}</span>
        <span className="flex items-center gap-1.5 tabular-nums shrink-0">{count} {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</span>
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}

/** Does a row match the toolbar search? Person, address or deal name. */
function matches(d: Deal, q: string) {
  if (!q) return true
  const hay = `${d.person?.fullName || ''} ${d.person?.email || ''} ${d.name || ''}`.toLowerCase()
  return hay.includes(q.toLowerCase())
}

export default function Queue({
  mode, scope, today, pendingSendIds, selectedId, onSelect, loading, query = '',
}: {
  mode: QueueMode
  scope: 'mine' | 'all'
  today: {
    sentToday: Deal[]; newOutreach: Deal[]; newWaiting: number; followUps: Deal[]; later: Deal[]; exhausted: Deal[]
    needsContact: Deal[]; contactedBefore: Deal[]; skipped: Deal[]; cap: number; member: { id: string; email: string; name: string } | null
  } | null
  pendingSendIds: Set<string>
  selectedId: string | null; onSelect: (id: string) => void
  loading: boolean
  /** The toolbar search. Filters every list below. */
  query?: string
}) {
  const f = (list?: Deal[]) => (list || []).filter(d => matches(d, query))

  const newLeft = (today?.newOutreach || []).filter(d => !pendingSendIds.has(d.id)).length
  const dueLeft = (today?.followUps || []).filter(d => !pendingSendIds.has(d.id)).length
  const main = mode === 'new' ? [...f(today?.sentToday), ...f(today?.newOutreach)] : f(today?.followUps)

  return (
    <aside className="w-full lg:w-[290px] xl:w-[310px] shrink-0 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-border-gray">
      <div className={`flex items-center justify-between px-5 py-3 ${listHead} flex-shrink-0`}>
        <span>{mode === 'new' ? 'Today' : 'Due now'}</span>
        <span className="tabular-nums">{mode === 'new' ? `${newLeft} left` : `${dueLeft} due`}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && !today ? (
          <div className="flex items-center justify-center h-32 text-off-black/40"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : (
          <>
            {main.map((d, i) => {
              const sent = mode === 'new' && Boolean(today?.sentToday.some(x => x.id === d.id))
              return (
                <Row
                  key={`${sent ? 'sent-' : ''}${d.id}`} d={d} index={i} sent={sent}
                  active={d.id === selectedId} pendingSend={pendingSendIds.has(d.id)} onClick={() => onSelect(d.id)}
                />
              )
            })}
            {today && main.length === 0 && (
              <div className="px-5 py-8 text-sm text-off-black/50 text-center">
                {query ? 'Nothing matches that search.'
                  : mode === 'new' ? `Nobody new to write to.${today.needsContact.length ? ` ${today.needsContact.length} deals need a person with an email in Attio.` : ''}`
                  : `Nothing due.${today.later.length ? ` ${today.later.length} coming up.` : ''}`}
              </div>
            )}
          </>
        )}

        {mode === 'new' && today && (
          <>
            {today.newWaiting > 0 && !query && (
              <div className="px-5 py-3 border-t border-border-gray text-xs text-off-black/55">
                {today.newWaiting} more ready after today's {today.cap}. Raise the cap in Settings to see them.
              </div>
            )}
            <Fold title="Emailed before · stage says Not Contacted" count={f(today.contactedBefore).length}>
              {f(today.contactedBefore).map((d, i) => <Row key={d.id} index={i} d={{ ...d, reason: `Last email ${fmtDay(String(d.lastSentAt).slice(0, 10))} in Attio · fix the stage` }} muted active={d.id === selectedId} onClick={() => onSelect(d.id)} />)}
            </Fold>
            <Fold title="Need a person with an email" count={f(today.needsContact).length}>
              {f(today.needsContact).map((d, i) => <Row key={d.id} index={i} d={{ ...d, reason: d.genericOnly ? 'Only a generic inbox · find a person in Attio' : 'No person with an email in Attio' }} muted active={d.id === selectedId} onClick={() => onSelect(d.id)} />)}
            </Fold>
          </>
        )}
        {mode === 'followups' && today && (
          <>
            <Fold title="Coming up" count={f(today.later).length} defaultOpen>
              {f(today.later).map((d, i) => <Row key={d.id} index={i} d={{ ...d, reason: `Touch ${d.nextTouchNumber} · due ${fmtDay(d.nextActionDate) || 'soon'}` }} muted active={d.id === selectedId} onClick={() => onSelect(d.id)} />)}
            </Fold>
            <Fold title="Sequence finished · needs a decision" count={f(today.exhausted).length}>
              {f(today.exhausted).map((d, i) => <Row key={d.id} index={i} d={d} muted active={d.id === selectedId} onClick={() => onSelect(d.id)} />)}
            </Fold>
          </>
        )}
        {today && f(today.skipped).length > 0 && (
          <Fold title="Skipped today" count={f(today.skipped).length}>
            {f(today.skipped).map((d, i) => <Row key={d.id} index={i} d={d} muted active={d.id === selectedId} onClick={() => onSelect(d.id)} />)}
          </Fold>
        )}
        {today && scope === 'mine' && !today.member && (
          <p className="px-5 py-3 text-xs text-amber-700">Your email is not on the Attio workspace, so this shows unowned deals only.</p>
        )}
      </div>
    </aside>
  )
}
