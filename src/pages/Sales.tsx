import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Upload, Mail, SlidersHorizontal, BarChart3, Check } from 'lucide-react'
import { salesApi } from '@/lib/salesApi'
import { btnSecondary, btnGhost } from '@/lib/ui'
import { STAGE_LABEL, type Company, type Contact, type DraftResult, type Mockup, type SalesStatus, type StackItem, type TodayPayload, type Variant, type DealStage } from '@/types/sales'
import TodayStack, { type StackMode } from '@/components/sales/TodayStack'
import Composer from '@/components/sales/Composer'
import WhoPane from '@/components/sales/WhoPane'
import ImportModal from '@/components/sales/ImportModal'
import MockupsModal from '@/components/sales/MockupsModal'
import SettingsModal from '@/components/sales/SettingsModal'
import ProgressModal from '@/components/sales/ProgressModal'
import { useDocumentHead } from '@/lib/useDocumentHead'

/**
 * Sales: the morning.
 *
 * One number at the top (sent today, of the cap), today's stack on the left
 * with replies first, the email in the middle, the person on the right.
 * Cmd+Enter sends through your Gmail after a short undo window and moves you
 * to the next one. When the stack is empty the page says so and stops.
 *
 * The cap, the signature, the undo window and what "today" means are all
 * settings; nothing on this page hard-codes ten.
 */

type Prepared = { draft: DraftResult; variants: Variant[]; template: boolean }
const AI_KEY = 'sales.ai'

