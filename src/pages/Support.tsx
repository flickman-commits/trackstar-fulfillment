import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Inbox, Keyboard, Loader2, Mail, RefreshCw, Search, X } from 'lucide-react'
import { btnGhost, btnSecondary, pageShell } from '@/lib/ui'
import { supportApi } from '@/lib/supportApi'
import { useAuth } from '@/lib/auth'
import { useDocumentHead } from '@/lib/useDocumentHead'
import type { InboxPayload, InboxSort, InboxView, InstagramStatus, Macro, MailboxStatus, Mockup, ThreadDetail, ThreadRow, ThreadStatus } from '@/types/support'
import ViewsColumn from '@/components/support/ViewsColumn'
import ConversationList from '@/components/support/ConversationList'
import Conversation from '@/components/support/Conversation'
import Details from '@/components/support/Details'
import MacrosModal from '@/components/support/MacrosModal'
import SettingsModal from '@/components/support/SettingsModal'

/**
 * Support: the shared inbox for fast@trackstar.art, laid out the way
 * Intercom lays out an inbox.
 *
 * Four columns: the views (Your inbox, Mentions, Unassigned, All, the
 * parked states, one per teammate), the conversation list for the chosen
 * view, the conversation with its reply and note composer, and the details
 * of the customer and their orders. Gmail is the system of record; this
 * page reads a mirror of it and sends replies back through it as fast@.
 * Instagram DMs to @trackstar_art arrive in the same list by webhook and
 * are answered from the same composer, as the account. Assignment, status,
 * priority, tags, snooze and notes live here and nowhere else. Every action
 * has a key; press ? for the list.
 */
const VIEW_TITLE: Record<string, string> = {
  inbox: 'Your inbox', mentions: 'Mentions', unassigned: 'Unassigned', all: 'All open',
  waiting: 'Waiting on customer', escalated: 'Escalated', snoozed: 'Snoozed', closed: 'Closed',
}
const EMPTY: Record<string, string> = {
  inbox: 'Nothing assigned to you. Take one from Unassigned.',
  mentions: 'Nobody has mentioned you.',
  unassigned: 'Everything open has an owner.',
  all: 'Inbox zero. Nobody is waiting on us.',
  waiting: 'Nothing waiting on a customer.',
  escalated: 'Nothing escalated.',
  snoozed: 'Nothing snoozed.',
  closed: 'Nothing closed yet.',
}
const POLL_MS = 60_000

const SHORTCUTS: [string, string][] = [
  ['j / k', 'Next and previous conversation'], ['r', 'Reply'], ['n', 'Add a note'], ['m', 'Insert a macro'],
  ['a', 'Assign to yourself'], ['p', 'Toggle priority'], ['c', 'Close'], ['u', 'Mark unread'],
  ['⌘↵', 'Send'], ['⌘⇧↵', 'Send and close'], ['Esc', 'Leave the composer'], ['?', 'This list'],
]

