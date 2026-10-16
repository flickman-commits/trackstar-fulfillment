import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Inbox, Loader2, Mail, RefreshCw, Search } from 'lucide-react'
import { btnSecondary, listCard, listToolbar, pageShell, segment, segmentGroup, toolbarInput } from '@/lib/ui'
import { supportApi } from '@/lib/supportApi'
import { useAuth } from '@/lib/auth'
import { useDocumentHead } from '@/lib/useDocumentHead'
import type { InboxPayload, InboxView, MailboxStatus, ThreadDetail, ThreadRow, ThreadStatus } from '@/types/support'
import ThreadList from '@/components/support/ThreadList'
import ThreadView from '@/components/support/ThreadView'
import ContextPane, { MailboxCard } from '@/components/support/ContextPane'

/**
 * Support: the shared inbox for fast@trackstar.art.
 *
 * Gmail is the system of record for the mail; this page reads a mirror of
 * it (synced every five minutes, or on Refresh) and sends replies back
 * through it as fast@, whoever is signed in. The queue on the left is the
 * threads, oldest unanswered first. The thread and the reply are in the
 * middle. The right column is what we know about the customer: their orders
 * from Shopify and our own rows for them, and their other threads. Who has
 * a thread, its status and a snooze live here and nowhere else.
 */
const VIEWS: { id: InboxView; label: string; count?: keyof InboxPayload['counts'] }[] = [
  { id: 'open', label: 'Open', count: 'open' },
  { id: 'mine', label: 'Mine', count: 'mine' },
  { id: 'waiting', label: 'Waiting', count: 'waiting' },
  { id: 'escalated', label: 'Escalated', count: 'escalated' },
  { id: 'closed', label: 'Closed' },
]
const EMPTY: Record<InboxView, string> = {
  open: 'Inbox zero. Nobody is waiting on us.',
  mine: 'Nothing assigned to you.',
  waiting: 'Nothing waiting on a customer.',
  escalated: 'Nothing escalated.',
  closed: 'Nothing closed yet.',
  all: 'No threads yet.',
}
const POLL_MS = 60_000

