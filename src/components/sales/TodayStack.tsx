import { useState } from 'react'
import { Check, ChevronDown, ChevronRight, Loader2, Search } from 'lucide-react'
import { inputBase, segment, segmentGroup } from '@/lib/ui'
import { STAGE_LABEL, type Company, type DealStage, type StackItem, type OvernightRun } from '@/types/sales'

/**
 * The left column: today's work, in order.
 *
 * Replies first, because someone is waiting. Then the stack the routine
 * prepared, follow-ups before first touches, with the reason each is here.
 * Sent ones check off and stay visible so the morning has a shape. Everything
 * that is not today's work is one folded line at the bottom.
 *
 * "All" is the browse mode: search and stage filter over the whole pipeline,
 * for the days you are looking for someone rather than working the list.
 */

export type StackMode = 'today' | 'all'

function fmtTime(s?: string | null) {
  return s ? new Date(s).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''
}

function Row({ c, active, sent, pendingSend, onClick, hint }: {
  c: StackItem | Company; active: boolean; sent?: boolean; pendingSend?: boolean; onClick: () => void; hint?: string
}) {
  const primary = c.contacts.find(x => x.email) || c.contacts[0]
  const who = primary ? `${primary.firstName} ${primary.lastName}`.trim() : 'No contact'
  const reason = (c as StackItem).reason
  return (
    <button
      onClick={onClick}
      className={`w-full text-left grid grid-cols-[16px_1fr_auto] items-center gap-2.5 px-3 py-2 border-b border-border-gray/70 last:border-b-0 transition-colors ${
        active ? 'bg-dark-fill text-white' : 'hover:bg-subtle-gray'
      }`}
    >
      <span className={`w-4 h-4 rounded-full border grid place-items-center shrink-0 ${
        sent ? 'bg-success-green border-success-green' : pendingSend ? 'border-amber-500' : active ? 'border-white/50' : 'border-border-gray'
      }`}>
        {sent && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
        {pendingSend && <Loader2 className="w-2.5 h-2.5 text-amber-600 animate-spin" />}
      </span>
      <span className="min-w-0">
        <span className={`block text-[13px] font-semibold truncate ${sent ? 'line-through decoration-border-gray text-off-black/40' : ''}`}>
          {who} <span className={`font-normal ${active ? 'text-white/60' : 'text-off-black/45'}`}>· {c.name}</span>
        </span>
        <span className={`block text-[11.5px] truncate ${active ? 'text-white/65' : sent ? 'text-off-black/35' : 'text-off-black/55'}`}>
          {sent ? `Sent ${fmtTime((c as StackItem).sentAt)}` : pendingSend ? 'Sending…' : reason || STAGE_LABEL[c.stage]}
        </span>
      </span>
      {hint && <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${active ? 'border-white/30 text-white/70' : 'border-border-gray text-off-black/40'}`}>{hint}</span>}
    </button>
  )
}

export default function TodayStack({
  mode, onMode,
  replies, stack, sentToday, pendingSendIds, overnight, counts,
  selectedId, onSelect,
  allCompanies, allLoading, q, onQ, view, onView,
}: {
  mode: StackMode; onMode: (m: StackMode) => void
  replies: StackItem[]; stack: StackItem[]; sentToday: StackItem[]; pendingSendIds: Set<string>
  overnight: OvernightRun | null
  counts: { dueLater: number; needsContact: number; total: number } | null
  selectedId: string | null; onSelect: (id: string) => void
  allCompanies: Company[]; allLoading: boolean; q: string; onQ: (q: string) => void
  view: 'all' | `stage:${DealStage}`; onView: (v: 'all' | `stage:${DealStage}`) => void
}) {
  const [noteOpen, setNoteOpen] = useState(false)
  const left = stack.filter(c => !pendingSendIds.has(c.id)).length
  // The routine's note can run to a paragraph. The first sentence is the
  // headline; the rest waits behind a click so the stack stays in view.
  const note = overnight?.notes || ''
  const firstSentence = note.split(/(?<=[.!?])\s+/)[0] || ''
  const rest = note.slice(firstSentence.length).trim()

  return (
    <aside className="w-full lg:w-[300px] shrink-0 flex flex-col gap-2 min-h-0">
      <div className={`${segmentGroup} w-full`}>
        <button onClick={() => onMode('today')} className={`${segment(mode === 'today')} flex-1`}>Today</button>
        <button onClick={() => onMode('all')} className={`${segment(mode === 'all')} flex-1`}>All <span className="opacity-60 tabular-nums">{counts?.total ?? ''}</span></button>
      </div>

      {mode === 'today' ? (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
          {overnight && (
            <div className="rounded-lg border border-border-gray bg-white px-3 py-2 text-[12.5px] text-off-black/65">
              <button onClick={() => setNoteOpen(o => !o)} className="w-full flex items-center justify-between font-semibold text-off-black">
                <span>Overnight · {overnight.prepared} prepared</span>
                {rest ? (noteOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />) : null}
              </button>
              <p className="mt-1 leading-snug">{firstSentence || 'No notes from the run.'}</p>
              {noteOpen && rest && <p className="mt-1 leading-snug">{rest}</p>}
            </div>
          )}

          {replies.length > 0 && (
            <div className="rounded-lg border border-success-green/40 bg-white overflow-hidden">
              <div className="px-3 py-1.5 font-mono text-[10.5px] tracking-wider uppercase text-success-green border-b border-border-gray flex justify-between">
                <span>Replies to answer</span><span>{replies.length}</span>
              </div>
              {replies.map(c => <Row key={c.id} c={c} active={c.id === selectedId} onClick={() => onSelect(c.id)} />)}
            </div>
          )}

          <div className="rounded-lg border border-border-gray bg-white overflow-hidden">
            <div className="px-3 py-1.5 font-mono text-[10.5px] tracking-wider uppercase text-off-black/45 border-b border-border-gray flex justify-between">
              <span>Today</span><span>{left} left</span>
            </div>
            {sentToday.map(c => <Row key={c.id} c={c} sent active={c.id === selectedId} onClick={() => onSelect(c.id)} />)}
            {stack.map(c => (
              <Row key={c.id} c={c} active={c.id === selectedId} pendingSend={pendingSendIds.has(c.id)} onClick={() => onSelect(c.id)} hint={c.id === selectedId ? '⌘↵' : undefined} />
            ))}
            {stack.length === 0 && sentToday.length === 0 && (
              <div className="px-3 py-4 text-xs text-off-black/50">Nothing in the stack. Import a list, or check All.</div>
            )}
          </div>

          {counts && (
            <button onClick={() => onMode('all')} className="rounded-lg border border-border-gray bg-white px-3 py-2 text-[12px] text-off-black/55 flex justify-between hover:bg-subtle-gray">
              <span>Not today</span>
              <span className="text-off-black/40 tabular-nums">{counts.dueLater} due later · {counts.needsContact} need a contact ▸</span>
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-off-black/40" />
            <input value={q} onChange={e => onQ(e.target.value)} placeholder="Search" className={`${inputBase} w-full pl-8`} />
          </div>
          <div className="relative">
            <select value={view} onChange={e => onView(e.target.value as 'all' | `stage:${DealStage}`)} className={`${inputBase} w-full appearance-none pr-7`}>
              <option value="all">Every stage</option>
              {(Object.keys(STAGE_LABEL) as DealStage[]).map(s => <option key={s} value={`stage:${s}`}>{STAGE_LABEL[s]}</option>)}
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-off-black/40 pointer-events-none" />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border-gray bg-white">
            {allLoading && allCompanies.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-off-black/40"><Loader2 className="w-4 h-4 animate-spin" /></div>
            ) : allCompanies.length === 0 ? (
              <div className="px-3 py-4 text-xs text-off-black/50">Nobody matches.</div>
            ) : allCompanies.map(c => <Row key={c.id} c={c} active={c.id === selectedId} onClick={() => onSelect(c.id)} />)}
          </div>
        </div>
      )}

      <p className="text-[11px] text-off-black/40 px-0.5">I / K move · ⌘↵ send · S skip today · X not interested</p>
    </aside>
  )
}
