import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Archive, ChevronDown, Clock, Loader2, Paperclip, RotateCcw, Send, Hourglass } from 'lucide-react'
import { btnGhost, btnPrimary, btnSecondary, cardLabel } from '@/lib/ui'
import { when } from '@/lib/supportDates'
import AssigneePicker, { Avatar } from '@/components/AssigneePicker'
import { StatusChip } from './ThreadList'
import type { Message, Teammate, ThreadDetail, ThreadStatus } from '@/types/support'

/**
 * The middle column: the conversation, then the reply.
 *
 * Messages are shown as the person wrote them, with the quoted thread each
 * reply drags along folded away. The reply box starts with the greeting and
 * the sign-off the playbook asks for, with this rep's name, and the rest is
 * theirs to write. Send goes out as fast@ and moves the thread to waiting
 * on the customer. Everything else about the thread (who has it, its
 * status, a snooze) is in the bar at the top.
 */
function Bubble({ m }: { m: Message }) {
  const [showQuoted, setShowQuoted] = useState(false)
  const out = m.direction === 'out'
  const who = out ? (m.sentBy ? `${m.sentBy.firstName} from Trackstar` : (m.fromName || 'Trackstar')) : (m.fromName || m.fromEmail)
  return (
    <div className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[88%] md:max-w-[78%] rounded-2xl px-4 py-3 ${out ? 'bg-dark-fill text-white' : 'bg-subtle-gray border border-border-gray text-off-black'}`}>
        <div className={`flex items-baseline justify-between gap-4 mb-1.5 text-[11px] ${out ? 'text-white/60' : 'text-off-black/50'}`}>
          <span className="font-medium truncate inline-flex items-center gap-1.5">
            {out && m.sentBy && <Avatar user={m.sentBy} size={14} />}
            {who}
          </span>
          <span className="shrink-0 tabular-nums">{when(m.sentAt)}</span>
        </div>
        <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">{m.text || <span className={out ? 'text-white/50' : 'text-off-black/40'}>(no text)</span>}</div>
        {m.attachments.length > 0 && (
          <div className={`mt-2 flex flex-wrap gap-1.5 text-[11px] ${out ? 'text-white/70' : 'text-off-black/60'}`}>
            {m.attachments.map(a => (
              <span key={a.attachmentId} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${out ? 'border-white/20' : 'border-border-gray bg-white'}`} title={`${a.mimeType} · ${Math.round(a.size / 1024)} KB`}>
                <Paperclip className="w-3 h-3" />{a.filename}
              </span>
            ))}
          </div>
        )}
        {m.quoted && (
          <button onClick={() => setShowQuoted(v => !v)} className={`mt-2 inline-flex items-center gap-1 text-[11px] ${out ? 'text-white/50 hover:text-white/80' : 'text-off-black/40 hover:text-off-black/70'}`}>
            <ChevronDown className={`w-3 h-3 transition-transform ${showQuoted ? 'rotate-180' : ''}`} />{showQuoted ? 'Hide quoted text' : 'Show quoted text'}
          </button>
        )}
        {showQuoted && m.quoted && <div className={`mt-2 pt-2 border-t text-xs whitespace-pre-wrap break-words ${out ? 'border-white/15 text-white/55' : 'border-border-gray text-off-black/50'}`}>{m.quoted}</div>}
      </div>
    </div>
  )
}

/** The reply, as the playbook opens and closes one, with the rest to write. */
function starter(thread: ThreadDetail, me: Teammate) {
  const first = (thread.customerName || '').trim().split(/\s+/)[0] || ''
  return `Hey${first ? ` ${first}` : ''},\n\n\n\nThanks,\n${me.firstName} from Trackstar`
}

const SNOOZES: { label: string; until: () => Date }[] = [
  { label: 'Later today', until: () => { const d = new Date(); d.setHours(d.getHours() + 4); return d } },
  { label: 'Tomorrow morning', until: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d } },
  { label: 'In 3 days', until: () => { const d = new Date(); d.setDate(d.getDate() + 3); d.setHours(9, 0, 0, 0); return d } },
  { label: 'Next week', until: () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d } },
]

