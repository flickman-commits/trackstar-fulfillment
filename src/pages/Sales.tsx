import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Mail, SlidersHorizontal, BarChart3, Check, RefreshCw, ExternalLink } from 'lucide-react'
import { salesApi, SalesApiError } from '@/lib/salesApi'
import { btnSecondary, btnGhost } from '@/lib/ui'
import type { Asset, Deal, DraftResult, Motion, Person, SalesStatus, Stage, TodayPayload, Variant } from '@/types/sales'
import Queue, { type QueueMode } from '@/components/sales/Queue'
import Composer from '@/components/sales/Composer'
import WhoPane from '@/components/sales/WhoPane'
import LibraryPanel from '@/components/sales/LibraryPanel'
import SettingsModal from '@/components/sales/SettingsModal'
import ProgressModal from '@/components/sales/ProgressModal'
import { useDocumentHead } from '@/lib/useDocumentHead'

/**
 * Sales: a UI over Attio for the one job of sending the emails.
 *
 * The queue on the left is read live from Attio: New Outreach is the cap's
 * worth of deals nobody has written to, Follow Ups is every deal whose next
 * touch is due. The email in the middle is drafted from Attio's fields and
 * enrichment, edited in place, and sent through your Gmail after an undo
 * window. On send, Attio gets the touch count, the next action, Reached Out,
 * and a note with the email. The right column is the person and the deal as
 * Attio has them, and the library of decks and mockups to drag onto the
 * email. Nothing about a deal is stored here.
 */

type Prepared = { draft: DraftResult; variants: Variant[]; template: boolean }
const AI_KEY = 'sales.ai'

