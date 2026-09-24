import { useEffect, useState } from 'react'
import { ExternalLink, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { btnGhost, btnPrimary, cardLabel, chip, chipTone, infoCard, inputBase, sectionLabel, segment, textLink } from '@/lib/ui'
import { type Deal, type Person } from '@/types/sales'

/**
 * The person and the deal, straight from Attio.
 *
 * What Attio's enrichment says about the person and the company, the deal's
 * own fields (stage, priority, race date, runners, the team's notes), the
 * emails sent from here, and a link into the record. The stage can be moved
 * from here because a rep is a person and may; the tool itself only ever
 * moves Not Contacted to Reached Out on a send.
 */
const STAGE_TONE: Record<string, string> = {
  'Needs Enrichment': chipTone.slate,
  'Not Contacted': chipTone.amber,
  'Reached Out': chipTone.rose,
  'In Conversation': chipTone.race,
  'Call Booked': chipTone.purple,
  'Deck Sent': chipTone.lime,
  'Awaiting Payment': chipTone.teal,
  Won: chipTone.emerald,
  'Revisit Next Year': chipTone.blue,
  Lost: chipTone.red,
}

function fmtDate(s?: string | null) {
  if (!s) return ''
  const d = s.length === 10 ? new Date(`${s}T00:00:00`) : new Date(s)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })
}

export default function WhoPane({ deal, person, onSelectPerson, onNote, busy }: {
  deal: Deal | null
  person: Person | null
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

  return (
    <div className="space-y-5 text-sm">
      <section>
        <div className="text-lg font-bold text-off-black leading-tight">{person ? person.fullName || `${person.firstName} ${person.lastName}`.trim() : 'Nobody on the deal'}</div>
        <div className="text-sm text-off-black/60 mt-0.5">{person?.title || ''}{person?.title ? ' · ' : ''}{deal.company?.name || deal.name}</div>
        {/* Where the deal stands, read-only. Stage moves happen in Attio. */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {deal.stage && <span className={`${chip} ${STAGE_TONE[String(deal.stage)] || chipTone.quiet}`}>{deal.stage}</span>}
          {deal.priority && <span className={`${chip} ${deal.priority === 'High' ? chipTone.amber : chipTone.neutral}`}>{deal.priority}</span>}
          <span className={`${chip} ${chipTone.quiet}`}>{deal.touchCount} {deal.touchCount === 1 ? 'touch' : 'touches'}</span>
        </div>
        <div className="flex items-center gap-3 mt-2.5 flex-wrap">
          {person?.linkedin && <a href={person.linkedin} target="_blank" rel="noopener noreferrer" className={textLink}>LinkedIn <ExternalLink className="w-3 h-3" /></a>}
          {(person?.webUrl || deal.webUrl) && (
            <a href={person?.webUrl || deal.webUrl || '#'} target="_blank" rel="noopener noreferrer" className={textLink}>Open in Attio <ExternalLink className="w-3 h-3" /></a>
          )}
          {person?.location && <span className="text-xs text-off-black/50">{person.location}</span>}
        </div>
        {deal.people.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {deal.people.map(p => (
              <button key={p.id} onClick={() => onSelectPerson(p.id)} className={`${segment(p.id === person?.id)} border ${p.id === person?.id ? 'border-dark-fill' : 'border-border-gray bg-white'} ${!p.email ? 'opacity-50' : ''}`} title={p.email || 'No email'}>
                {p.firstName || p.fullName}
              </button>
            ))}
          </div>
        )}
      </section>

      {person?.description && (
        <section>
          <h3 className={`${sectionLabel} mb-2`}>About them</h3>
          <div className={infoCard}><p className="text-sm text-off-black/75 leading-snug">{person.description}</p></div>
        </section>
      )}

      {(deal.company?.description || deal.notes) && (
        <section>
          <h3 className={`${sectionLabel} mb-2`}>{deal.company?.name || deal.name}</h3>
          <div className={`${infoCard} space-y-2.5`}>
            {deal.company?.description && <p className="text-sm text-off-black/75 leading-snug">{deal.company.description}</p>}
            {deal.company && (deal.company.location || deal.company.employeeRange || deal.company.categories.length > 0) && (
              <p className="text-xs text-off-black/50">{[deal.company.location, deal.company.employeeRange && `${deal.company.employeeRange} people`, ...deal.company.categories.slice(0, 3)].filter(Boolean).join(' · ')}</p>
            )}
            {deal.notes && (
              <div>
                <div className={cardLabel}>Team notes</div>
                <p className="text-sm text-off-black/75 leading-snug whitespace-pre-wrap mt-0.5">{deal.notes}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* What has already gone to this person, so a follow-up can pick up where
          the last one left off. Emails sent from the tool carry their text;
          anything older than the tool lives in Gmail, one click away. */}
      {(sends.length > 0 || person?.email) && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setHistoryOpen(o => !o)} className={`${sectionLabel} inline-flex items-center gap-1 hover:text-off-black/70`}>
              Past emails{sends.length ? ` · ${sends.length}` : ''} {historyOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {person?.email && (
              <a href={`https://mail.google.com/mail/u/0/#search/${encodeURIComponent(person.email)}`} target="_blank" rel="noopener noreferrer" className={textLink}>
                Whole chain in Gmail <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          {historyOpen && (
            <div className="space-y-2">
              {sends.slice().reverse().map(s => (
                <details key={s.id} className={`${infoCard} text-xs`}>
                  <summary className="cursor-pointer list-none">
                    <span className={`flex justify-between gap-2 ${cardLabel}`}><span>Touch {s.touchNumber}{s.sentByEmail ? ` · ${s.sentByEmail.split('@')[0]}` : ''}</span><span>{fmtDate(s.sentAt)}</span></span>
                    <span className="block text-sm font-medium text-off-black truncate mt-0.5">{s.subject}</span>
                  </summary>
                  {s.body && <p className="mt-2 whitespace-pre-wrap leading-snug text-off-black/70 border-t border-border-gray pt-2">{s.body}</p>}
                  {!s.attioOk && <p className="text-amber-700 mt-1">Attio was not updated for this one.</p>}
                  {s.gmailThreadId && (
                    <a href={`https://mail.google.com/mail/u/0/#all/${encodeURIComponent(s.gmailThreadId)}`} target="_blank" rel="noopener noreferrer" className={`${textLink} mt-1.5`}>Open the thread <ExternalLink className="w-3 h-3" /></a>
                  )}
                </details>
              ))}
              {sends.length === 0 && (
                <p className="text-xs text-off-black/45 leading-snug">Nothing was sent from this tool yet. Earlier emails, including anyone who has left, are in Gmail.</p>
              )}
            </div>
          )}
        </section>
      )}

      {!free && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className={sectionLabel}>Notes</h3>
            {!noteOpen && <button onClick={() => setNoteOpen(true)} className={textLink}>+ Add note</button>}
          </div>
          {noteOpen ? (
            <form className="flex flex-col gap-2" onSubmit={async e => { e.preventDefault(); if (!note.trim()) return; await onNote(note.trim()); setNote(''); setNoteOpen(false) }}>
              <textarea autoFocus rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Goes on the deal in Attio, with your name." className={`${inputBase} w-full resize-y`} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setNoteOpen(false); setNote('') }} className={btnGhost}>Cancel</button>
                <button type="submit" disabled={busy || !note.trim()} className={btnPrimary}>{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save to Attio'}</button>
              </div>
            </form>
          ) : (
            <p className="text-xs text-off-black/45">A note goes on the deal in Attio, with your name.</p>
          )}
        </section>
      )}
    </div>
  )
}