export default function ThreadView({ thread, team, me, busy, onAssign, onStatus, onSnooze, onReply }: {
  thread: ThreadDetail
  team: Teammate[]
  me: Teammate
  busy: boolean
  onAssign: (id: string | null) => void
  onStatus: (s: ThreadStatus) => void
  onSnooze: (until: string | null) => void
  onReply: (text: string) => Promise<boolean>
}) {
  const [text, setText] = useState(() => starter(thread, me))
  const [sending, setSending] = useState(false)
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const snoozeRef = useRef<HTMLDivElement>(null)

  // A new thread gets a fresh starter; the one being typed is kept per thread id.
  useEffect(() => { setText(starter(thread, me)) }, [thread.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [thread.id, thread.messages.length])
  useEffect(() => {
    if (!snoozeOpen) return
    const close = (e: MouseEvent) => { if (snoozeRef.current && !snoozeRef.current.contains(e.target as Node)) setSnoozeOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [snoozeOpen])

  const wrote = useMemo(() => {
    const body = text.replace(/^Hey[^\n]*,\n/, '').replace(/\n+Thanks,\n[^\n]*$/, '').trim()
    return body.length > 0
  }, [text])
  const hasEmDash = /—/.test(text)

  const send = async () => {
    if (!wrote || sending) return
    setSending(true)
    try {
      const ok = await onReply(text.trim())
      if (ok) setText(starter(thread, me))
    } finally { setSending(false) }
  }

  const snoozed = thread.snoozedUntil && new Date(thread.snoozedUntil) > new Date()

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0">
      {/* Who, status, and the thread's own controls. */}
      <div className="px-5 py-3 border-b border-border-gray flex flex-wrap items-center gap-x-4 gap-y-2 shrink-0">
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-off-black truncate">{thread.subject || '(no subject)'}</div>
          <div className="text-xs text-off-black/55 truncate">{thread.customerName ? `${thread.customerName} · ` : ''}{thread.customerEmail}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusChip status={thread.status} />
          {snoozed && <span className="text-[11px] text-off-black/50 inline-flex items-center gap-1"><Clock className="w-3 h-3" />until {new Date(thread.snoozedUntil as string).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>}
          <AssigneePicker team={team} value={thread.assignee?.id || null} meId={me.id} onChange={onAssign} />
        </div>
      </div>

      {/* The conversation. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
        {thread.messages.map(m => <Bubble key={m.id} m={m} />)}
        <div ref={bottom} />
      </div>

      {/* The reply. */}
      <div className="border-t border-border-gray p-4 shrink-0 bg-white">
        <div className="flex items-center justify-between mb-2">
          <span className={cardLabel}>Reply as {thread.customerEmail ? 'fast@trackstar.art' : 'support'}</span>
          {hasEmDash && <span className="text-[11px] text-red-600 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />No em dashes in anything a customer sees</span>}
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send() } }}
          rows={7}
          className="w-full px-3 py-2.5 text-sm bg-subtle-gray border border-border-gray rounded-md focus:outline-none focus:ring-2 focus:ring-off-black/10 focus:border-off-black/30 resize-y leading-relaxed"
          placeholder="Hey Jane, ..."
          disabled={sending}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button onClick={send} disabled={!wrote || sending || hasEmDash || busy} className={btnPrimary} title="⌘↵">
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send
          </button>
          <span className="text-[11px] text-off-black/40 hidden md:inline">⌘↵ to send</span>
          <span className="flex-1" />
          {thread.status !== 'closed' && (
            <div className="relative" ref={snoozeRef}>
              <button onClick={() => setSnoozeOpen(v => !v)} disabled={busy} className={btnSecondary} title="Hide it until later; it comes back on its own, or sooner if they write"><Hourglass className="w-3.5 h-3.5" /> Snooze</button>
              {snoozeOpen && (
                <div className="absolute right-0 bottom-full mb-1 w-48 p-1 rounded-lg bg-white border border-border-gray shadow-[0_6px_24px_rgba(0,0,0,0.12)] z-20">
                  {SNOOZES.map(s => (
                    <button key={s.label} onClick={() => { setSnoozeOpen(false); onSnooze(s.until().toISOString()) }} className="w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-subtle-gray">{s.label}</button>
                  ))}
                  {snoozed && <button onClick={() => { setSnoozeOpen(false); onSnooze(null) }} className="w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-subtle-gray text-off-black/60">Unsnooze</button>}
                </div>
              )}
            </div>
          )}
          {thread.status !== 'escalated' && thread.status !== 'closed' && (
            <button onClick={() => onStatus('escalated')} disabled={busy} className={btnSecondary} title="Pull Matt in. Stays escalated until someone changes it."><AlertTriangle className="w-3.5 h-3.5" /> Escalate</button>
          )}
          {thread.status === 'open' && (
            <button onClick={() => onStatus('waiting')} disabled={busy} className={btnGhost} title="Nothing to send; we are waiting on them">Waiting on them</button>
          )}
          {thread.status === 'closed'
            ? <button onClick={() => onStatus('open')} disabled={busy} className={btnSecondary}><RotateCcw className="w-3.5 h-3.5" /> Reopen</button>
            : <button onClick={() => onStatus('closed')} disabled={busy} className={btnSecondary} title="Done. A new message from them reopens it."><Archive className="w-3.5 h-3.5" /> Close</button>}
        </div>
        {!wrote && <p className="mt-1.5 text-[11px] text-off-black/40">Write between the greeting and the sign-off.</p>}
      </div>
    </div>
  )
}
