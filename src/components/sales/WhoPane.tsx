import { useEffect, useState } from 'react'
import { ExternalLink, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { btnGhost, fieldLabel, inputBase } from '@/lib/ui'
import { STAGES, type Deal, type Person, type Stage } from '@/types/sales'

/**
 * The person and the deal, straight from Attio.
 *
 * What Attio's enrichment says about the person and the company, the deal's
 * own fields (stage, priority, race date, runners, the team's notes), the
 * emails sent from here, and a link into the record. The stage can be moved
 * from here because a rep is a person and may; the tool itself only ever
 * moves Not Contacted to Reached Out on a send.
 */
function fmtDate(s?: string | null) {
  if (!s) return ''
  const d = s.length === 10 ? new Date(`${s}T00:00:00`) : new Date(s)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })
}

export default function WhoPane({ deal, person, onStage, onSelectPerson, onNote, busy, stages }: {
  /** Attio's stage list, in order. Falls back to the known list. */
  stages?: string[] | null
  deal: Deal | null
  person: Person | null
  onStage: (stage: Stage) => void
  onSelectPerson: (id: string) => void
  onNote: (text: string) => Promise<void>
  busy: boolean
}) {
  const [note, setNote] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  useEffect(() => { setNote(''); setHistoryOpen(false); setNoteOpen(false) }, [deal?.id])

  if (!deal) return null
  // A one-off to a bare address: nothing in Attio to show or move.
  const free = deal.id.startsWith('adhoc:')

  const sends = deal.sends || []
  const facts: Array<[string, string]> = []
  if (deal.priority) facts.push(['Priority', deal.priority])
  if (deal.sizeTier) facts.push(['Size', deal.sizeTier])
  if (deal.tier) facts.push(['Tier', deal.tier])
  if (deal.raceDate) facts.push(['Race', fmtDate(deal.raceDate)])
  if (deal.runners) facts.push(['Runners', Number(deal.runners).toLocaleString()])
  if (deal.touchCount) facts.push(['Touches', String(deal.touchCount)])
  if (deal.nextActionDate) facts.push(['Next', fmtDate(deal.nextActionDate)])
  if (deal.company?.lastEmailAt) facts.push(['Last email', fmtDate(deal.company.lastEmailAt)])

  return (
    <div className="flex flex-col gap-2 text-sm">
      <section className="rounded-lg border border-border-gray bg-white px-3.5 py-3">
        <div className="min-w-0">
          <div className="text-[15px] font-bold truncate">{person ? person.fullName || `${person.firstName} ${person.lastName}`.trim() : 'Nobody on the deal'}</div>
          <div className="text-xs text-off-black/60">{person?.title || ''}{person?.title ? ' · ' : ''}{deal.company?.name || deal.name}</div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {person?.linkedin && <a href={person.linkedin} target="_blank" rel="noopener noreferrer" className="text-[11px] text-off-black/60 hover:text-off-black inline-flex items-center gap-0.5">LinkedIn <ExternalLink className="w-3 h-3" /></a>}
            {person?.location && <span className="text-[11px] text-off-black/50">{person.location}</span>}
            {(person?.webUrl || deal.webUrl) && (
              <a href={person?.webUrl || deal.webUrl || '#'} target="_blank" rel="noopener noreferrer" className="text-[11px] text-off-black/60 hover:text-off-black inline-flex items-center gap-0.5">Attio <ExternalLink className="w-3 h-3" /></a>
            )}
          </div>
        </div>
        {deal.people.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {deal.people.map(p => (
              <button key={p.id} onClick={() => onSelectPerson(p.id)} className={`text-[11px] px-2 py-0.5 rounded-full border ${p.id === person?.id ? 'bg-dark-fill text-white border-dark-fill' : 'border-border-gray text-off-black/60 hover:bg-subtle-gray'} ${!p.email ? 'opacity-50' : ''}`} title={p.email || 'No email'}>
                {p.firstName || p.fullName}
              </button>
            ))}
          </div>
        )}
        {person?.description && <p className="mt-2 text-[12.5px] text-off-black/70 leading-snug">{person.description}</p>}
      </section>

      {(deal.company?.description || deal.notes) && (
        <section className="rounded-lg border border-border-gray bg-white px-3.5 py-3">
          <span className={fieldLabel}>{deal.company?.name || deal.name}</span>
          {deal.company?.description && <p className="text-[12.5px] text-off-black/70 leading-snug">{deal.company.description}</p>}
          {deal.company && (deal.company.location || deal.company.employeeRange || deal.company.categories.length > 0) && (
            <p className="text-[11px] text-off-black/45 mt-1">{[deal.company.location, deal.company.employeeRange && `${deal.company.employeeRange} people`, ...deal.company.categories.slice(0, 3)].filter(Boolean).join(' · ')}</p>
          )}
          {deal.notes && (
            <div className="mt-2">
              <span className="font-mono text-[10px] tracking-wider uppercase text-off-black/40">Team notes</span>
              <p className="text-[12.5px] text-off-black/70 leading-snug whitespace-pre-wrap">{deal.notes}</p>
            </div>
          )}
        </section>
      )}

      {!free && <section className="rounded-lg border border-border-gray bg-white px-3.5 py-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className={`${fieldLabel} mb-0`}>Stage</span>
          <select value={String(deal.stage || '')} onChange={e => onStage(e.target.value as Stage)} disabled={busy} className={`${inputBase} text-xs py-1 max-w-[170px]`}>
            {[...(stages && stages.length ? stages : STAGES), ...(deal.stage && !(stages && stages.length ? stages : [...STAGES]).includes(String(deal.stage)) ? [String(deal.stage)] : [])].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {facts.length > 0 && (
          <dl className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 text-xs">
            {facts.map(([k, v]) => [
              <dt key={`${k}-k`} className="text-off-black/45">{k}</dt>,
              <dd key={`${k}-v`} className="text-off-black/80 tabular-nums truncate">{v}</dd>,
            ])}
          </dl>
        )}
        {deal.nextAction && <p className="text-[11.5px] text-off-black/55 mt-1.5 leading-snug">{deal.nextAction}</p>}
      </section>}

      {/* What has already gone to this person, so a follow-up can pick up where
          the last one left off. Emails sent from the tool carry their text;
          anything older than the tool lives in Gmail, one click away. */}
      {(sends.length > 0 || person?.email) && (
        <section className="rounded-lg border border-border-gray bg-white px-3.5 py-2">
          <button onClick={() => setHistoryOpen(o => !o)} className="w-full flex items-center justify-between text-xs font-semibold text-off-black/70">
            <span>Past emails{sends.length ? ` · ${sends.length}` : ''}</span>{historyOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          {historyOpen && (
            <div className="mt-2 space-y-2">
              {sends.slice().reverse().map(s => (
                <details key={s.id} className="text-xs rounded border border-border-gray bg-subtle-gray/50 px-2 py-1.5">
                  <summary className="cursor-pointer list-none">
                    <span className="flex justify-between gap-2 text-off-black/50"><span>Touch {s.touchNumber}{s.sentByEmail ? ` · ${s.sentByEmail.split('@')[0]}` : ''}</span><span>{fmtDate(s.sentAt)}</span></span>
                    <span className="block font-medium truncate">{s.subject}</span>
                  </summary>
                  {s.body && <p className="mt-1.5 whitespace-pre-wrap leading-snug text-off-black/70 border-t border-border-gray pt-1.5">{s.body}</p>}
                  {!s.attioOk && <p className="text-amber-700 mt-1">Attio was not updated for this one.</p>}
                  {s.gmailThreadId && (
                    <a href={`https://mail.google.com/mail/u/0/#all/${encodeURIComponent(s.gmailThreadId)}`} target="_blank" rel="noopener noreferrer" className="mt-1 text-off-black/50 hover:text-off-black inline-flex items-center gap-0.5">Open the thread <ExternalLink className="w-3 h-3" /></a>
                  )}
                </details>
              ))}
              {person?.email && (
                <a
                  href={`https://mail.google.com/mail/u/0/#search/${encodeURIComponent(person.email)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 w-full rounded border border-border-gray px-2 py-1.5 text-xs text-off-black/60 hover:text-off-black hover:bg-subtle-gray"
                >
                  Read the whole chain in Gmail <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {sends.length === 0 && (
                <p className="text-[11px] text-off-black/45 leading-snug">Nothing was sent from this tool yet. Earlier emails, including anyone who has left, are in Gmail.</p>
              )}
            </div>
          )}
        </section>
      )}

      {!free && <section className="rounded-lg border border-border-gray bg-white px-3.5 py-2">
        <button onClick={() => setNoteOpen(o => !o)} className="w-full flex items-center justify-between text-xs font-semibold text-off-black/70">
          <span>Add a note to the deal</span>{noteOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        {noteOpen && (
          <form className="mt-2 flex flex-col gap-2" onSubmit={async e => { e.preventDefault(); if (!note.trim()) return; await onNote(note.trim()); setNote('') }}>
            <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Goes on the deal in Attio, with your name." className={`${inputBase} w-full resize-y text-xs`} />
            <div className="flex justify-end"><button type="submit" disabled={busy || !note.trim()} className={btnGhost}>{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save to Attio'}</button></div>
          </form>
        )}
      </section>}
    </div>
  )
}
