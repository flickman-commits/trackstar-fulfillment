import { useState } from 'react'
import { Check, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import type { Deal, OvernightRun } from '@/types/sales'

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

/** Days past due, as a chip. Over two weeks goes red: that is a follow-up the cadence promised and nobody sent. */
export function OverdueBadge({ days, active }: { days?: number; active?: boolean }) {
  if (!days || days <= 0) return null
  const late = days > 14
  const cls = active ? 'border-white/40 text-white' : late ? 'bg-red-50 border-red-300 text-red-700' : 'bg-amber-50 border-amber-300 text-amber-700'
  return <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border tabular-nums whitespace-nowrap ${cls}`} title={`${days} days past the next action date`}>{days}d late</span>
}

function Row({ d, active, sent, pendingSend, onClick, hint, muted }: {
  d: Deal; active: boolean; sent?: boolean; pendingSend?: boolean; onClick: () => void; hint?: string; muted?: boolean
}) {
  const who = d.person ? d.person.fullName || `${d.person.firstName} ${d.person.lastName}`.trim() : 'Nobody to email'
  const overdue = sent ? 0 : d.overdueDays
  return (
    <button
      onClick={onClick}
      className={`w-full text-left grid grid-cols-[16px_1fr_auto] items-center gap-2.5 px-3 py-2 border-b border-border-gray/70 last:border-b-0 transition-colors ${
        active ? 'bg-dark-fill text-white' : 'hover:bg-subtle-gray'
      } ${muted && !active ? 'opacity-70' : ''}`}
    >
      <span className={`w-4 h-4 rounded-full border grid place-items-center shrink-0 ${
        sent ? 'bg-success-green border-success-green' : pendingSend ? 'border-amber-500' : active ? 'border-white/50' : 'border-border-gray'
      }`}>
        {sent && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
        {pendingSend && <Loader2 className="w-2.5 h-2.5 text-amber-600 animate-spin" />}
      </span>
      <span className="min-w-0">
        <span className={`block text-[13px] font-semibold truncate ${sent ? 'line-through decoration-border-gray text-off-black/40' : ''}`}>
          {who} <span className={`font-normal ${active ? 'text-white/60' : 'text-off-black/45'}`}>· {d.name}</span>
        </span>
        <span className={`block text-[11.5px] truncate ${active ? 'text-white/65' : sent ? 'text-off-black/35' : 'text-off-black/55'}`}>
          {sent ? `Sent ${fmtTime(d.sentAt)}` : pendingSend ? 'Sending…' : d.reason}
        </span>
      </span>
      <span className="flex items-center gap-1">
        {d.motion && <span className={`font-mono text-[9.5px] px-1 py-0.5 rounded border uppercase tracking-wider ${active ? 'border-white/30 text-white/70' : 'border-border-gray text-off-black/40'}`}>{d.motion.slice(0, 3)}</span>}
        <OverdueBadge days={overdue} active={active} />
        {hint && <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${active ? 'border-white/30 text-white/70' : 'border-border-gray text-off-black/40'}`}>{hint}</span>}
      </span>
    </button>
  )
}

