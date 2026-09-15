import { useEffect, useState } from 'react'
import { ExternalLink, Loader2, Search, Plus, ChevronDown, ChevronRight } from 'lucide-react'
import { btnSecondary, btnGhost, fieldLabel, inputBase } from '@/lib/ui'
import { STAGE_LABEL, type Company, type Contact, type DealStage } from '@/types/sales'

/**
 * The right column: what a rep needs mid-sentence.
 *
 * Who they are, two or three facts worth using in the opener, what has
 * happened so far, and the stage as pills. Notes and the full stage list sit
 * below. Nothing here explains the tool; it describes the person.
 */
const QUICK_STAGES: DealStage[] = ['SENT', 'REPLIED', 'CALL_BOOKED', 'PROPOSAL_SENT', 'SIGNED', 'NEXT_YEAR', 'PASSED']

function fmtDate(s?: string | null) {
  return s ? new Date(s).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''
}

export default function WhoPane({
  company, contact, researching, canResearch,
  onResearch, onStage, onSaveNotes, onAddContact, onSelectContact,
}: {
  company: Company | null
  contact: Contact | null
  researching: boolean
  canResearch: boolean
  onResearch: (force: boolean) => void
  onStage: (stage: DealStage) => void
  onSaveNotes: (notes: string) => void
  onAddContact: (c: { firstName: string; lastName: string; email: string; title: string }) => Promise<void>
  onSelectContact: (id: string) => void
}) {
  const [notes, setNotes] = useState(company?.notes || '')
  const [adding, setAdding] = useState(false)
  const [nc, setNc] = useState({ firstName: '', lastName: '', email: '', title: '' })
  const [allResearch, setAllResearch] = useState(false)
  useEffect(() => { setNotes(company?.notes || ''); setAdding(false); setAllResearch(false) }, [company?.id, company?.notes])

  if (!company) return <aside className="hidden lg:block w-[300px] shrink-0" />

  const r = contact?.research
  const hooks = [...(r?.personInfo || []).slice(0, 2), ...(r?.companyInfo || []).slice(0, 2)].slice(0, 3)
  const touches = (company.touches || []).slice(0, 8)

  return (
    <aside className="w-full lg:w-[300px] shrink-0 overflow-y-auto flex flex-col gap-2 text-sm">
      {/* Who */}
      <section className="rounded-lg border border-border-gray bg-white px-3.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[15px] font-bold truncate">{contact ? `${contact.firstName} ${contact.lastName}`.trim() : 'Nobody on file'}</div>
            <div className="text-xs text-off-black/60">{contact?.title || r?.title || ''}{(contact?.title || r?.title) ? ' · ' : ''}{company.name}</div>
            <div className="flex items-center gap-2 mt-1.5">
              {company.tier && <span className="text-[11px] px-2 py-0.5 rounded-full bg-subtle-gray border border-border-gray text-off-black/60">{company.tier}</span>}
              {company.runnerCount != null && <span className="text-[11px] text-off-black/50 tabular-nums">{company.runnerCount.toLocaleString()} runners</span>}
              {contact?.linkedinUrl && (
                <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-off-black/60 hover:text-off-black inline-flex items-center gap-0.5">LinkedIn <ExternalLink className="w-3 h-3" /></a>
              )}
            </div>
          </div>
          {company.contacts.length > 1 && (
            <select value={contact?.id || ''} onChange={e => onSelectContact(e.target.value)} className="text-xs bg-transparent text-off-black/60 focus:outline-none shrink-0">
              {company.contacts.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </select>
          )}
        </div>
        {contact?.emailSource === 'guessed' && <p className="mt-2 text-[11.5px] text-amber-700">This address was guessed, not found. Confirm it before sending.</p>}
        <div className="flex items-center gap-1 mt-2 -ml-2">
          {!adding && <button onClick={() => setAdding(true)} className={btnGhost}><Plus className="w-3.5 h-3.5" /> Contact</button>}
          {contact && (
            <button onClick={() => onResearch(Boolean(r))} disabled={researching || !canResearch} className={btnGhost} title={canResearch ? '' : 'Turn AI on in Settings to research'}>
              {researching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} {r ? 'Research again' : 'Research'}
            </button>
          )}
        </div>
        {adding && (
          <form className="mt-2 grid grid-cols-2 gap-1.5" onSubmit={async e => { e.preventDefault(); await onAddContact(nc); setNc({ firstName: '', lastName: '', email: '', title: '' }); setAdding(false) }}>
            <input placeholder="First" value={nc.firstName} onChange={e => setNc(v => ({ ...v, firstName: e.target.value }))} className={inputBase} />
            <input placeholder="Last" value={nc.lastName} onChange={e => setNc(v => ({ ...v, lastName: e.target.value }))} className={inputBase} />
            <input placeholder="Email" type="email" value={nc.email} onChange={e => setNc(v => ({ ...v, email: e.target.value }))} className={`${inputBase} col-span-2`} />
            <input placeholder="Title" value={nc.title} onChange={e => setNc(v => ({ ...v, title: e.target.value }))} className={`${inputBase} col-span-2`} />
            <div className="col-span-2 flex gap-2"><button type="submit" className={btnSecondary}>Save</button><button type="button" onClick={() => setAdding(false)} className={btnGhost}>Cancel</button></div>
          </form>
        )}
      </section>

      {/* Why this person. Three hooks up front; the whole record, person and
          org with its sources, one click away. Someone who has read that Jane
          built the program for 14 years writes a better follow-up than
          someone who has not been shown it. */}
      <section className="rounded-lg border border-border-gray bg-white px-3.5 py-3">
        <div className="flex items-center justify-between">
          <span className={fieldLabel}>Why this person</span>
          {r && ((r.personInfo?.length || 0) + (r.companyInfo?.length || 0) > hooks.length || (r.sources?.length || 0) > 0) && (
            <button onClick={() => setAllResearch(o => !o)} className="text-[11px] text-off-black/50 hover:text-off-black inline-flex items-center gap-0.5 -mt-1">
              {allResearch ? 'Less' : 'Everything'} {allResearch ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          )}
        </div>
        {hooks.length ? (
          allResearch ? (
            <div className="space-y-2.5">
              {(r?.personInfo?.length || 0) > 0 && (
                <div>
                  <div className="text-[10.5px] font-mono uppercase tracking-wider text-off-black/40 mb-1">{contact?.firstName || 'Person'}</div>
                  <ul className="space-y-1.5">
                    {r!.personInfo!.map((h, i) => <li key={i} className="pl-3 relative text-[13px] text-off-black/80 leading-snug before:absolute before:left-0 before:top-[0.5em] before:w-1.5 before:h-1.5 before:rounded-full before:bg-dark-fill">{h}</li>)}
                  </ul>
                </div>
              )}
              {(r?.companyInfo?.length || 0) > 0 && (
                <div>
                  <div className="text-[10.5px] font-mono uppercase tracking-wider text-off-black/40 mb-1">{company.name}</div>
                  <ul className="space-y-1.5">
                    {r!.companyInfo!.map((h, i) => <li key={i} className="pl-3 relative text-[13px] text-off-black/80 leading-snug before:absolute before:left-0 before:top-[0.5em] before:w-1.5 before:h-1.5 before:rounded-full before:bg-off-black/30">{h}</li>)}
                  </ul>
                </div>
              )}
              {(r?.sources?.length || 0) > 0 && (
                <div>
                  <div className="text-[10.5px] font-mono uppercase tracking-wider text-off-black/40 mb-1">Sources</div>
                  <ul className="space-y-0.5">
                    {r!.sources!.map((u, i) => (
                      <li key={i} className="truncate">
                        <a href={u} target="_blank" rel="noopener noreferrer" className="text-[11.5px] text-off-black/55 hover:text-off-black inline-flex items-center gap-1 max-w-full">
                          <span className="truncate">{u.replace(/^https?:\/\/(www\.)?/, '')}</span><ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {r?.researchedAt && <p className="text-[10.5px] text-off-black/35">Researched {fmtDate(r.researchedAt)}</p>}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {hooks.map((h, i) => <li key={i} className="pl-3 relative text-[13px] text-off-black/80 leading-snug before:absolute before:left-0 before:top-[0.5em] before:w-1.5 before:h-1.5 before:rounded-full before:bg-dark-fill">{h}</li>)}
            </ul>
          )
        ) : (
          <p className="text-xs text-off-black/45">{researching ? 'Looking…' : 'Nothing on file. The opener is the line that gets the reply, so give it something true.'}</p>
        )}
      </section>

      {/* History */}
      <section className="rounded-lg border border-border-gray bg-white px-3.5 py-3">
        <span className={fieldLabel}>History</span>
        {touches.length === 0 && company.lastTouchAt && company.touchCount > 0 && (
          <p className="text-xs text-off-black/65">
            <span className="tabular-nums text-off-black/40 mr-2">{fmtDate(company.lastTouchAt)}</span>
            Last emailed · {company.touchCount} {company.touchCount === 1 ? 'touch' : 'touches'} so far
            <span className="text-off-black/40"> · from the imported record</span>
          </p>
        )}
        {touches.length ? (
          <ul className="space-y-1 text-xs">
            {touches.map(t => (
              <li key={t.id} className={`grid grid-cols-[46px_1fr] gap-2 ${t.kind === 'REPLY' ? 'text-success-green' : 'text-off-black/65'}`}>
                <span className="tabular-nums text-off-black/40">{fmtDate(t.sentAt || t.createdAt)}</span>
                <span className="truncate">
                  {t.kind === 'EMAIL_SENT' ? `Touch ${t.touchNumber} sent` : t.kind === 'EMAIL_DRAFT' ? `Touch ${t.touchNumber} drafted` : t.kind === 'REPLY' ? 'They replied' : t.kind === 'NOTE' ? 'Note' : t.kind.toLowerCase()}
                  {t.angle ? <span className="text-off-black/40"> · {t.angle}</span> : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (!company.lastTouchAt || !company.touchCount) ? <p className="text-xs text-off-black/45">No contact yet.</p> : null}
        {company.nextActionAt && !company.replyPending && (
          <p className="text-[11px] text-off-black/45 mt-2">Next: {fmtDate(company.nextActionAt)}{company.nextAction ? ` · ${company.nextAction}` : ''}</p>
        )}
      </section>

      {/* Stage */}
      <section className="rounded-lg border border-border-gray bg-white px-3.5 py-3">
        <div className="flex items-center justify-between">
          <span className={fieldLabel}>Stage</span>
          <select value={company.stage} onChange={e => onStage(e.target.value as DealStage)} className="text-[11px] bg-transparent text-off-black/50 focus:outline-none">
            {(Object.keys(STAGE_LABEL) as DealStage[]).map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[...new Set([company.stage, ...QUICK_STAGES])].map(s => (
            <button key={s} onClick={() => onStage(s)} className={`text-[11.5px] px-2.5 py-1 rounded-full border transition-colors ${s === company.stage ? 'bg-dark-fill text-white border-dark-fill' : 'border-border-gray text-off-black/60 hover:text-off-black'}`}>
              {STAGE_LABEL[s]}
            </button>
          ))}
        </div>
      </section>

      {/* Notes */}
      <section className="rounded-lg border border-border-gray bg-white px-3.5 py-3">
        <span className={fieldLabel}>Notes</span>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => { if (notes !== (company.notes || '')) onSaveNotes(notes) }} rows={4} placeholder="Anything worth remembering" className={`${inputBase} w-full resize-y text-xs`} />
        {company.website && <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-[11px] text-off-black/45 hover:text-off-black mt-1 inline-block">{company.domain || company.website}</a>}
      </section>
    </aside>
  )
}
