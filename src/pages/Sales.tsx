import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Upload, Search, Mail, Loader2, ChevronDown } from 'lucide-react'
import { salesApi, type ListView } from '@/lib/salesApi'
import { btnSecondary, btnGhost, inputBase, segment, segmentGroup } from '@/lib/ui'
import { STAGE_LABEL, type Company, type Contact, type DraftResult, type Pipeline, type SalesStatus, type Variant, type DealStage } from '@/types/sales'
import Composer from '@/components/sales/Composer'
import DetailPane from '@/components/sales/DetailPane'
import ImportModal from '@/components/sales/ImportModal'
import { useDocumentHead } from '@/lib/useDocumentHead'

/**
 * Sales: the daily outreach queue.
 *
 * Left: who to write to today. Middle: the email, five ways. Right: what we
 * know about them. The keyboard does the work - I/K move between people, J/L
 * between variants, Cmd+Enter files the draft into Gmail and moves on.
 *
 * Research and drafting run as soon as a person is selected, and the next
 * person in the list is prepared in the background, so by the time you get
 * there the email is already waiting.
 */

type Prepared = { draft: DraftResult; variants: Variant[] }

const PIPELINE_KEY = 'sales.pipeline'
const VIEW_KEY = 'sales.view'

export default function Sales() {
  useDocumentHead({ title: 'Sales · Trackstar' })
  const location = useLocation()
  const navigate = useNavigate()

  const [pipeline, setPipeline] = useState<Pipeline | 'all'>(() => {
    try { return (localStorage.getItem(PIPELINE_KEY) as Pipeline | 'all') || 'all' } catch { return 'all' }
  })
  const [view, setView] = useState<ListView>(() => {
    try { return (localStorage.getItem(VIEW_KEY) as ListView) || 'due' } catch { return 'due' }
  })
  const [q, setQ] = useState('')
  const [companies, setCompanies] = useState<Company[]>([])
  const [counts, setCounts] = useState({ due: 0, new: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<SalesStatus | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [contactId, setContactId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Company | null>(null)
  const [prepared, setPrepared] = useState<Record<string, Prepared>>({})
  const [variantIndex, setVariantIndex] = useState(0)
  const [researching, setResearching] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [queueing, setQueueing] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const inFlight = useRef(new Set<string>())

  useEffect(() => { try { localStorage.setItem(PIPELINE_KEY, pipeline) } catch { /* ignore */ } }, [pipeline])
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view) } catch { /* ignore */ } }, [view])

  // Gmail's OAuth round trip lands back here with a flag in the query string.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const g = params.get('gmail')
    if (!g) return
    if (g === 'connected') toast.success(`Gmail connected${params.get('account') ? ` as ${params.get('account')}` : ''}`)
    else if (g === 'denied') toast.error('Gmail connection was cancelled')
    else toast.error(`Gmail connection failed: ${params.get('reason') || 'unknown error'}`)
    navigate('/sales', { replace: true })
  }, [location.search, navigate])

  const loadStatus = useCallback(() => { salesApi.status().then(setStatus).catch(() => setStatus(null)) }, [])
  useEffect(loadStatus, [loadStatus])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const r = await salesApi.list({ pipeline, view, q })
      setCompanies(r.companies)
      setCounts(r.counts)
    } catch (e) { toast.error((e as Error).message) }
    finally { setLoading(false) }
  }, [pipeline, view, q])
  useEffect(() => { loadList() }, [loadList])

  // Keep a selection that exists in the list.
  useEffect(() => {
    if (companies.length === 0) { setSelectedId(null); return }
    if (!selectedId || !companies.some(c => c.id === selectedId)) setSelectedId(companies[0].id)
  }, [companies, selectedId])

  const selected = useMemo(() => companies.find(c => c.id === selectedId) || null, [companies, selectedId])
  const company = detail && detail.id === selectedId ? detail : selected
  const contact: Contact | null = useMemo(() => {
    if (!company) return null
    return company.contacts.find(c => c.id === contactId) || company.contacts[0] || null
  }, [company, contactId])

  const current = selectedId ? prepared[selectedId] : undefined
  const variants = useMemo(() => current?.variants || [], [current])

  /** Research (if needed) and draft for one company. Silent when prefetching. */
  const prepare = useCallback(async (c: Company, opts: { silent: boolean; force?: boolean; contactId?: string | null }) => {
    const target = (opts.contactId && c.contacts.find(x => x.id === opts.contactId)) || c.contacts[0]
    if (!target?.email || !status?.llm.configured) return
    const key = `${c.id}:${target.id}`
    if (inFlight.current.has(key)) return
    if (!opts.force && prepared[c.id]) return
    inFlight.current.add(key)
    try {
      if (!target.research && status.research.configured) {
        if (!opts.silent) setResearching(true)
        try {
          const r = await salesApi.research(target.id)
          setCompanies(prev => prev.map(x => x.id === c.id ? { ...x, contacts: x.contacts.map(k => k.id === target.id ? r.contact : k) } : x))
          setDetail(prev => prev && prev.id === c.id ? { ...prev, contacts: prev.contacts.map(k => k.id === target.id ? r.contact : k) } : prev)
        } catch (e) { if (!opts.silent) toast.error(`Research failed: ${(e as Error).message}`) }
        finally { if (!opts.silent) setResearching(false) }
      }
      if (!opts.silent) setDrafting(true)
      try {
        const draft = await salesApi.variants(c.id, target.id)
        setPrepared(prev => ({ ...prev, [c.id]: { draft, variants: draft.variants } }))
        if (!opts.silent) setVariantIndex(0)
      } catch (e) { if (!opts.silent) toast.error(`Drafting failed: ${(e as Error).message}`) }
      finally { if (!opts.silent) setDrafting(false) }
    } finally {
      inFlight.current.delete(key)
    }
  }, [prepared, status])

  // On selection: load full detail (history), prepare this one, then the next one quietly.
  useEffect(() => {
    if (!selected) { setDetail(null); return }
    let cancelled = false
    setVariantIndex(0)
    setContactId(null)
    salesApi.company(selected.id).then(r => { if (!cancelled) setDetail(r.company) }).catch(() => {})
    prepare(selected, { silent: false }).then(() => {
      if (cancelled) return
      const idx = companies.findIndex(c => c.id === selected.id)
      const next = companies[idx + 1]
      if (next) prepare(next, { silent: true })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, status?.llm.configured])

  const move = useCallback((delta: number) => {
    if (!companies.length) return
    const idx = Math.max(0, companies.findIndex(c => c.id === selectedId))
    const next = companies[Math.min(companies.length - 1, Math.max(0, idx + delta))]
    if (next) setSelectedId(next.id)
  }, [companies, selectedId])

  const updateVariant = (v: Variant) => {
    if (!selectedId || !current) return
    const next = current.variants.slice()
    next[variantIndex] = v
    setPrepared(prev => ({ ...prev, [selectedId]: { ...current, variants: next } }))
  }

  const regenerate = () => { if (company) prepare(company, { silent: false, force: true, contactId }) }

  const queue = useCallback(async () => {
    const v = variants[variantIndex]
    if (!company || !contact?.email || !v || queueing) return
    setQueueing(true)
    try {
      const r = await salesApi.queue({ companyId: company.id, contactId: contact.id, subject: v.subject, body: v.body })
      toast.success(r.gmailDraft ? `Draft in Gmail for ${contact.firstName}` : `Saved. Connect Gmail to get drafts in your inbox.`)
      setPrepared(prev => { const n = { ...prev }; delete n[company.id]; return n })
      // The person leaves Due/New once a draft exists; step forward first so the selection survives the refetch.
      const idx = companies.findIndex(c => c.id === company.id)
      const next = companies[idx + 1] || companies[idx - 1]
      if (view === 'due' || view === 'new') {
        setCompanies(prev => prev.filter(c => c.id !== company.id))
        if (next) setSelectedId(next.id)
        setCounts(c => ({ ...c, [view]: Math.max(0, c[view as 'due' | 'new'] - 1) }))
      } else {
        await loadList()
      }
    } catch (e) { toast.error((e as Error).message) }
    finally { setQueueing(false) }
  }, [variants, variantIndex, company, contact, queueing, companies, view, loadList])

  // Keyboard: I/K people, J/L variants, Cmd+Enter file.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); queue(); return }
      const t = e.target as HTMLElement
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable) return
      if (importOpen) return
      switch (e.key.toLowerCase()) {
        case 'j': e.preventDefault(); setVariantIndex(i => Math.max(0, i - 1)); break
        case 'l': e.preventDefault(); setVariantIndex(i => Math.min(variants.length - 1, i + 1)); break
        case 'i': e.preventDefault(); move(-1); break
        case 'k': e.preventDefault(); move(1); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [queue, move, variants.length, importOpen])

  const patchCompany = (updated: Company) => {
    setCompanies(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated, contacts: updated.contacts || c.contacts } : c))
    setDetail(prev => prev && prev.id === updated.id ? { ...prev, ...updated, contacts: updated.contacts || prev.contacts } : prev)
  }

  const setStage = async (stage: DealStage) => {
    if (!company) return
    try { patchCompany((await salesApi.setStage(company.id, stage)).company); toast.success(`${company.name}: ${STAGE_LABEL[stage]}`) }
    catch (e) { toast.error((e as Error).message) }
  }
  const saveNotes = async (notes: string) => {
    if (!company) return
    try { patchCompany((await salesApi.update(company.id, { notes })).company) } catch (e) { toast.error((e as Error).message) }
  }
  const markSent = async () => {
    if (!company) return
    try { patchCompany((await salesApi.markSent(company.id)).company); toast.success('Marked sent') } catch (e) { toast.error((e as Error).message) }
  }
  const addContact = async (c: { firstName: string; lastName: string; email: string; title: string }) => {
    if (!company) return
    try {
      const r = await salesApi.saveContact(company.id, c)
      const contacts = [...company.contacts, r.contact]
      patchCompany({ ...company, contacts })
      setContactId(r.contact.id)
      setPrepared(prev => { const n = { ...prev }; delete n[company.id]; return n })
      prepare({ ...company, contacts }, { silent: false, force: true, contactId: r.contact.id })
    } catch (e) { toast.error((e as Error).message) }
  }
  const research = async (force: boolean) => {
    if (!contact || !company) return
    setResearching(true)
    try {
      const r = await salesApi.research(contact.id, force)
      const contacts = company.contacts.map(k => k.id === contact.id ? r.contact : k)
      patchCompany({ ...company, contacts })
      if (force) { setPrepared(prev => { const n = { ...prev }; delete n[company.id]; return n }); prepare({ ...company, contacts }, { silent: false, force: true, contactId: contact.id }) }
    } catch (e) { toast.error((e as Error).message) }
    finally { setResearching(false) }
  }

  const fmtShort = (s: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '')

  return (
    <div className="h-screen flex flex-col px-4 md:px-6 py-4 max-w-[1600px]">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-off-black">Sales</h1>
          <div className={segmentGroup}>
            <button onClick={() => setPipeline('all')} className={segment(pipeline === 'all')}>Both</button>
            <button onClick={() => setPipeline('RACE')} className={segment(pipeline === 'RACE')}>Races</button>
            <button onClick={() => setPipeline('CHARITY')} className={segment(pipeline === 'CHARITY')}>Charities</button>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {status && (
            <>
              <span className={`px-2 py-1 rounded-md border ${status.llm.configured ? 'border-border-gray text-off-black/60' : 'border-red-300 text-red-700'}`} title={status.llm.model ? `${status.llm.provider}: ${status.llm.model}` : 'Set ANTHROPIC_API_KEY or an OpenAI-compatible endpoint'}>
                {status.llm.configured ? `Model · ${status.llm.model}` : 'No model configured'}
              </span>
              <span className={`px-2 py-1 rounded-md border ${status.research.configured ? 'border-border-gray text-off-black/60' : 'border-amber-300 text-amber-700'}`} title="Perplexity">
                {status.research.configured ? 'Research on' : 'Research off'}
              </span>
              {status.gmail.connected ? (
                <button onClick={async () => { await salesApi.gmailDisconnect(); loadStatus() }} className="px-2 py-1 rounded-md border border-border-gray text-off-black/60 hover:text-off-black" title="Disconnect">
                  <Mail className="w-3 h-3 inline mr-1" />{status.gmail.email}
                </button>
              ) : (
                <a href={salesApi.gmailConnectUrl} className={btnSecondary} title={status.gmail.configured ? 'Connect your Gmail so drafts land in your inbox' : 'Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET first'} aria-disabled={!status.gmail.configured}>
                  <Mail className="w-3.5 h-3.5" /> Connect Gmail
                </a>
              )}
            </>
          )}
          <button onClick={() => setImportOpen(true)} className={btnSecondary}><Upload className="w-3.5 h-3.5" /> Import</button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex gap-4">
        {/* Queue */}
        <aside className="w-[240px] xl:w-[290px] shrink-0 flex flex-col min-h-0">
          <div className={`${segmentGroup} w-full mb-2`}>
            <button onClick={() => setView('due')} className={`${segment(view === 'due')} flex-1`}>Due <span className="opacity-60 tabular-nums">{counts.due}</span></button>
            <button onClick={() => setView('new')} className={`${segment(view === 'new')} flex-1`}>New <span className="opacity-60 tabular-nums">{counts.new}</span></button>
            <button onClick={() => setView('all')} className={`${segment(view === 'all')} flex-1`}>All <span className="opacity-60 tabular-nums">{counts.total}</span></button>
          </div>
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-off-black/40" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search" className={`${inputBase} w-full pl-8`} />
          </div>
          {view === 'all' && (
            <div className="relative mb-2">
              <select value={view} onChange={e => setView(e.target.value as ListView)} className={`${inputBase} w-full appearance-none pr-7`}>
                <option value="all">Every stage</option>
                {(Object.keys(STAGE_LABEL) as DealStage[]).map(s => <option key={s} value={`stage:${s}`}>{STAGE_LABEL[s]}</option>)}
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-off-black/40 pointer-events-none" />
            </div>
          )}
          {view.startsWith('stage:') && (
            <button onClick={() => setView('all')} className={`${btnGhost} mb-2 -ml-2`}>← {STAGE_LABEL[view.slice(6) as DealStage]} only</button>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border-gray bg-white">
            {loading && companies.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-off-black/40"><Loader2 className="w-4 h-4 animate-spin" /></div>
            ) : companies.length === 0 ? (
              <div className="p-4 text-xs text-off-black/50">
                {view === 'due' ? 'Nothing due. Try New.' : view === 'new' ? 'Nobody new with an email. Import a list.' : 'Empty.'}
              </div>
            ) : companies.map(c => {
              const primary = c.contacts[0]
              const ready = Boolean(prepared[c.id])
              const active = c.id === selectedId
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-border-gray/70 last:border-b-0 transition-colors ${active ? 'bg-dark-fill text-white' : 'hover:bg-subtle-gray'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{c.name}</span>
                    <span className={`text-[10px] uppercase tracking-wide shrink-0 ${active ? 'text-white/60' : 'text-off-black/45'}`}>{c.pipeline === 'RACE' ? 'race' : 'charity'}</span>
                  </div>
                  <div className={`flex items-center justify-between gap-2 text-xs mt-0.5 ${active ? 'text-white/70' : 'text-off-black/55'}`}>
                    <span className="truncate">{primary ? `${primary.firstName} ${primary.lastName}`.trim() : 'No contact'}{primary && !primary.email ? ' · no email' : ''}</span>
                    <span className="shrink-0 flex items-center gap-1.5">
                      {ready && <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : 'bg-success-green'}`} title="Draft ready" />}
                      {view === 'due' ? fmtShort(c.nextActionAt) : STAGE_LABEL[c.stage]}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-off-black/40 mt-2">I / K move · J / L variants · ⌘↵ file the draft</p>
        </aside>

        <Composer
          company={company}
          contact={contact}
          draft={current?.draft || null}
          variants={variants}
          index={Math.min(variantIndex, Math.max(0, variants.length - 1))}
          drafting={drafting}
          queueing={queueing}
          gmailConnected={Boolean(status?.gmail.connected)}
          onChange={updateVariant}
          onPrev={() => setVariantIndex(i => Math.max(0, i - 1))}
          onNext={() => setVariantIndex(i => Math.min(variants.length - 1, i + 1))}
          onRegenerate={regenerate}
          onQueue={queue}
          onMarkSent={markSent}
        />

        <DetailPane
          company={company}
          contact={contact}
          researching={researching}
          researchConfigured={Boolean(status?.research.configured)}
          onResearch={research}
          onStage={setStage}
          onSaveNotes={saveNotes}
          onAddContact={addContact}
          onSelectContact={id => { setContactId(id); if (company) { setPrepared(prev => { const n = { ...prev }; delete n[company.id]; return n }); prepare(company, { silent: false, force: true, contactId: id }) } }}
        />
      </div>

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onImported={() => { loadList(); setImportOpen(false) }} />}
    </div>
  )
}