export default function Sales() {
  useDocumentHead({ title: 'Sales · Trackstar' })
  const location = useLocation()
  const navigate = useNavigate()

  const [status, setStatus] = useState<SalesStatus | null>(null)
  const [today, setToday] = useState<TodayPayload | null>(null)
  const [todayError, setTodayError] = useState<{ message: string; code?: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<QueueMode>(() => { try { return localStorage.getItem('sales.mode') === 'followups' ? 'followups' : 'new' } catch { return 'new' } })
  const [scope, setScope] = useState<'mine' | 'all'>(() => { try { return localStorage.getItem('sales.scope') === 'all' ? 'all' : 'mine' } catch { return 'mine' } })
  const [motion, setMotion] = useState<Motion | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [personId, setPersonId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Deal | null>(null)
  const [prepared, setPrepared] = useState<Record<string, Prepared>>({})
  const [variantIndex, setVariantIndex] = useState(0)
  const [drafting, setDrafting] = useState(false)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [assets, setAssets] = useState<Asset[]>([])
  const [libraryConfigured, setLibraryConfigured] = useState(true)
  const [suggestedId, setSuggestedId] = useState<string | null>(null)
  const [attached, setAttached] = useState<Record<string, string[]>>({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [aiOn, setAiOn] = useState<boolean>(() => { try { return localStorage.getItem(AI_KEY) !== 'off' } catch { return true } })
  const [problems, setProblems] = useState<string[] | null>(null)
  const [checking, setChecking] = useState(false)
  const inFlight = useRef(new Set<string>())
  const timers = useRef<Record<string, number>>({})

  useEffect(() => { try { localStorage.setItem(AI_KEY, aiOn ? 'on' : 'off') } catch { /* ignore */ } }, [aiOn])
  useEffect(() => { try { localStorage.setItem('sales.scope', scope) } catch { /* ignore */ } }, [scope])
  useEffect(() => { try { localStorage.setItem('sales.mode', mode) } catch { /* ignore */ } }, [mode])

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
  const loadToday = useCallback(async (refresh = false) => {
    setLoading(true)
    try { setToday(await salesApi.today({ scope, motion, refresh })); setTodayError(null) }
    catch (e) { const err = e as SalesApiError; setTodayError({ message: err.message, code: err.code }) }
    finally { setLoading(false) }
  }, [scope, motion])
  const loadAssets = useCallback(async (dealId?: string | null) => {
    try { const r = await salesApi.assets(dealId || undefined); setAssets(r.assets); setLibraryConfigured(r.configured); setSuggestedId(r.suggestedId) }
    catch { /* the library is optional */ }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])
  useEffect(() => { loadToday() }, [loadToday])

  // The list I/K walks: the active pill's rows, with sent-today first on New.
  const items: Deal[] = useMemo(() => {
    if (!today) return []
    if (mode === 'new') return [...today.sentToday, ...today.newOutreach, ...today.needsContact]
    return [...today.followUps, ...today.later, ...today.exhausted]
  }, [mode, today])
  const sentIds = useMemo(() => new Set(today?.sentToday.map(d => d.id) || []), [today])

  useEffect(() => {
    if (items.length === 0) { setSelectedId(null); return }
    if (!selectedId || !items.some(d => d.id === selectedId)) {
      const first = items.find(d => !sentIds.has(d.id) && !pendingIds.has(d.id) && d.hasEmail) || items[0]
      setSelectedId(first.id)
    }
  }, [items, selectedId, sentIds, pendingIds])

  const selected = useMemo(() => items.find(d => d.id === selectedId) || null, [items, selectedId])
  const deal: Deal | null = useMemo(() => (detail && detail.id === selectedId ? { ...selected, ...detail } : selected), [detail, selected, selectedId])
  const person: Person | null = useMemo(() => {
    if (!deal) return null
    return deal.people.find(p => p.id === personId) || deal.person || deal.people[0] || null
  }, [deal, personId])

  const aiActive = aiOn && Boolean(status?.llm.configured)
  const current = selectedId ? prepared[selectedId] : undefined
  const variants = useMemo(() => current?.variants || [], [current])
  const cap = today?.cap ?? 10
  const sentCount = today?.sentTodayCount ?? 0
  const capReached = sentCount + pendingIds.size >= cap
  const gmailConnected = Boolean(status?.gmail.connected)
  const attachedAssets = useMemo(() => (selectedId ? (attached[selectedId] || []) : []).map(id => assets.find(a => a.id === id)).filter((a): a is Asset => Boolean(a)), [attached, selectedId, assets])
  const suggested = useMemo(() => assets.find(a => a.id === suggestedId) || null, [assets, suggestedId])

  /** Draft one deal: the overnight draft if there is one, else template or model. */
  const prepare = useCallback(async (d: Deal, opts: { silent: boolean; force?: boolean; personId?: string | null }) => {
    const target = (opts.personId && d.people.find(p => p.id === opts.personId)) || d.person
    if (!target?.email || d.exhausted) return
    const key = `${d.id}:${target.id}`
    if (inFlight.current.has(key)) return
    const cached = prepared[d.id]
    if (!opts.force && cached && (cached.template === !aiActive || cached.draft.source === 'prepared')) return
    inFlight.current.add(key)
    if (!opts.silent) setDrafting(true)
    try {
      const draft = await salesApi.variants(d.id, target.id, !aiActive, Boolean(opts.force))
      setPrepared(prev => ({ ...prev, [d.id]: { draft, variants: draft.variants, template: !aiActive } }))
      if (!opts.silent) { setVariantIndex(0); if (draft.warning) toast.warning(draft.warning) }
    } catch (e) {
      if (!opts.silent) toast.error(`Drafting failed: ${(e as Error).message}`)
    } finally {
      if (!opts.silent) setDrafting(false)
      inFlight.current.delete(key)
    }
  }, [prepared, aiActive])

  // On selection: the full deal (history), the draft, the library's pick, and the next one quietly.
  useEffect(() => {
    if (!selected) { setDetail(null); return }
    let cancelled = false
    setVariantIndex(0)
    setPersonId(null)
    salesApi.deal(selected.id).then(r => { if (!cancelled) setDetail(r.deal) }).catch(() => {})
    loadAssets(selected.id)
    if (!sentIds.has(selected.id)) {
      prepare(selected, { silent: false }).then(() => {
        if (cancelled) return
        const idx = items.findIndex(d => d.id === selected.id)
        const next = items.slice(idx + 1).find(d => !sentIds.has(d.id) && !pendingIds.has(d.id) && d.hasEmail)
        if (next) prepare(next, { silent: true })
      })
    }
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, status, aiActive])

  const moveTo = useCallback((delta: number) => {
    if (!items.length) return
    const idx = Math.max(0, items.findIndex(d => d.id === selectedId))
    const next = items[Math.min(items.length - 1, Math.max(0, idx + delta))]
    if (next) setSelectedId(next.id)
  }, [items, selectedId])

  const advance = useCallback((fromId: string) => {
    const idx = items.findIndex(d => d.id === fromId)
    const ok = (d: Deal) => d.id !== fromId && !sentIds.has(d.id) && !pendingIds.has(d.id) && d.hasEmail
    const next = items.slice(idx + 1).find(ok) || items.find(ok)
    setSelectedId(next ? next.id : null)
  }, [items, sentIds, pendingIds])

  const checkDraft = useCallback(async () => {
    const v = variants[variantIndex]
    if (!deal || !v) { setProblems(null); return }
    setChecking(true)
    try { setProblems((await salesApi.check({ dealId: deal.id, subject: v.subject, body: v.body })).problems) }
    catch { setProblems(null) }
    finally { setChecking(false) }
  }, [deal, variants, variantIndex])
  useEffect(() => { setProblems(null) }, [deal?.id, variantIndex])

  const noteSync = (sync?: { ok: boolean; skipped?: string; error?: string }) => {
    if (!sync || sync.ok) return
    toast.warning(`Sent, but Attio was not updated: ${sync.error || sync.skipped || 'unknown reason'}. The overnight upkeep will reconcile it.`, { duration: 10000 })
  }

  /** Send, after an undo window. Selection moves on immediately so the rhythm holds. */
  const send = useCallback(() => {
    const v = variants[variantIndex]
    if (!deal || !person?.email || !v || pendingIds.has(deal.id)) return
    if (!gmailConnected) { toast.error('Connect Gmail in Settings to send.'); return }
    if (capReached) { toast.error(`That is ${cap} for today. Raise the cap in Settings if you mean to.`); return }
    if (problems && problems.length) { toast.error(problems[0]); return }
    const assetIds = attachedAssets.map(a => a.id)
    const payload = { dealId: deal.id, personId: person.id, subject: v.subject, body: v.body, assetIds }
    const id = deal.id
    const first = person.firstName || person.fullName
    const undo = today?.undoSeconds ?? 10

    setPendingIds(prev => new Set(prev).add(id))
    advance(id)

    const fire = async () => {
      try {
        const r = await salesApi.send(payload)
        toast.success(`Sent to ${first}`)
        noteSync(r.sync)
        setPrepared(prev => { const n = { ...prev }; delete n[id]; return n })
        setAttached(prev => { const n = { ...prev }; delete n[id]; return n })
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
            toast.message(`Held. ${first} is back in the queue.`)
          },
        },
      })
    } else {
      fire()
    }
  }, [variants, variantIndex, deal, person, pendingIds, gmailConnected, capReached, cap, attachedAssets, today?.undoSeconds, advance, loadToday, problems])

  const skip = useCallback(async (reason?: string) => {
    if (!deal) return
    try { await salesApi.skip(deal.id, reason); toast.message(`${deal.name} moved to tomorrow`); advance(deal.id); loadToday() }
    catch (e) { toast.error((e as Error).message) }
  }, [deal, advance, loadToday])

  const setStage = useCallback(async (stage: Stage) => {
    if (!deal) return
    setBusy(true)
    try {
      const r = await salesApi.setStage(deal.id, stage)
      setDetail(r.deal); toast.success(`${deal.name}: ${stage} in Attio`)
      if (!['Not Contacted', 'Needs Enrichment', 'Reached Out'].includes(stage)) { advance(deal.id); loadToday(true) }
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }, [deal, advance, loadToday])

  const addNote = useCallback(async (text: string) => {
    if (!deal) return
    setBusy(true)
    try { await salesApi.addNote(deal.id, text); toast.success('Noted in Attio') }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }, [deal])

  // Keyboard: I/K deals, J/L variants, ⌘↵ send, S skip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send(); return }
      const t = e.target as HTMLElement
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable) return
      if (settingsOpen || progressOpen) return
      switch (e.key.toLowerCase()) {
        case 'i': e.preventDefault(); moveTo(-1); break
        case 'k': e.preventDefault(); moveTo(1); break
        case 'j': e.preventDefault(); setVariantIndex(i => Math.max(0, i - 1)); break
        case 'l': e.preventDefault(); setVariantIndex(i => Math.min(variants.length - 1, i + 1)); break
        case 's': e.preventDefault(); skip(); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [send, skip, setStage, moveTo, variants.length, settingsOpen, progressOpen])

  const updateVariant = (v: Variant) => {
    if (!selectedId || !current) return
    const next = current.variants.slice(); next[variantIndex] = v
    setPrepared(prev => ({ ...prev, [selectedId]: { ...current, variants: next } }))
  }
  const rewrite = () => { if (deal) prepare(deal, { silent: false, force: true, personId }) }
  const revise = async (instruction: string) => {
    const v = variants[variantIndex]
    if (!deal || !v) return
    try {
      const r = await salesApi.revise({ dealId: deal.id, subject: v.subject, body: v.body, instruction })
      updateVariant({ subject: r.subject, body: r.body })
      setProblems(null)
    } catch (e) { toast.error((e as Error).message) }
  }
  const attach = (a: Asset) => {
    if (!selectedId) return
    setAttached(prev => ({ ...prev, [selectedId]: [...new Set([...(prev[selectedId] || []), a.id])] }))
  }
  const detach = (id: string) => {
    if (!selectedId) return
    setAttached(prev => ({ ...prev, [selectedId]: (prev[selectedId] || []).filter(x => x !== id) }))
  }

  const isSent = Boolean(selectedId && sentIds.has(selectedId))
  const queueClear = today && (mode === 'new' ? today.newOutreach.length === 0 : today.followUps.length === 0) && pendingIds.size === 0

  return (
    <div className="min-h-screen lg:h-screen flex flex-col px-4 md:px-6 py-4 max-w-[1700px]">
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
              <span><b className="text-off-black tabular-nums">{today.followUps.length}</b> follow-ups due</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select value={motion || ''} onChange={e => setMotion((e.target.value || null) as Motion | null)} className="text-xs bg-transparent text-off-black/60 focus:outline-none" title="One motion only">
            <option value="">All motions</option><option value="Race">Race</option><option value="Charity">Charity</option><option value="Corporate">Corporate</option>
          </select>
          <button onClick={() => loadToday(true)} className={btnGhost} title="Re-read Attio"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /></button>
          <button onClick={() => setProgressOpen(true)} className={btnGhost}><BarChart3 className="w-3.5 h-3.5" /> Progress</button>
          <button onClick={() => setSettingsOpen(true)} className={btnGhost} title="Settings"><SlidersHorizontal className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {status && !status.gmail.connected && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 mb-3 text-[13px] text-amber-800">
          <span><Mail className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Connect your Gmail to send from here.</span>
          <a href={salesApi.gmailConnectUrl} className={btnSecondary}>Connect Gmail</a>
        </div>
      )}
      {todayError && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 mb-3 text-[13px] text-red-800">
          <span>{todayError.code === 'attio_not_configured' ? 'Attio is not connected, so there is no queue to show.' : todayError.code === 'not_a_rep' ? todayError.message : `Could not read the queue: ${todayError.message}`}</span>
          <button onClick={() => setSettingsOpen(true)} className={btnSecondary}>Settings</button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3">
        <Queue mode={mode} onMode={setMode} scope={scope} onScope={setScope} today={today} pendingSendIds={pendingIds} selectedId={selectedId} onSelect={setSelectedId} loading={loading} />

        {queueClear && !selected ? (
          <div className="flex-1 min-w-0 flex items-center justify-center rounded-lg border border-border-gray bg-white min-h-[320px]">
            <div className="text-center max-w-[44ch] px-6">
              <Check className="w-8 h-8 mx-auto text-success-green mb-2" />
              <div className="text-xl font-semibold">{mode === 'new' ? `New outreach is done. ${sentCount} sent today.` : 'No follow-ups due.'}</div>
              <p className="text-sm text-off-black/60 mt-2">
                {mode === 'new'
                  ? (sentCount >= cap ? 'That is the cap. ' : '') + (today?.followUps.length ? `${today.followUps.length} follow-ups are waiting on the other pill.` : 'Tomorrow\'s batch is read from Attio overnight.')
                  : today?.later.length ? `${today.later.length} coming up this week.` : 'Nothing on the clock.'}
              </p>
            </div>
          </div>
        ) : isSent && selected ? (
          <div className="flex-1 min-w-0 flex items-center justify-center rounded-lg border border-border-gray bg-white min-h-[320px]">
            <div className="text-center px-6">
              <Check className="w-6 h-6 mx-auto text-success-green mb-2" />
              <div className="text-base font-semibold">Sent{selected.sentAt ? ` at ${new Date(selected.sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</div>
              <p className="text-sm text-off-black/60 mt-1">The next touch is on the clock in Attio. It comes back under Follow Ups when it is due.</p>
              {selected.webUrl && <a href={selected.webUrl} target="_blank" rel="noopener noreferrer" className={`${btnGhost} mt-2`}>Open in Attio <ExternalLink className="w-3 h-3" /></a>}
            </div>
          </div>
        ) : (
          <Composer
            deal={deal} person={person} draft={current?.draft || null}
            variants={variants} index={Math.min(variantIndex, Math.max(0, variants.length - 1))}
            drafting={drafting} gmailConnected={gmailConnected} aiActive={aiActive}
            canSend={gmailConnected && !capReached} capReached={capReached}
            problems={problems} checking={checking} onCheck={checkDraft}
            attachments={attachedAssets} onAttach={attach} onDetach={detach} suggested={suggested}
            onChange={updateVariant}
            onPrev={() => setVariantIndex(i => Math.max(0, i - 1))} onNext={() => setVariantIndex(i => Math.min(variants.length - 1, i + 1))}
            onRewrite={rewrite} onRevise={revise} onSend={send} onSkip={skip}
          />
        )}

        <aside className="w-full lg:w-[320px] shrink-0 overflow-y-auto flex flex-col gap-2 min-h-0">
          <WhoPane
            deal={deal} person={person} busy={busy}
            onStage={setStage} onNote={addNote}
            onSelectPerson={id => { setPersonId(id); if (deal) { setPrepared(prev => { const n = { ...prev }; delete n[deal.id]; return n }); prepare(deal, { silent: false, force: true, personId: id }) } }}
          />
          <LibraryPanel assets={assets} configured={libraryConfigured} attachedIds={new Set(attachedAssets.map(a => a.id))} onAttach={attach} onChanged={() => loadAssets(selectedId)} />
        </aside>
      </div>

      {settingsOpen && <SettingsModal status={status} aiOn={aiOn} onAiChange={setAiOn} onClose={() => { setSettingsOpen(false); loadStatus(); loadToday() }} />}
      {progressOpen && <ProgressModal scope={scope} onClose={() => setProgressOpen(false)} />}
    </div>
  )
}