function Fold({ title, count, children, defaultOpen = false }: { title: string; count: number; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  if (!count) return null
  return (
    <div className="rounded-lg border border-border-gray bg-white overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full px-3 py-1.5 font-mono text-[10.5px] tracking-wider uppercase text-off-black/45 flex items-center justify-between hover:bg-subtle-gray">
        <span>{title}</span>
        <span className="flex items-center gap-1.5 tabular-nums">{count} {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}</span>
      </button>
      {open && <div className="border-t border-border-gray">{children}</div>}
    </div>
  )
}

export default function Queue({
  mode, onMode, scope, onScope, today, pendingSendIds, selectedId, onSelect, loading,
}: {
  mode: QueueMode; onMode: (m: QueueMode) => void
  scope: 'mine' | 'all'; onScope: (s: 'mine' | 'all') => void
  today: {
    sentToday: Deal[]; newOutreach: Deal[]; newWaiting: number; followUps: Deal[]; later: Deal[]; exhausted: Deal[]
    needsContact: Deal[]; skipped: Deal[]; overnight: OvernightRun | null; cap: number; member: { id: string; email: string; name: string } | null
  } | null
  pendingSendIds: Set<string>
  selectedId: string | null; onSelect: (id: string) => void
  loading: boolean
}) {
  const [noteOpen, setNoteOpen] = useState(false)
  const overnight = today?.overnight || null
  const note = overnight?.notes || ''
  const firstSentence = note.split(/(?<=[.!?])\s+/)[0] || ''
  const rest = note.slice(firstSentence.length).trim()

  const newLeft = (today?.newOutreach || []).filter(d => !pendingSendIds.has(d.id)).length
  const dueLeft = (today?.followUps || []).filter(d => !pendingSendIds.has(d.id)).length
  const pill = (active: boolean) => `flex-1 px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors ${active ? 'bg-dark-fill text-white' : 'text-off-black/60 hover:bg-subtle-gray'}`

  return (
    <aside className="w-full lg:w-[300px] shrink-0 flex flex-col gap-2 min-h-0">
      <div className="flex items-center gap-1 p-1 rounded-full border border-border-gray bg-white">
        <button onClick={() => onMode('new')} className={pill(mode === 'new')}>New Outreach <span className="opacity-60 tabular-nums">{today ? newLeft : ''}</span></button>
        <button onClick={() => onMode('followups')} className={pill(mode === 'followups')}>Follow Ups <span className="opacity-60 tabular-nums">{today ? dueLeft : ''}</span></button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
        {overnight && (
          <div className="rounded-lg border border-border-gray bg-white px-3 py-2 text-[12.5px] text-off-black/65">
            <button onClick={() => setNoteOpen(o => !o)} className="w-full flex items-center justify-between font-semibold text-off-black">
              <span>Overnight · {overnight.prepared} written</span>
              {rest ? (noteOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />) : null}
            </button>
            <p className="mt-1 leading-snug">{firstSentence || 'No notes from the run.'}</p>
            {noteOpen && rest && <p className="mt-1 leading-snug">{rest}</p>}
          </div>
        )}

        <div className="rounded-lg border border-border-gray bg-white overflow-hidden">
          <div className="px-3 py-1.5 font-mono text-[10.5px] tracking-wider uppercase text-off-black/45 border-b border-border-gray flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <span>{mode === 'new' ? 'Today' : 'Due now'}</span>
              <button
                onClick={() => onScope(scope === 'mine' ? 'all' : 'mine')}
                className="normal-case tracking-normal font-sans text-[10.5px] px-1.5 py-0.5 rounded border border-border-gray text-off-black/55 hover:text-off-black hover:bg-subtle-gray"
                title={scope === 'mine' ? 'Deals you own in Attio, plus unowned ones. Click for everyone\'s.' : 'Everyone\'s deals. Click for just yours.'}
              >
                {scope === 'mine' ? (today?.member?.name || 'Mine') : 'Everyone'}
              </button>
            </span>
            <span>{mode === 'new' ? `${newLeft} left` : `${dueLeft} due`}</span>
          </div>
          {loading && !today ? (
            <div className="flex items-center justify-center h-24 text-off-black/40"><Loader2 className="w-4 h-4 animate-spin" /></div>
          ) : mode === 'new' ? (
            <>
              {today?.sentToday.map(d => <Row key={`sent-${d.id}`} d={d} sent active={d.id === selectedId} onClick={() => onSelect(d.id)} />)}
              {today?.newOutreach.map(d => <Row key={d.id} d={d} active={d.id === selectedId} pendingSend={pendingSendIds.has(d.id)} onClick={() => onSelect(d.id)} hint={d.id === selectedId ? '⌘↵' : undefined} />)}
              {today && today.newOutreach.length === 0 && today.sentToday.length === 0 && (
                <div className="px-3 py-4 text-xs text-off-black/50">Nobody new to write to.{today.needsContact.length ? ` ${today.needsContact.length} deals need a person with an email in Attio.` : ''}</div>
              )}
            </>
          ) : (
            <>
              {today?.followUps.map(d => <Row key={d.id} d={d} active={d.id === selectedId} pendingSend={pendingSendIds.has(d.id)} onClick={() => onSelect(d.id)} hint={d.id === selectedId ? '⌘↵' : undefined} />)}
              {today && today.followUps.length === 0 && (
                <div className="px-3 py-4 text-xs text-off-black/50">No follow-ups due. {today.later.length ? `${today.later.length} coming up.` : ''}</div>
              )}
            </>
          )}
        </div>

        {mode === 'new' && today && (
          <>
            {today.newWaiting > 0 && (
              <div className="rounded-lg border border-border-gray bg-white px-3 py-2 text-[12px] text-off-black/55">
                {today.newWaiting} more ready after today's {today.cap}. Raise the cap in Settings to see them.
              </div>
            )}
            <Fold title="Need a person with an email" count={today.needsContact.length}>
              {today.needsContact.map(d => <Row key={d.id} d={{ ...d, reason: d.genericOnly ? 'Only a generic inbox · find a person in Attio' : 'No person with an email in Attio' }} muted active={d.id === selectedId} onClick={() => onSelect(d.id)} />)}
            </Fold>
          </>
        )}
        {mode === 'followups' && today && (
          <>
            <Fold title="Coming up" count={today.later.length} defaultOpen>
              {today.later.map(d => <Row key={d.id} d={{ ...d, reason: `Touch ${d.nextTouchNumber} · due ${fmtDay(d.nextActionDate) || 'soon'}` }} muted active={d.id === selectedId} onClick={() => onSelect(d.id)} />)}
            </Fold>
            <Fold title="Sequence finished · needs a decision" count={today.exhausted.length}>
              {today.exhausted.map(d => <Row key={d.id} d={d} muted active={d.id === selectedId} onClick={() => onSelect(d.id)} />)}
            </Fold>
          </>
        )}
        {today && today.skipped.length > 0 && (
          <Fold title="Skipped today" count={today.skipped.length}>
            {today.skipped.map(d => <Row key={d.id} d={d} muted active={d.id === selectedId} onClick={() => onSelect(d.id)} />)}
          </Fold>
        )}
        {today && scope === 'mine' && !today.member && (
          <p className="text-[11px] text-amber-700 px-0.5">Your email is not on the Attio workspace, so Mine shows unowned deals only.</p>
        )}
      </div>

      <p className="text-[11px] text-off-black/40 px-0.5">I / K move · ⌘↵ send · S skip today</p>
    </aside>
  )
}
