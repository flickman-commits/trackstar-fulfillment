import { useEffect, useState } from 'react'
import { ExternalLink, Loader2, Search, Plus } from 'lucide-react'
import { btnSecondary, btnGhost, fieldLabel, inputBase } from '@/lib/ui'
import { STAGE_LABEL, type Company, type Contact, type DealStage } from '@/types/sales'

/**
 * The right column: what we know, and what has happened.
 *
 * Research facts sit at the top because they are what you glance at while
 * reading the draft. Company facts, notes and the touch history follow.
 */
export default function DetailPane({
  company,
  contact,
  researching,
  researchConfigured,
  onResearch,
  onStage,
  onSaveNotes,
  onAddContact,
  onSelectContact,
}: {
  company: Company | null
  contact: Contact | null
  researching: boolean
  researchConfigured: boolean
  onResearch: (force: boolean) => void
  onStage: (stage: DealStage) => void
  onSaveNotes: (notes: string) => void
  onAddContact: (c: { firstName: string; lastName: string; email: string; title: string }) => Promise<void>
  onSelectContact: (id: string) => void
}) {
  const [notes, setNotes] = useState(company?.notes || '')
  const [adding, setAdding] = useState(false)
  const [newContact, setNewContact] = useState({ firstName: '', lastName: '', email: '', title: '' })

  useEffect(() => { setNotes(company?.notes || ''); setAdding(false) }, [company?.id, company?.notes])

  if (!company) return <aside className="hidden lg:block w-[300px] xl:w-[340px] shrink-0" />

  const r = contact?.research
  const stages = Object.keys(STAGE_LABEL) as DealStage[]
  const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null)

  return (
    <aside className="hidden lg:block w-[300px] xl:w-[340px] shrink-0 overflow-y-auto pl-4 border-l border-border-gray text-sm">
      {/* Contact */}
      <section className="mb-5">
        <div className="flex items-center justify-between mb-1">
          <span className={fieldLabel}>Contact</span>
          {company.contacts.length > 1 && (
            <select
              value={contact?.id || ''}
              onChange={e => onSelectContact(e.target.value)}
              className="text-xs bg-transparent text-off-black/60 focus:outline-none"
            >
              {company.contacts.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </select>
          )}
        </div>
        {contact ? (
          <>
            <p className="font-semibold text-off-black">{contact.firstName} {contact.lastName}</p>
            <p className="text-off-black/60">{contact.title || r?.title || 'Title unknown'}</p>
            {contact.linkedinUrl && (
              <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-off-black/60 hover:text-off-black mt-1">
                LinkedIn <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <div className="mt-2">
              <button onClick={() => onResearch(Boolean(r))} disabled={researching || !researchConfigured} className={btnSecondary} title={researchConfigured ? '' : 'Set PERPLEXITY_API_KEY to enable research'}>
                {researching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                {r ? 'Research again' : 'Research'}
              </button>
            </div>
          </>
        ) : (
          <p className="text-off-black/50">Nobody on file yet.</p>
        )}
        {!adding ? (
          <button onClick={() => setAdding(true)} className={`${btnGhost} mt-2 -ml-2`}><Plus className="w-3.5 h-3.5" /> Add contact</button>
        ) : (
          <form
            className="mt-2 grid grid-cols-2 gap-1.5"
            onSubmit={async e => { e.preventDefault(); await onAddContact(newContact); setNewContact({ firstName: '', lastName: '', email: '', title: '' }); setAdding(false) }}
          >
            <input placeholder="First" value={newContact.firstName} onChange={e => setNewContact(v => ({ ...v, firstName: e.target.value }))} className={inputBase} />
            <input placeholder="Last" value={newContact.lastName} onChange={e => setNewContact(v => ({ ...v, lastName: e.target.value }))} className={inputBase} />
            <input placeholder="Email" type="email" value={newContact.email} onChange={e => setNewContact(v => ({ ...v, email: e.target.value }))} className={`${inputBase} col-span-2`} />
            <input placeholder="Title" value={newContact.title} onChange={e => setNewContact(v => ({ ...v, title: e.target.value }))} className={`${inputBase} col-span-2`} />
            <div className="col-span-2 flex gap-2">
              <button type="submit" className={btnSecondary}>Save</button>
              <button type="button" onClick={() => setAdding(false)} className={btnGhost}>Cancel</button>
            </div>
          </form>
        )}
      </section>

      {/* Research */}
      {(r?.personInfo?.length || r?.companyInfo?.length) ? (
        <section className="mb-5">
          {r.personInfo && r.personInfo.length > 0 && (
            <>
              <span className={fieldLabel}>About them</span>
              <ul className="space-y-1 mb-3">
                {r.personInfo.map((f, i) => <li key={i} className="pl-3 relative text-off-black/75 before:absolute before:left-0 before:top-[0.55em] before:w-1.5 before:h-1.5 before:rounded-full before:bg-dark-fill">{f}</li>)}
              </ul>
            </>
          )}
          {r.companyInfo && r.companyInfo.length > 0 && (
            <>
              <span className={fieldLabel}>About {company.name}</span>
              <ul className="space-y-1">
                {r.companyInfo.map((f, i) => <li key={i} className="pl-3 relative text-off-black/75 before:absolute before:left-0 before:top-[0.55em] before:w-1.5 before:h-1.5 before:rounded-full before:bg-off-black/30">{f}</li>)}
              </ul>
            </>
          )}
        </section>
      ) : contact && !researching ? (
        <p className="text-xs text-off-black/45 mb-5">No research yet.</p>
      ) : null}

      {/* Company facts */}
      <section className="mb-5">
        <span className={fieldLabel}>{company.pipeline === 'RACE' ? 'Race' : 'Organisation'}</span>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          <dt className="text-off-black/50">Stage</dt>
          <dd>
            <select value={company.stage} onChange={e => onStage(e.target.value as DealStage)} className="bg-transparent font-medium text-off-black focus:outline-none">
              {stages.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </select>
          </dd>
          {company.pipeline === 'RACE' ? (
            <>
              {company.runnerCount != null && <><dt className="text-off-black/50">Runners</dt><dd className="tabular-nums">{company.runnerCount.toLocaleString()}</dd></>}
              {company.raceDate && <><dt className="text-off-black/50">Race date</dt><dd>{fmtDate(company.raceDate)}</dd></>}
              {company.identityTags.length > 0 && <><dt className="text-off-black/50">Identity</dt><dd>{company.identityTags.join(', ')}</dd></>}
              {company.courseLandmark && <><dt className="text-off-black/50">Landmark</dt><dd>{company.courseLandmark}</dd></>}
            </>
          ) : (
            <>
              {company.tier && <><dt className="text-off-black/50">Tier</dt><dd>{company.tier}</dd></>}
              {company.units != null && <><dt className="text-off-black/50">Units</dt><dd className="tabular-nums">{company.units}</dd></>}
              {company.dealValueCents != null && <><dt className="text-off-black/50">Value</dt><dd className="tabular-nums">${(company.dealValueCents / 100).toLocaleString()}</dd></>}
            </>
          )}
          {(company.website || company.domain) && (
            <><dt className="text-off-black/50">Web</dt><dd><a href={company.website || `https://${company.domain}`} target="_blank" rel="noopener noreferrer" className="hover:underline">{company.domain || company.website}</a></dd></>
          )}
          {company.nextActionAt && <><dt className="text-off-black/50">Next</dt><dd>{fmtDate(company.nextActionAt)}{company.nextAction ? ` · ${company.nextAction}` : ''}</dd></>}
          <dt className="text-off-black/50">Source</dt><dd>{company.source}</dd>
        </dl>
      </section>

      {/* Notes */}
      <section className="mb-5">
        <span className={fieldLabel}>Notes</span>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={() => { if (notes !== (company.notes || '')) onSaveNotes(notes) }}
          rows={4}
          placeholder="Anything worth remembering"
          className={`${inputBase} w-full resize-y text-xs`}
        />
      </section>

      {/* History */}
      {company.touches && company.touches.length > 0 && (
        <section>
          <span className={fieldLabel}>History</span>
          <ul className="space-y-2">
            {company.touches.map(t => (
              <li key={t.id} className="text-xs">
                <div className="flex items-center gap-2 text-off-black/50">
                  <span>{fmtDate(t.createdAt)}</span>
                  <span className="px-1.5 py-0.5 rounded bg-subtle-gray border border-border-gray text-[10px] uppercase tracking-wide">
                    {t.kind === 'EMAIL_DRAFT' ? 'draft' : t.kind === 'EMAIL_SENT' ? 'sent' : t.kind.toLowerCase()}{t.touchNumber ? ` ${t.touchNumber}` : ''}
                  </span>
                </div>
                <div className="text-off-black/80 truncate">{t.subject || t.body}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  )
}