export default function Support() {
  useDocumentHead({ title: 'Support · Trackstar' })
  const { user, isAdmin } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [view, setView] = useState<InboxView>(() => { try { return (localStorage.getItem('support.view') as InboxView) || 'all' } catch { return 'all' } })
  const [sort, setSort] = useState<InboxSort>(() => { try { return (localStorage.getItem('support.sort') as InboxSort) || 'waiting' } catch { return 'waiting' } })
  const [query, setQuery] = useState('')
  const [inbox, setInbox] = useState<InboxPayload | null>(null)
  const [inboxError, setInboxError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<MailboxStatus | null>(null)
  const [instagram, setInstagram] = useState<InstagramStatus | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [thread, setThread] = useState<ThreadDetail | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [macros, setMacros] = useState<Macro[]>([])
  const [macrosOpen, setMacrosOpen] = useState(false)
  const [keysOpen, setKeysOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const replyRef = useRef<HTMLTextAreaElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const insertRef = useRef<((text: string) => void) | null>(null)
  const attachRef = useRef<((m: Mockup) => void) | null>(null)

  useEffect(() => { try { localStorage.setItem('support.view', view); localStorage.setItem('support.sort', sort) } catch { /* private mode */ } }, [view, sort])

  // Back from Google's consent screen, or from Instagram's login.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const g = params.get('gmail')
    const i = params.get('instagram')
    if (!g && !i) return
    if (g === 'connected') toast.success(`Mailbox connected as ${params.get('account') || 'the support account'}`)
    else if (g === 'denied') toast.error('Mailbox connection was cancelled')
    else if (g) toast.error(`Mailbox connection failed: ${params.get('reason') || 'unknown error'}`)
    if (i === 'connected') toast.success(`Instagram connected as ${params.get('account') || 'the Trackstar account'}`)
    else if (i === 'denied') toast.error('Instagram connection was cancelled')
    else if (i) toast.error(`Instagram connection failed: ${params.get('reason') || 'unknown error'}`)
    navigate('/support', { replace: true })
  }, [location.search, navigate])

  const loadStatus = useCallback(() => {
    supportApi.status().then(setStatus).catch(() => setStatus(null))
    supportApi.instagramStatus().then(setInstagram).catch(() => setInstagram(null))
  }, [])
  const loadMacros = useCallback(() => { supportApi.macros().then(r => setMacros(r.macros)).catch(() => {}) }, [])
  const loadInbox = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try { setInbox(await supportApi.inbox(view, sort, query)); setInboxError(null) }
    catch (e) { setInboxError((e as Error).message) }
    finally { if (!quiet) setLoading(false) }
  }, [view, sort, query])

  useEffect(() => { loadStatus(); loadMacros() }, [loadStatus, loadMacros])
  // A link from Slack or a note opens the thread it names.
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('thread')
    if (id) { openThread(id); navigate('/support', { replace: true }) }
  }, [location.search, navigate]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = window.setTimeout(() => loadInbox(), query ? 250 : 0)
    return () => window.clearTimeout(t)
  }, [loadInbox, query])
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') loadInbox(true) }, POLL_MS)
    return () => window.clearInterval(id)
  }, [loadInbox])

  const openThread = useCallback(async (id: string) => {
    setSelectedId(id)
    setThreadLoading(true)
    try {
      const t = await supportApi.thread(id)
      setThread(t)
      // Opening it read it; the row loses its dot without a round trip.
      setInbox(prev => prev ? { ...prev, threads: prev.threads.map(r => (r.id === id ? { ...r, unread: false } : r)) } : prev)
    }
    catch (e) { toast.error((e as Error).message); setThread(null) }
    finally { setThreadLoading(false) }
  }, [])

  const patchRow = (row: ThreadRow) => {
    setInbox(prev => prev ? { ...prev, threads: prev.threads.map(t => (t.id === row.id ? { ...t, ...row, unread: t.unread } : t)) } : prev)
    setThread(prev => (prev && prev.id === row.id ? { ...prev, ...row, unread: false } : prev))
  }
  const refreshThread = async (id: string) => { try { setThread(await supportApi.thread(id)) } catch { /* the list refresh will catch up */ } }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn(); loadInbox(true) }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  const assign = (assigneeId: string | null) => thread && run(async () => { patchRow(await supportApi.assign(thread.id, assigneeId)); await refreshThread(thread.id) })
  const setStatusOf = (s: ThreadStatus) => thread && run(async () => { patchRow(await supportApi.setStatus(thread.id, s)); await refreshThread(thread.id) })
  const snooze = (until: string | null) => thread && run(async () => {
    patchRow(await supportApi.snooze(thread.id, until))
    toast.success(until ? `Snoozed until ${new Date(until).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : 'Unsnoozed')
    await refreshThread(thread.id)
  })
  const setPriority = (p: boolean) => thread && run(async () => { patchRow(await supportApi.setPriority(thread.id, p)); await refreshThread(thread.id) })
  const setTags = (tags: string[]) => thread && run(async () => { patchRow(await supportApi.setTags(thread.id, tags)) })
  const markUnread = () => thread && run(async () => {
    await supportApi.markUnread(thread.id)
    setInbox(prev => prev ? { ...prev, threads: prev.threads.map(r => (r.id === thread.id ? { ...r, unread: true } : r)) } : prev)
    toast.success('Marked unread')
  })
  const reply = async (text: string, close: boolean, attachments: string[] = []) => {
    if (!thread) return false
    try {
      const fresh = await supportApi.reply(thread.id, text, close, attachments)
      setThread(fresh)
      const to = fresh.channel === 'instagram' ? `@${fresh.igUsername || 'them'} on Instagram` : fresh.customerEmail
      toast.success(close ? `Sent to ${to} and closed` : `Sent to ${to}`)
      loadInbox(true)
      return true
    } catch (e) { toast.error((e as Error).message); return false }
  }
  const addNote = async (body: string, mentions: string[]) => {
    if (!thread) return false
    try {
      const n = await supportApi.addNote(thread.id, body, mentions)
      setThread(prev => (prev && prev.id === thread.id ? { ...prev, notes: [...prev.notes, n] } : prev))
      if (mentions.length) loadInbox(true)
      return true
    } catch (e) { toast.error((e as Error).message); return false }
  }
  const deleteNote = (noteId: string) => thread && run(async () => {
    await supportApi.deleteNote(thread.id, noteId)
    setThread(prev => (prev && prev.id === thread.id ? { ...prev, notes: prev.notes.filter(n => n.id !== noteId) } : prev))
  })
  const refresh = async () => {
    setSyncing(true)
    try {
      const out = await supportApi.sync()
      if (out.skipped) toast.message('The mailbox is not connected yet')
      else if (out.imported) toast.success(`${out.imported} new message${out.imported === 1 ? '' : 's'}`)
      await loadInbox(true)
      if (selectedId) refreshThread(selectedId)
      loadStatus()
    } catch (e) { toast.error((e as Error).message) }
    finally { setSyncing(false) }
  }

  // Keys. Only when nothing is being typed.
  const threadsRef = useRef<ThreadRow[]>([])
  threadsRef.current = inbox?.threads || []
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selectedId
  const threadRef = useRef<ThreadDetail | null>(null)
  threadRef.current = thread
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
      if (typing) { if (e.key === 'Escape') (el as HTMLElement).blur(); return }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const list = threadsRef.current
      const idx = list.findIndex(t => t.id === selectedRef.current)
      const t = threadRef.current
      switch (e.key) {
        case 'j': if (list[idx + 1]) openThread(list[idx + 1].id); break
        case 'k': if (idx > 0) openThread(list[idx - 1].id); else if (idx < 0 && list[0]) openThread(list[0].id); break
        case 'r': if (t) { e.preventDefault(); replyRef.current?.focus() } break
        case 'n': if (t) { e.preventDefault(); const b = document.querySelector<HTMLButtonElement>('[data-note-tab]'); b?.click() } break
        case 'm': if (t) { e.preventDefault(); document.querySelector<HTMLButtonElement>('[data-macro-button]')?.click() } break
        case 'a': if (t && user) assign(user.id); break
        case 'p': if (t) setPriority(!t.priority); break
        case 'c': if (t && t.status !== 'closed') setStatusOf('closed'); break
        case 'u': if (t) markUnread(); break
        case '?': setKeysOpen(v => !v); break
        case 'Escape': setKeysOpen(false); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // every render: the handlers close over the latest thread

  const me = inbox?.me || (user ? { id: user.id, firstName: user.firstName, lastName: user.lastName } : null)
  const threads = inbox?.threads || []
  const title = view.startsWith('teammate:') ? (inbox?.team.find(u => `teammate:${u.id}` === view)?.firstName || 'Teammate') : VIEW_TITLE[view] || 'Inbox'
  const empty = query ? 'Nothing matches.' : view.startsWith('teammate:') ? 'Nothing open for them.' : EMPTY[view] || 'Nothing here.'

  return (
    <div className={pageShell}>
      <div className="px-3 md:px-5 w-full flex flex-col h-full">
        <div className="pt-4 md:pt-5 pb-3 flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/trackstar-stars-transparent.png" alt="Trackstar" className="h-7 md:h-8 w-fit" />
            <h1 className="text-2xl md:text-[28px] font-bold text-off-black leading-none">Support</h1>
            {loading && <Loader2 className="w-4 h-4 animate-spin text-off-black/30" />}
          </div>
          <div className="flex-1 flex items-center justify-end gap-2 md:gap-3 min-w-0">
            <div className="relative flex-1 max-w-[760px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-off-black/40" />
              <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search conversations" className="w-full pl-9 pr-8 py-2 bg-white border border-border-gray rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-off-black/10 focus:border-off-black/30" />
              {query && <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-off-black/40 hover:text-off-black"><X className="w-3.5 h-3.5" /></button>}
            </div>
            {/* The views, as a menu, where the column does not fit. */}
            <select value={view} onChange={e => setView(e.target.value as InboxView)} className="lg:hidden text-sm bg-white border border-border-gray rounded-md px-2 py-2">
              {Object.entries(VIEW_TITLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              {inbox?.team.map(u => <option key={u.id} value={`teammate:${u.id}`}>{u.firstName}</option>)}
            </select>
            <button onClick={() => setKeysOpen(v => !v)} className={`${btnGhost} hidden md:inline-flex`} title="Keyboard shortcuts (?)"><Keyboard className="w-4 h-4" /></button>
            <button onClick={refresh} disabled={syncing} className={btnSecondary} title="Check the mailbox now"><RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /><span className="hidden md:inline">Refresh</span></button>
            {status?.connected && <span className="hidden xl:inline-flex items-center gap-1.5 text-xs text-off-black/50"><Mail className="w-3.5 h-3.5" />{status.email}</span>}
          </div>
        </div>

        {status && !status.connected && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 mb-3 text-sm text-amber-800 flex-shrink-0">
            <span><Mail className="w-4 h-4 inline mr-1.5 -mt-0.5" />{isAdmin ? `Connect ${status.expectedEmail} to start reading the inbox here.` : 'The support mailbox is not connected yet. Ask an admin.'}</span>
            {isAdmin && status.configured && <a href={supportApi.connectUrl} className={btnSecondary}>Connect mailbox</a>}
          </div>
        )}
        {inboxError && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 mb-3 text-sm text-red-800 flex-shrink-0">Could not read the inbox: {inboxError}</div>
        )}

        <section className="flex-1 min-h-0 pb-3">
          <div className="h-full bg-white border border-border-gray rounded-lg shadow-sm overflow-hidden flex flex-col lg:flex-row">
            <ViewsColumn view={view} counts={inbox?.counts || null} team={inbox?.team || []} me={me} onView={v => { setView(v); setSelectedId(null); setThread(null) }} onMacros={() => setMacrosOpen(true)} onSettings={() => setSettingsOpen(true)} />
            <ConversationList title={title} threads={threads} selectedId={selectedId} onSelect={openThread} loading={loading && !inbox} emptyLabel={empty} sort={sort} onSort={setSort} />
            {thread && me ? (
              <Conversation
                key={thread.id} thread={thread} team={inbox?.team || []} me={me} isAdmin={isAdmin} busy={busy} macros={macros} expectedHandle={instagram?.expectedHandle}
                onAssign={assign} onStatus={setStatusOf} onSnooze={snooze} onPriority={setPriority} onMarkUnread={markUnread}
                onReply={reply} onNote={addNote} onDeleteNote={deleteNote} onUseMacro={id => { supportApi.useMacro(id).catch(() => {}) }}
                replyRef={replyRef} noteRef={noteRef} insertRef={insertRef} attachRef={attachRef}
              />
            ) : (
              <div className="flex-1 min-w-0 flex items-center justify-center min-h-[320px] bg-[#fcfcfc]">
                {threadLoading ? <Loader2 className="w-6 h-6 animate-spin text-off-black/30" /> : (
                  <div className="text-center max-w-[40ch] px-6">
                    <Inbox className="w-8 h-8 mx-auto text-off-black/25 mb-2" />
                    <div className="text-lg font-semibold text-off-black">{threads.length ? 'Pick a conversation' : (view === 'all' && inbox?.counts.all === 0 ? 'Inbox zero' : 'Nothing here')}</div>
                    <p className="text-sm text-off-black/55 mt-1">{threads.length ? 'j and k move through the list.' : empty}</p>
                  </div>
                )}
              </div>
            )}
            <Details
              thread={thread} team={inbox?.team || []} tagSuggestions={inbox?.tagSuggestions || []} onOpenThread={openThread}
              onAssign={assign} onPriority={setPriority} onTags={setTags}
              onInsert={t => insertRef.current?.(t)} onAttach={m => attachRef.current?.(m)} onChanged={() => { if (selectedId) refreshThread(selectedId); loadInbox(true) }}
            />
          </div>
        </section>
      </div>

      {macrosOpen && <MacrosModal macros={macros} onChanged={loadMacros} onClose={() => setMacrosOpen(false)} />}
      {settingsOpen && <SettingsModal team={inbox?.team || []} unassignedCount={inbox?.counts.unassigned || 0} status={status} instagram={instagram} isAdmin={isAdmin} onChanged={() => { loadStatus(); loadInbox(true) }} onClose={() => setSettingsOpen(false)} />}
      {keysOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setKeysOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-base font-semibold text-off-black">Keyboard shortcuts</div>
              <button onClick={() => setKeysOpen(false)} className={btnGhost}><X className="w-4 h-4" /></button>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {SHORTCUTS.map(([k, v]) => <div key={k} className="contents"><dt><kbd className="px-1.5 py-0.5 rounded border border-border-gray bg-subtle-gray text-xs font-mono">{k}</kbd></dt><dd className="text-off-black/70">{v}</dd></div>)}
            </dl>
          </div>
        </div>
      )}
    </div>
  )
}