export default function Sales() {
  useDocumentHead({ title: 'Sales · Trackstar' })
  const location = useLocation()
  const navigate = useNavigate()

  const [status, setStatus] = useState<SalesStatus | null>(null)
  const [today, setToday] = useState<TodayPayload | null>(null)
  const [mode, setMode] = useState<StackMode>('today')
  const [q, setQ] = useState('')
  const [view, setView] = useState<'all' | `stage:${DealStage}`>('all')
  const [all, setAll] = useState<Company[]>([])
  const [allLoading, setAllLoading] = useState(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [contactId, setContactId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Company | null>(null)
  const [prepared, setPrepared] = useState<Record<string, Prepared>>({})
  const [variantIndex, setVariantIndex] = useState(0)
  const [drafting, setDrafting] = useState(false)
  const [researching, setResearching] = useState(false)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [mockups, setMockups] = useState<Mockup[]>([])
  const [mockupId, setMockupId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [mockupsOpen, setMockupsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)
  const [aiOn, setAiOn] = useState<boolean>(() => { try { return localStorage.getItem(AI_KEY) !== 'off' } catch { return true } })
  const inFlight = useRef(new Set<string>())
  const timers = useRef<Record<string, number>>({})

  useEffect(() => { try { localStorage.setItem(AI_KEY, aiOn ? 'on' : 'off') } catch { /* ignore */ } }, [aiOn])

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
  const loadToday = useCallback(async () => {
    try { setToday(await salesApi.today()) } catch (e) { toast.error((e as Error).message) }
  }, [])
  const loadAll = useCallback(async () => {
    setAllLoading(true)
    try { setAll((await salesApi.list({ pipeline: 'all', view, q })).companies) } catch (e) { toast.error((e as Error).message) }
    finally { setAllLoading(false) }
  }, [view, q])

  // First load: ask Gmail who has written back, then build the morning.
  useEffect(() => {
    loadStatus()
    salesApi.checkReplies()
      .then(r => { if (r.newReplies.length) toast.success(`${r.newReplies.length} new ${r.newReplies.length === 1 ? 'reply' : 'replies'}: ${r.newReplies.join(', ')}`) })
      .catch(() => {})
      .finally(loadToday)
  }, [loadStatus, loadToday])
  useEffect(() => { if (mode === 'all') loadAll() }, [mode, loadAll])

  // The list I/K walks: replies, then the stack, then what already went out.
  const items: (StackItem | Company)[] = useMemo(() => {
    if (mode === 'all') return all
    if (!today) return []
    return [...today.replies, ...today.stack, ...today.sentToday]
  }, [mode, all, today])

  const sentIds = useMemo(() => new Set(today?.sentToday.map(c => c.id) || []), [today])

  // Keep a selection that exists; default to the first thing to act on.
  useEffect(() => {
    if (items.length === 0) { setSelectedId(null); return }
    if (!selectedId || !items.some(c => c.id === selectedId)) {
      const first = items.find(c => !sentIds.has(c.id) && !pendingIds.has(c.id)) || items[0]
      setSelectedId(first.id)
    }
  }, [items, selectedId, sentIds, pendingIds])

  const selected = useMemo(() => items.find(c => c.id === selectedId) || null, [items, selectedId])
  // The stack row plus its full detail (history, all contacts) once loaded.
  const company: Company | null = useMemo(
    () => (detail && detail.id === selectedId ? { ...selected, ...detail, contacts: detail.contacts } as Company : selected),
    [detail, selected, selectedId],
  )
  const contact: Contact | null = useMemo(() => {
    if (!company) return null
    return company.contacts.find(c => c.id === contactId) || company.contacts.find(c => c.email) || company.contacts[0] || null
  }, [company, contactId])

  const aiActive = aiOn && Boolean(status?.llm.configured)
  const current = selectedId ? prepared[selectedId] : undefined
  const variants = useMemo(() => current?.variants || [], [current])
  const cap = today?.cap ?? 10
  const sentCount = today?.sentTodayCount ?? 0
  const capReached = sentCount + pendingIds.size >= cap
  const gmailConnected = Boolean(status?.gmail.connected)

  /** Research (only when AI is on and nothing was prepared) and draft one org. */
  const prepare = useCallback(async (c: Company, opts: { silent: boolean; force?: boolean; contactId?: string | null; fresh?: boolean }) => {
    const target = (opts.contactId && c.contacts.find(x => x.id === opts.contactId)) || c.contacts.find(x => x.email) || c.contacts[0]
    if (!target?.email || c.replyPending) return
    const key = `${c.id}:${target.id}`
    if (inFlight.current.has(key)) return
    const cached = prepared[c.id]
    if (!opts.force && cached && cached.template === !aiActive) return
    inFlight.current.add(key)
    try {
      if (aiActive && !target.research && status?.research.configured && !c.hasProposedDraft) {
        if (!opts.silent) setResearching(true)
        try {
          const r = await salesApi.research(target.id)
          setDetail(prev => prev && prev.id === c.id ? { ...prev, contacts: prev.contacts.map(k => k.id === target.id ? r.contact : k) } : prev)
        } catch (e) { if (!opts.silent) toast.error(`Research failed: ${(e as Error).message}`) }
        finally { if (!opts.silent) setResearching(false) }
      }
      if (!opts.silent) setDrafting(true)
      try {
        const draft = await salesApi.variants(c.id, target.id, !aiActive, Boolean(opts.fresh))
        setPrepared(prev => ({ ...prev, [c.id]: { draft, variants: draft.variants, template: !aiActive } }))
        if (!opts.silent) { setVariantIndex(0); if (draft.warning) toast.warning(draft.warning) }
      } catch (e) { if (!opts.silent) toast.error(`Drafting failed: ${(e as Error).message}`) }
      finally { if (!opts.silent) setDrafting(false) }
    } finally {
      inFlight.current.delete(key)
    }
  }, [prepared, status, aiActive])

  // On selection: full detail (history), the draft, and the next one quietly.
  useEffect(() => {
    if (!selected) { setDetail(null); return }
    let cancelled = false
    setVariantIndex(0)
    setContactId(null)
    salesApi.company(selected.id).then(r => { if (!cancelled) setDetail(r.company) }).catch(() => {})
    salesApi.mockups(selected.id).then(r => { if (!cancelled) { setMockups(r.mockups); setMockupId(r.selectedId) } }).catch(() => {})
    if (!sentIds.has(selected.id)) {
      prepare(selected, { silent: false }).then(() => {
        if (cancelled) return
        const idx = items.findIndex(c => c.id === selected.id)
        const next = items.slice(idx + 1).find(c => !sentIds.has(c.id) && !pendingIds.has(c.id))
        if (next) prepare(next, { silent: true })
      })
    }
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, status, aiActive])

  const moveTo = useCallback((delta: number) => {
    if (!items.length) return
    const idx = Math.max(0, items.findIndex(c => c.id === selectedId))
    const next = items[Math.min(items.length - 1, Math.max(0, idx + delta))]
    if (next) setSelectedId(next.id)
  }, [items, selectedId])

  /** After acting on the current one, land on the next thing to do. */
  const advance = useCallback((fromId: string) => {
    const idx = items.findIndex(c => c.id === fromId)
    const next = items.slice(idx + 1).find(c => c.id !== fromId && !sentIds.has(c.id) && !pendingIds.has(c.id))
      || items.find(c => c.id !== fromId && !sentIds.has(c.id) && !pendingIds.has(c.id))
    setSelectedId(next ? next.id : null)
  }, [items, sentIds, pendingIds])

  const patchCompany = (updated: Company) => {
    setDetail(prev => prev && prev.id === updated.id ? { ...prev, ...updated, contacts: updated.contacts || prev.contacts } : prev)
    setAll(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated, contacts: updated.contacts || c.contacts } : c))
  }
  const noteSync = (sync?: { target: string | null; ok: boolean; skipped?: string; error?: string }) => {
    if (!sync || sync.ok || !sync.target) return
    toast.warning(`${sync.target === 'notion' ? 'Notion' : 'ClickUp'} was not updated: ${sync.error || sync.skipped || 'unknown reason'}`)
  }

  /** Send, after an undo window. Selection moves on immediately so the rhythm holds. */
  const send = useCallback(() => {
    const v = variants[variantIndex]
    if (!company || !contact?.email || !v || pendingIds.has(company.id)) return
    if (!gmailConnected) { toast.error('Connect Gmail in Settings to send.'); return }
    if (capReached) { toast.error(`That is ${cap} for today. Raise the cap in Settings if you mean to.`); return }
    if (contact.emailSource === 'guessed') { toast.error('This address was guessed. Confirm it before sending.'); return }
    const payload = { companyId: company.id, contactId: contact.id, subject: v.subject, body: v.body, mockupId: mockupId || undefined }
    const id = company.id
    const first = contact.firstName
    const undo = today?.undoSeconds ?? 10

    setPendingIds(prev => new Set(prev).add(id))
    advance(id)

    const fire = async () => {
      try {
        const r = await salesApi.send(payload)
        toast.success(`Sent to ${first}`)
        noteSync(r.sync)
        setPrepared(prev => { const n = { ...prev }; delete n[id]; return n })
      } catch (e) {
        toast.error(`Not sent to ${first}: ${(e as Error).message}`, { duration: 8000 })
        setSelectedId(id)
      } finally {
        setPendingIds(prev => { const n = new Set(prev); n.delete(id); return n })
        delete timers.current[id]
        loadToday()
      }
    }

    if (undo > 0) {
      timers.current[id] = window.setTimeout(fire, undo * 1000)
      toast(`Sending to ${first} in ${undo}s`, {
        duration: undo * 1000,
        action: {
          label: 'Undo',
          onClick: () => {
            window.clearTimeout(timers.current[id]); delete timers.current[id]
            setPendingIds(prev => { const n = new Set(prev); n.delete(id); return n })
            setSelectedId(id)
            toast.message(`Held. ${first} is back in the stack.`)
          },
        },
      })
    } else {
      fire()
    }
  }, [variants, variantIndex, company, contact, pendingIds, gmailConnected, capReached, cap, mockupId, today?.undoSeconds, advance, loadToday])

  const skip = useCallback(async () => {
    if (!company) return
    try { await salesApi.skip(company.id); toast.message(`${company.name} moved to tomorrow`); advance(company.id); loadToday() }
    catch (e) { toast.error((e as Error).message) }
  }, [company, advance, loadToday])

  const setStage = useCallback(async (stage: DealStage) => {
    if (!company) return
    try {
      const r = await salesApi.setStage(company.id, stage)
      patchCompany(r.company); toast.success(`${company.name}: ${STAGE_LABEL[stage]}`); noteSync(r.sync)
      if (['NOT_INTERESTED', 'PASSED', 'NEXT_YEAR', 'SIGNED'].includes(stage)) { advance(company.id); loadToday() }
    } catch (e) { toast.error((e as Error).message) }
  }, [company, advance, loadToday])

  // Keyboard: I/K people, J/L variants, ⌘↵ send, S skip, X not interested.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send(); return }
      const t = e.target as HTMLElement
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable) return
      if (importOpen || mockupsOpen || settingsOpen || progressOpen) return
      switch (e.key.toLowerCase()) {
        case 'i': e.preventDefault(); moveTo(-1); break
        case 'k': e.preventDefault(); moveTo(1); break
        case 'j': e.preventDefault(); setVariantIndex(i => Math.max(0, i - 1)); break
        case 'l': e.preventDefault(); setVariantIndex(i => Math.min(variants.length - 1, i + 1)); break
        case 's': e.preventDefault(); skip(); break
        case 'x': e.preventDefault(); setStage('NOT_INTERESTED'); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [send, skip, setStage, moveTo, variants.length, importOpen, mockupsOpen, settingsOpen, progressOpen])

  const updateVariant = (v: Variant) => {
    if (!selectedId || !current) return
    const next = current.variants.slice(); next[variantIndex] = v
    setPrepared(prev => ({ ...prev, [selectedId]: { ...current, variants: next } }))
  }
  const rewrite = () => { if (company) prepare(company, { silent: false, force: true, contactId, fresh: true }) }
  const saveNotes = async (notes: string) => { if (!company) return; try { patchCompany((await salesApi.update(company.id, { notes })).company) } catch (e) { toast.error((e as Error).message) } }
  const addContact = async (c: { firstName: string; lastName: string; email: string; title: string }) => {
    if (!company) return
    try {
      const r = await salesApi.saveContact(company.id, c)
      const contacts = [...company.contacts, r.contact]
      patchCompany({ ...company, contacts }); setContactId(r.contact.id)
      setPrepared(prev => { const n = { ...prev }; delete n[company.id]; return n })
      prepare({ ...company, contacts }, { silent: false, force: true, contactId: r.contact.id })
      loadToday()
    } catch (e) { toast.error((e as Error).message) }
  }
  const research = async (force: boolean) => {
    if (!contact || !company) return
    if (!aiActive) { toast.error('Turn AI on in Settings to research.'); return }
    setResearching(true)
    try {
      const r = await salesApi.research(contact.id, force)
      const contacts = company.contacts.map(k => k.id === contact.id ? r.contact : k)
      patchCompany({ ...company, contacts })
    } catch (e) { toast.error((e as Error).message) }
    finally { setResearching(false) }
  }

  const isSent = Boolean(selectedId && sentIds.has(selectedId))
  const doneForToday = mode === 'today' && today && today.stack.length === 0 && today.replies.length === 0 && pendingIds.size === 0

  return (
    <div className="min-h-screen lg:h-screen flex flex-col px-4 md:px-6 py-4 max-w-[1600px]">
      {/* The one number */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 mb-3">
        <div className="flex items-center gap-4 flex-wrap">
          <h1 className="text-xl font-semibold text-off-black">Sales</h1>
          <div className="flex items-center gap-3">
            <span className="text-xl font-semibold tabular-nums">{sentCount}<span className="text-[13px] font-medium text-off-black/55 ml-1.5">of {cap} sent today</span></span>
            <span className="flex gap-[3px]" aria-label={`${sentCount} of ${cap} sent`}>
              {Array.from({ length: cap }).map((_, i) => (
                <span key={i} className={`block w-[14px] h-[7px] rounded-[3px] ${i < sentCount ? 'bg-dark-fill' : i < sentCount + pendingIds.size ? 'bg-amber-400' : 'bg-border-gray'}`} />
              ))}
            </span>
          </div>
          {today && (
            <span className="text-[12.5px] text-off-black/55 flex gap-3">
              <span>This week <b className="text-off-black tabular-nums">{today.counts.week.sent}</b> sent</span>
              <span><b className="text-off-black tabular-nums">{today.counts.week.replies}</b> replies</span>
              <span><b className="text-off-black tabular-nums">{today.counts.week.calls}</b> calls</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setProgressOpen(true)} className={btnGhost}><BarChart3 className="w-3.5 h-3.5" /> Progress</button>
          <button onClick={() => setImportOpen(true)} className={btnGhost}><Upload className="w-3.5 h-3.5" /> Import</button>
          <button onClick={() => setSettingsOpen(true)} className={btnGhost} title="Settings"><SlidersHorizontal className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {status && !status.gmail.connected && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 mb-3 text-[13px] text-amber-800">
          <span><Mail className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Connect your Gmail to send from here.</span>
          <a href={salesApi.gmailConnectUrl} className={btnSecondary}>Connect Gmail</a>
        </div>
      )}
      {status?.gmail.connected && status.gmail.canReadReplies === false && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border-gray bg-white px-3 py-2 mb-3 text-[12.5px] text-off-black/65">
          <span>Reconnect Gmail once so the app can see who has replied. It only reads sender and date on your own threads.</span>
          <a href={salesApi.gmailConnectUrl} className={btnSecondary}>Reconnect</a>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3">
        <TodayStack
          mode={mode} onMode={setMode}
          replies={today?.replies || []} stack={today?.stack || []} sentToday={today?.sentToday || []}
          pendingSendIds={pendingIds}
          overnight={today?.overnight || null}
          counts={today?.counts || null}
          selectedId={selectedId} onSelect={setSelectedId}
          allCompanies={all} allLoading={allLoading} q={q} onQ={setQ} view={view} onView={setView}
        />

        {doneForToday && !selected ? (
          <div className="flex-1 min-w-0 flex items-center justify-center rounded-lg border border-border-gray bg-white min-h-[320px]">
            <div className="text-center max-w-[44ch] px-6">
              <Check className="w-8 h-8 mx-auto text-success-green mb-2" />
              <div className="text-xl font-semibold">{sentCount ? `Done for today. ${sentCount} sent.` : 'Nothing to send today.'}</div>
              <p className="text-sm text-off-black/60 mt-2">{sentCount >= cap ? 'That is the cap.' : 'The stack is empty.'} Tomorrow's batch arrives overnight. Replies show up here as they come in.</p>
            </div>
          </div>
        ) : isSent && selected ? (
          <div className="flex-1 min-w-0 flex items-center justify-center rounded-lg border border-border-gray bg-white min-h-[320px]">
            <div className="text-center px-6">
              <Check className="w-6 h-6 mx-auto text-success-green mb-2" />
              <div className="text-base font-semibold">Sent{(selected as StackItem).sentAt ? ` at ${new Date((selected as StackItem).sentAt as string).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</div>
              <p className="text-sm text-off-black/60 mt-1">The next follow-up is on the clock. It will come back to the stack when it is due.</p>
            </div>
          </div>
        ) : (
          <Composer
            company={company} contact={contact} draft={current?.draft || null}
            variants={variants} index={Math.min(variantIndex, Math.max(0, variants.length - 1))}
            drafting={drafting} gmailConnected={gmailConnected}
            canSend={gmailConnected && !capReached && contact?.emailSource !== 'guessed'} capReached={capReached}
            mockups={mockups} mockupId={mockupId}
            onMockupChange={id => setMockupId(id || null)} onManageMockups={() => setMockupsOpen(true)}
            onChange={updateVariant}
            onPrev={() => setVariantIndex(i => Math.max(0, i - 1))} onNext={() => setVariantIndex(i => Math.min(variants.length - 1, i + 1))}
            onRewrite={rewrite} onSend={send} onSkip={skip} onNotInterested={() => setStage('NOT_INTERESTED')}
          />
        )}

        <WhoPane
          company={company} contact={contact} researching={researching} canResearch={aiActive && Boolean(status?.research.configured)}
          onResearch={research} onStage={setStage} onSaveNotes={saveNotes} onAddContact={addContact}
          onSelectContact={id => { setContactId(id); if (company) { setPrepared(prev => { const n = { ...prev }; delete n[company.id]; return n }); prepare(company, { silent: false, force: true, contactId: id }) } }}
        />
      </div>

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onImported={() => { loadToday(); if (mode === 'all') loadAll(); setImportOpen(false) }} />}
      {mockupsOpen && <MockupsModal onClose={() => setMockupsOpen(false)} onChanged={next => { setMockups(next); setMockupId(prev => (prev && next.some(m => m.id === prev) ? prev : next[0]?.id ?? null)) }} />}
      {settingsOpen && <SettingsModal status={status} aiOn={aiOn} onAiChange={setAiOn} onClose={() => { setSettingsOpen(false); loadStatus(); loadToday() }} />}
      {progressOpen && <ProgressModal onClose={() => setProgressOpen(false)} />}
    </div>
  )
}