export default function Support() {
  useDocumentHead({ title: 'Support · Trackstar' })
  const { user, isAdmin } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [view, setView] = useState<InboxView>(() => { try { return (localStorage.getItem('support.view') as InboxView) || 'open' } catch { return 'open' } })
  const [query, setQuery] = useState('')
  const [inbox, setInbox] = useState<InboxPayload | null>(null)
  const [inboxError, setInboxError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<MailboxStatus | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [thread, setThread] = useState<ThreadDetail | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => { try { localStorage.setItem('support.view', view) } catch { /* private mode */ } }, [view])

  // Back from Google's consent screen.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const g = params.get('gmail')
    if (!g) return
    if (g === 'connected') toast.success(`Mailbox connected as ${params.get('account') || 'the support account'}`)
    else if (g === 'denied') toast.error('Mailbox connection was cancelled')
    else toast.error(`Mailbox connection failed: ${params.get('reason') || 'unknown error'}`)
    navigate('/support', { replace: true })
  }, [location.search, navigate])

  const loadStatus = useCallback(() => { supportApi.status().then(setStatus).catch(() => setStatus(null)) }, [])
  const loadInbox = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try { setInbox(await supportApi.inbox(view, query)); setInboxError(null) }
    catch (e) { setInboxError((e as Error).message) }
    finally { if (!quiet) setLoading(false) }
  }, [view, query])

  useEffect(() => { loadStatus() }, [loadStatus])
  useEffect(() => {
    const t = window.setTimeout(() => loadInbox(), query ? 250 : 0)
    return () => window.clearTimeout(t)
  }, [loadInbox, query])
  // Quietly keep the queue current while the page is open.
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') loadInbox(true) }, POLL_MS)
    return () => window.clearInterval(id)
  }, [loadInbox])

  const openThread = useCallback(async (id: string) => {
    setSelectedId(id)
    setThreadLoading(true)
    try { setThread(await supportApi.thread(id)) }
    catch (e) { toast.error((e as Error).message); setThread(null) }
    finally { setThreadLoading(false) }
  }, [])

  // Keep the row in the list in step with a change made on the thread.
  const patchRow = (row: ThreadRow) => {
    setInbox(prev => prev ? { ...prev, threads: prev.threads.map(t => (t.id === row.id ? { ...t, ...row } : t)) } : prev)
    setThread(prev => (prev && prev.id === row.id ? { ...prev, ...row } : prev))
  }

  const assign = async (assigneeId: string | null) => {
    if (!thread) return
    setBusy(true)
    try { patchRow(await supportApi.assign(thread.id, assigneeId)); loadInbox(true) }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  const setStatusOf = async (s: ThreadStatus) => {
    if (!thread) return
    setBusy(true)
    try { patchRow(await supportApi.setStatus(thread.id, s)); loadInbox(true) }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  const snooze = async (until: string | null) => {
    if (!thread) return
    setBusy(true)
    try {
      patchRow(await supportApi.snooze(thread.id, until))
      toast.success(until ? `Snoozed until ${new Date(until).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : 'Unsnoozed')
      loadInbox(true)
    }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  const reply = async (text: string) => {
    if (!thread) return false
    try {
      const fresh = await supportApi.reply(thread.id, text)
      setThread(fresh)
      toast.success(`Sent to ${fresh.customerEmail}`)
      loadInbox(true)
      return true
    } catch (e) {
      toast.error((e as Error).message)
      return false
    }
  }
  const refresh = async () => {
    setSyncing(true)
    try {
      const out = await supportApi.sync()
      if (out.skipped) toast.message('The mailbox is not connected yet')
      else if (out.imported) toast.success(`${out.imported} new message${out.imported === 1 ? '' : 's'}`)
      await loadInbox(true)
      if (selectedId) openThread(selectedId)
      loadStatus()
    } catch (e) { toast.error((e as Error).message) }
    finally { setSyncing(false) }
  }

  const me = inbox?.me || (user ? { id: user.id, firstName: user.firstName, lastName: user.lastName } : null)
  const threads = inbox?.threads || []
  const selectedStill = useRef(selectedId)
  selectedStill.current = selectedId

  return (
    <div className={pageShell}>
      <div className="px-3 md:px-5 w-full flex flex-col h-full">
        <div className="pt-4 md:pt-5 pb-3 md:pb-4 flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/trackstar-stars-transparent.png" alt="Trackstar" className="h-7 md:h-8 w-fit" />
            <h1 className="text-2xl md:text-[28px] font-bold text-off-black leading-none">Support</h1>
            {loading && <Loader2 className="w-4 h-4 animate-spin text-off-black/30" />}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm text-off-black/60">
            {inbox && <span><b className="text-off-black tabular-nums">{inbox.counts.open}</b> waiting on us</span>}
            {inbox && inbox.counts.snoozed > 0 && <span className="hidden md:inline"><b className="text-off-black tabular-nums">{inbox.counts.snoozed}</b> snoozed</span>}
            {status?.connected && <span className="hidden md:inline-flex items-center gap-1.5 text-off-black/50"><Mail className="w-3.5 h-3.5" />{status.email}</span>}
          </div>
        </div>

        {status && !status.connected && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 mb-3 text-sm text-amber-800 flex-shrink-0">
            <span><Mail className="w-4 h-4 inline mr-1.5 -mt-0.5" />{isAdmin ? `Connect ${status.expectedEmail} to start reading the inbox here.` : 'The support mailbox is not connected yet. Ask an admin.'}</span>
            {isAdmin && status.configured && <a href={supportApi.connectUrl} className={btnSecondary}>Connect mailbox</a>}
          </div>
        )}
        {inboxError && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 mb-3 text-sm text-red-800 flex-shrink-0">
            <span>Could not read the inbox: {inboxError}</span>
          </div>
        )}

        <section className="flex-1 flex flex-col min-h-0 pb-3">
          <div className={listCard}>
            <div className={listToolbar}>
              <div className="flex flex-col md:flex-row gap-2 md:gap-3">
                <div className={`${segmentGroup} self-start md:self-stretch shrink-0 overflow-x-auto`}>
                  {VIEWS.map(v => (
                    <button key={v.id} onClick={() => setView(v.id)} className={`${segment(view === v.id, 'md')} h-full whitespace-nowrap`}>
                      {v.label}{v.count && inbox ? <span className="ml-1.5 tabular-nums opacity-60">{inbox.counts[v.count]}</span> : null}
                    </button>
                  ))}
                </div>
                <div className="relative flex-1">
                  <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-off-black/40" />
                  <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search names, emails, subjects..." className={toolbarInput} />
                </div>
                <button onClick={refresh} disabled={syncing} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 md:py-3 bg-subtle-gray border border-border-gray rounded-md text-sm text-off-black/70 hover:bg-off-black/5 transition-colors" title="Check the mailbox now">
                  <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /><span className="md:hidden">Refresh</span>
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
              <ThreadList threads={threads} selectedId={selectedId} onSelect={openThread} loading={loading && !inbox} emptyLabel={query ? 'Nothing matches.' : EMPTY[view]} />

              {thread && me ? (
                <ThreadView key={thread.id} thread={thread} team={inbox?.team || []} me={me} busy={busy} onAssign={assign} onStatus={setStatusOf} onSnooze={snooze} onReply={reply} />
              ) : (
                <div className="flex-1 min-w-0 flex items-center justify-center min-h-[320px]">
                  {threadLoading ? <Loader2 className="w-6 h-6 animate-spin text-off-black/30" /> : (
                    <div className="text-center max-w-[40ch] px-6">
                      <Inbox className="w-8 h-8 mx-auto text-off-black/25 mb-2" />
                      <div className="text-lg font-semibold text-off-black">{threads.length ? 'Pick a thread' : (inbox?.counts.open === 0 && view === 'open' ? 'Inbox zero' : 'Nothing here')}</div>
                      <p className="text-sm text-off-black/55 mt-1">{threads.length ? 'The oldest unanswered one is at the top.' : EMPTY[view]}</p>
                    </div>
                  )}
                </div>
              )}

              <aside className="w-full lg:w-[320px] xl:w-[340px] shrink-0 lg:overflow-y-auto border-t lg:border-t-0 lg:border-l border-border-gray p-5 space-y-6 min-h-0">
                {threadLoading && thread && <div className="text-xs text-off-black/40 inline-flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" />Updating</div>}
                <ContextPane thread={thread} onOpenThread={openThread} />
                {(isAdmin || !status?.connected) && <MailboxCard status={status} isAdmin={isAdmin} onChanged={() => { loadStatus(); loadInbox(true) }} />}
              </aside>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
