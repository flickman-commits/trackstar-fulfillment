import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Archive, ChevronDown, Clock, Loader2, MailOpen, Paperclip, RotateCcw, Send, Star, StickyNote, Trash2, Zap, X, Search } from 'lucide-react'
import { btnGhost, btnPrimary, btnSecondary } from '@/lib/ui'
import { when } from '@/lib/supportDates'
import { fillMacro } from '@/lib/supportStatus'
import AssigneePicker, { Avatar } from '@/components/AssigneePicker'
import { ChannelMark, CustomerAvatar } from './ConversationList'
import type { Macro, Message, Note, Teammate, ThreadDetail, ThreadStatus } from '@/types/support'

/**
 * The conversation, Intercom's middle column.
 *
 * A header with the customer, the star, who has it, and Close with Snooze
 * under its chevron. A timeline of the customer's messages, our replies,
 * the team's internal notes (yellow, never sent, with @mentions) and the
 * events that happened to the thread. A composer with two tabs: Reply goes
 * out as fast@, Note stays here. Macros drop a saved reply in; Send and
 * close does both in one go. Everything has a key.
 *
 * An Instagram thread uses the same timeline and the same two tabs; the
 * reply goes out as a DM from @trackstar_art, starts empty (DMs are short,
 * no greeting or sign-off), and is held when Meta's 24-hour window after
 * the customer's last message has closed.
 */
type Item = { at: string; kind: 'message'; m: Message } | { at: string; kind: 'note'; n: Note }

function Bubble({ m }: { m: Message }) {
  const [showQuoted, setShowQuoted] = useState(false)
  const out = m.direction === 'out'
  const who = out ? (m.sentBy ? `${m.sentBy.firstName} from Trackstar` : (m.fromName || 'Trackstar')) : (m.fromName || m.fromEmail || 'Instagram user')
  return (
    <div className={`flex items-end gap-2 ${out ? 'justify-end' : 'justify-start'}`}>
      {!out && <CustomerAvatar name={m.fromName} email={m.fromEmail || m.fromName} size={26} />}
      <div className={`max-w-[88%] md:max-w-[72%] rounded-2xl px-4 py-3 ${out ? 'bg-dark-fill text-white rounded-br-md' : 'bg-subtle-gray border border-border-gray text-off-black rounded-bl-md'}`}>
        <div className={`flex items-baseline justify-between gap-4 mb-1 text-[11px] ${out ? 'text-white/55' : 'text-off-black/50'}`}>
          <span className="font-medium truncate">{who}</span>
          <span className="shrink-0 tabular-nums">{when(m.sentAt)}</span>
        </div>
        <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">{m.text || <span className={out ? 'text-white/50' : 'text-off-black/40'}>(no text)</span>}</div>
        {m.attachments.length > 0 && (
          <div className={`mt-2 flex flex-wrap gap-1.5 text-[11px] ${out ? 'text-white/70' : 'text-off-black/60'}`}>
            {m.attachments.map(a => a.url ? (
              <a key={a.attachmentId} href={a.url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border hover:underline ${out ? 'border-white/20' : 'border-border-gray bg-white'}`} title="Open in a new tab (Meta's link expires after a while)">
                <Paperclip className="w-3 h-3" />{a.filename}
              </a>
            ) : (
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
      {out && m.sentBy && <Avatar user={m.sentBy} size={26} />}
    </div>
  )
}

/** A note with the @names bold, or an event as one quiet line. */
function NoteCard({ n, team, meId, isAdmin, onDelete }: { n: Note; team: Teammate[]; meId: string; isAdmin: boolean; onDelete: () => void }) {
  if (n.kind === 'event') {
    return (
      <div className="flex items-center gap-3 text-[11px] text-off-black/45 px-2">
        <span className="flex-1 border-t border-border-gray/80" />
        <span className="shrink-0">{n.body} · {when(n.createdAt)}</span>
        <span className="flex-1 border-t border-border-gray/80" />
      </div>
    )
  }
  const names = team.map(u => `${u.firstName} ${u.lastName}`.trim()).filter(Boolean).sort((a, b) => b.length - a.length)
  const parts: (string | { name: string })[] = []
  let rest = n.body
  const re = names.length ? new RegExp(`@(${names.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g') : null
  if (re) {
    let last = 0
    for (const m of rest.matchAll(re)) {
      parts.push(rest.slice(last, m.index)); parts.push({ name: m[1] }); last = (m.index || 0) + m[0].length
    }
    parts.push(rest.slice(last)); rest = ''
  } else parts.push(rest)
  const mine = n.author?.id === meId
  return (
    <div className="flex items-start gap-2">
      {n.author ? <Avatar user={n.author} size={26} /> : <span className="w-[26px] h-[26px] rounded-full bg-amber-200" />}
      <div className="group max-w-[88%] md:max-w-[72%] rounded-2xl rounded-tl-md px-4 py-3 bg-amber-50 border border-amber-200 text-off-black">
        <div className="flex items-baseline justify-between gap-4 mb-1 text-[11px] text-amber-900/70">
          <span className="font-medium inline-flex items-center gap-1"><StickyNote className="w-3 h-3" />{n.authorName} · note</span>
          <span className="shrink-0 tabular-nums inline-flex items-center gap-2">
            {when(n.createdAt)}
            {(mine || isAdmin) && <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 text-amber-900/50 hover:text-red-600" title="Delete note"><Trash2 className="w-3 h-3" /></button>}
          </span>
        </div>
        <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
          {parts.map((p, i) => typeof p === 'string' ? p : <span key={i} className="font-semibold text-amber-900 bg-amber-100 rounded px-0.5">@{p.name}</span>)}
        </div>
      </div>
    </div>
  )
}

/** The reply, as the playbook opens and closes one, with the rest to write. A DM starts empty. */
function starter(thread: ThreadDetail, me: Teammate) {
  if (thread.channel === 'instagram') return ''
  const first = (thread.customerName || '').trim().split(/\s+/)[0] || ''
  return `Hey${first ? ` ${first}` : ''},\n\n\n\nThanks,\n${me.firstName} from Trackstar`
}
/** True when nothing has been written between the greeting and the sign-off. */
function isBlank(text: string) {
  return text.replace(/^Hey[^\n]*,\n/, '').replace(/\n+Thanks,\n[^\n]*$/, '').trim().length === 0
}
/** The first name a macro greets: the display name's first word, never an @handle. */
function firstNameOf(thread: ThreadDetail) {
  const n = (thread.customerName || '').trim()
  if (!n || n.startsWith('@')) return ''
  return n.split(/\s+/)[0]
}

const SNOOZES: { label: string; until: () => Date }[] = [
  { label: 'Later today', until: () => { const d = new Date(); d.setHours(d.getHours() + 4); return d } },
  { label: 'Tomorrow morning', until: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d } },
  { label: 'In 3 days', until: () => { const d = new Date(); d.setDate(d.getDate() + 3); d.setHours(9, 0, 0, 0); return d } },
  { label: 'Next week', until: () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d } },
]

/** A small popover that closes on outside click or Escape. */
function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  return { open, setOpen, ref }
}

/** The macro menu: search, pick, done. */
function MacroMenu({ macros, onPick, onClose }: { macros: Macro[]; onPick: (m: Macro) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? macros.filter(m => m.name.toLowerCase().includes(s) || m.body.toLowerCase().includes(s)) : macros
  }, [macros, q])
  useEffect(() => { setIdx(0) }, [q])
  return (
    <div className="absolute left-0 bottom-full mb-1 w-[380px] max-w-[90vw] rounded-lg bg-white border border-border-gray shadow-[0_8px_30px_rgba(0,0,0,0.14)] z-30 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-gray">
        <Search className="w-3.5 h-3.5 text-off-black/40" />
        <input
          ref={input} value={q} onChange={e => setQ(e.target.value)} placeholder="Search macros"
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(list.length - 1, i + 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)) }
            if (e.key === 'Enter' && list[idx]) { e.preventDefault(); onPick(list[idx]) }
            if (e.key === 'Escape') onClose()
          }}
          className="flex-1 text-sm focus:outline-none placeholder:text-off-black/35"
        />
      </div>
      <div className="max-h-[300px] overflow-y-auto">
        {list.length === 0 && <div className="px-3 py-4 text-xs text-off-black/45">No macro matches.</div>}
        {list.map((m, i) => (
          <button key={m.id} onMouseEnter={() => setIdx(i)} onClick={() => onPick(m)} className={`w-full text-left px-3 py-2 border-b border-border-gray/60 last:border-b-0 ${i === idx ? 'bg-subtle-gray' : ''}`}>
            <div className="text-[13px] font-medium text-off-black">{m.name}</div>
            <div className="text-[11px] text-off-black/50 truncate">{m.body.replace(/\s+/g, ' ')}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Conversation({ thread, team, me, isAdmin, busy, macros, expectedHandle = 'trackstar_art', onAssign, onStatus, onSnooze, onPriority, onMarkUnread, onReply, onNote, onDeleteNote, onUseMacro, replyRef, noteRef }: {
  thread: ThreadDetail
  /** The Instagram account replies go out as, without the @. */
  expectedHandle?: string
  team: Teammate[]
  me: Teammate
  isAdmin: boolean
  busy: boolean
  macros: Macro[]
  onAssign: (id: string | null) => void
  onStatus: (s: ThreadStatus) => void
  onSnooze: (until: string | null) => void
  onPriority: (p: boolean) => void
  onMarkUnread: () => void
  onReply: (text: string, close: boolean) => Promise<boolean>
  onNote: (body: string, mentions: string[]) => Promise<boolean>
  onDeleteNote: (noteId: string) => void
  onUseMacro: (id: string) => void
  /** Lets the page's keyboard shortcuts focus the composer. */
  replyRef: React.RefObject<HTMLTextAreaElement>
  noteRef: React.RefObject<HTMLTextAreaElement>
}) {
  const [mode, setMode] = useState<'reply' | 'note'>('reply')
  const [text, setText] = useState(() => starter(thread, me))
  const [note, setNote] = useState('')
  const [mentionIds, setMentionIds] = useState<string[]>([])
  const [mentionQ, setMentionQ] = useState<string | null>(null)
  const [mentionIdx, setMentionIdx] = useState(0)
  const [sending, setSending] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const close = usePopover()
  const macro = usePopover()

  useEffect(() => { setText(starter(thread, me)); setNote(''); setMentionIds([]); setMode('reply') }, [thread.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [thread.id, thread.messages.length, thread.notes.length])

  const timeline = useMemo<Item[]>(() => {
    const items: Item[] = [
      ...thread.messages.map(m => ({ at: m.sentAt, kind: 'message' as const, m })),
      ...thread.notes.map(n => ({ at: n.createdAt, kind: 'note' as const, n })),
    ]
    return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  }, [thread.messages, thread.notes])

  const ig = thread.channel === 'instagram'
  const wrote = !isBlank(text)
  const hasEmDash = /—/.test(text)
  const snoozed = thread.snoozedUntil && new Date(thread.snoozedUntil) > new Date()
  // Meta's rule for a DM. The server says the same thing again on Send; this is so nobody types a reply that cannot go.
  const window = ig ? thread.replyWindow : null
  const windowClosed = Boolean(window && !window.open)
  const canSend = wrote && !sending && !hasEmDash && !busy && !windowClosed

  const send = async (closeAfter = false) => {
    if (!canSend) return
    setSending(true)
    try { if (await onReply(text.trim(), closeAfter)) setText(starter(thread, me)) }
    finally { setSending(false) }
  }
  const addNote = async () => {
    if (!note.trim() || sending) return
    setSending(true)
    try {
      // Keep only the mentions whose @name is still in the text.
      const keep = mentionIds.filter(id => { const u = team.find(x => x.id === id); return u && note.includes(`@${u.firstName} ${u.lastName}`.trim()) })
      if (await onNote(note.trim(), keep)) { setNote(''); setMentionIds([]) }
    } finally { setSending(false) }
  }

  // @mentions: typing @ in a note offers the team; Enter or click inserts the name.
  const mentionMatches = useMemo(() => {
    if (mentionQ === null) return []
    const s = mentionQ.toLowerCase()
    return team.filter(u => `${u.firstName} ${u.lastName}`.toLowerCase().includes(s)).slice(0, 6)
  }, [mentionQ, team])
  const onNoteChange = (v: string, caret: number) => {
    setNote(v)
    const before = v.slice(0, caret)
    const m = before.match(/(?:^|\s)@([\w ]{0,30})$/)
    setMentionQ(m ? m[1] : null)
    setMentionIdx(0)
  }
  const pickMention = (u: Teammate) => {
    const el = noteRef.current
    const caret = el ? el.selectionStart : note.length
    const before = note.slice(0, caret).replace(/@([\w ]{0,30})$/, '')
    const name = `${u.firstName} ${u.lastName}`.trim()
    const next = `${before}@${name} ${note.slice(caret)}`
    setNote(next)
    setMentionIds(ids => (ids.includes(u.id) ? ids : [...ids, u.id]))
    setMentionQ(null)
    requestAnimationFrame(() => { if (el) { const pos = before.length + name.length + 2; el.focus(); el.setSelectionRange(pos, pos) } })
  }

  const insertMacro = (m: Macro) => {
    macro.setOpen(false)
    const body = fillMacro(m.body, { firstName: firstNameOf(thread), rep: me.firstName })
    const el = replyRef.current
    if (ig) {
      // No greeting or sign-off to slot between: at the caret, or after what is there.
      if (!text.trim()) setText(body)
      else if (el) { const s = el.selectionStart, e = el.selectionEnd; setText(text.slice(0, s) + body + text.slice(e)) }
      else setText(text + '\n' + body)
    } else if (isBlank(text)) {
      // Drop it between the greeting and the sign-off.
      const greet = text.match(/^Hey[^\n]*,\n/)?.[0] || ''
      const sign = text.match(/\n+Thanks,\n[^\n]*$/)?.[0] || ''
      setText(`${greet}\n${body}\n${sign}`)
    } else if (el) {
      const s = el.selectionStart, e = el.selectionEnd
      setText(text.slice(0, s) + body + text.slice(e))
    } else setText(text + '\n' + body)
    onUseMacro(m.id)
    requestAnimationFrame(() => el?.focus())
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-white">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border-gray flex flex-wrap items-center gap-x-3 gap-y-2 shrink-0">
        <CustomerAvatar name={thread.customerName} email={thread.customerEmail || thread.igUsername} size={34} />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-off-black truncate leading-tight">{thread.customerName || (ig && thread.igUsername ? `@${thread.igUsername}` : '') || thread.customerEmail || 'Unknown sender'}</div>
          <div className="text-xs text-off-black/55 truncate inline-flex items-center gap-1.5 max-w-full">
            <ChannelMark channel={thread.channel} />
            {ig ? (
              thread.igUsername ? <a href={`https://instagram.com/${thread.igUsername}`} target="_blank" rel="noopener noreferrer" className="truncate hover:text-off-black hover:underline">@{thread.igUsername} · Instagram</a> : <span>Instagram DM</span>
            ) : <span className="truncate">{thread.subject || '(no subject)'}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => onPriority(!thread.priority)} disabled={busy} className={`${btnGhost} px-2`} title={thread.priority ? 'Remove priority (p)' : 'Mark priority (p)'}>
            <Star className={`w-4 h-4 ${thread.priority ? 'text-amber-500 fill-amber-500' : 'text-off-black/40'}`} />
          </button>
          <button onClick={onMarkUnread} disabled={busy} className={`${btnGhost} px-2`} title="Mark unread (u)">
            <MailOpen className="w-4 h-4 text-off-black/40" />
          </button>
          <AssigneePicker team={team} value={thread.assignee?.id || null} meId={me.id} onChange={onAssign} />
          {snoozed && <span className="text-[11px] text-off-black/50 inline-flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(thread.snoozedUntil as string).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>}
          {thread.status !== 'escalated' && thread.status !== 'closed' && (
            <button onClick={() => onStatus('escalated')} disabled={busy} className={btnSecondary} title="Pull Matt in"><AlertTriangle className="w-3.5 h-3.5" /> Escalate</button>
          )}
          {thread.status === 'closed' ? (
            <button onClick={() => onStatus('open')} disabled={busy} className={btnPrimary}><RotateCcw className="w-3.5 h-3.5" /> Reopen</button>
          ) : (
            <div className="relative inline-flex" ref={close.ref}>
              <button onClick={() => onStatus('closed')} disabled={busy} className={`${btnPrimary} rounded-r-none`} title="Close (c)"><Archive className="w-3.5 h-3.5" /> Close</button>
              <button onClick={() => close.setOpen(v => !v)} disabled={busy} className={`${btnPrimary} rounded-l-none px-1.5 border-l border-white/20`} title="Snooze, or mark waiting"><ChevronDown className="w-3.5 h-3.5" /></button>
              {close.open && (
                <div className="absolute right-0 top-full mt-1 w-52 p-1 rounded-lg bg-white border border-border-gray shadow-[0_6px_24px_rgba(0,0,0,0.12)] z-20">
                  <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-off-black/40">Snooze</div>
                  {SNOOZES.map(s => <button key={s.label} onClick={() => { close.setOpen(false); onSnooze(s.until().toISOString()) }} className="w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-subtle-gray">{s.label}</button>)}
                  {snoozed && <button onClick={() => { close.setOpen(false); onSnooze(null) }} className="w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-subtle-gray text-off-black/60">Unsnooze</button>}
                  {thread.status === 'open' && <><div className="my-1 border-t border-border-gray" /><button onClick={() => { close.setOpen(false); onStatus('waiting') }} className="w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-subtle-gray">Mark waiting on customer</button></>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3 bg-[#fcfcfc]">
        {timeline.map(it => it.kind === 'message'
          ? <Bubble key={it.m.id} m={it.m} />
          : <NoteCard key={it.n.id} n={it.n} team={team} meId={me.id} isAdmin={isAdmin} onDelete={() => onDeleteNote(it.n.id)} />)}
        <div ref={bottom} />
      </div>

      {/* Composer */}
      <div className={`border-t border-border-gray shrink-0 transition-colors ${mode === 'note' ? 'bg-amber-50' : 'bg-white'}`}>
        <div className="px-4 pt-2 flex items-center gap-1 text-[13px]">
          <button onClick={() => { setMode('reply'); requestAnimationFrame(() => replyRef.current?.focus()) }} className={`px-3 py-1.5 rounded-t-md border-b-2 ${mode === 'reply' ? 'border-dark-fill text-off-black font-semibold' : 'border-transparent text-off-black/50 hover:text-off-black'}`}>Reply</button>
          <button data-note-tab onClick={() => { setMode('note'); requestAnimationFrame(() => noteRef.current?.focus()) }} className={`px-3 py-1.5 rounded-t-md border-b-2 inline-flex items-center gap-1.5 ${mode === 'note' ? 'border-amber-500 text-amber-900 font-semibold' : 'border-transparent text-off-black/50 hover:text-off-black'}`}><StickyNote className="w-3.5 h-3.5" />Note</button>
          <span className="ml-auto text-[11px] text-off-black/40 truncate">{mode === 'reply' ? (ig ? `Reply as @${expectedHandle} to ${thread.igUsername ? `@${thread.igUsername}` : 'them'} on Instagram` : `to ${thread.customerEmail}`) : 'Only the team sees notes. @ to mention someone.'}</span>
        </div>
        {mode === 'reply' && window && (window.mode === 'closed' || window.mode === 'none' || window.mode === 'human_agent') && (
          <div className={`mx-4 mt-2 rounded-md border px-3 py-2 text-xs inline-flex items-start gap-2 ${windowClosed ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-border-gray bg-subtle-gray text-off-black/70'}`}>
            <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              {window.reason}
              {windowClosed && window.closesAt && window.mode === 'closed' && <> It closed {when(window.closesAt)}.</>}
              {windowClosed && <> You can still leave a note for the team.</>}
            </span>
          </div>
        )}
        {mode === 'reply' ? (
          <div className="px-4 pb-3">
            <textarea
              ref={replyRef} value={text} onChange={e => setText(e.target.value)} rows={ig ? 4 : 7} disabled={sending || windowClosed}
              placeholder={ig ? (windowClosed ? 'Replies are held until they write again' : 'Write the DM. Keep it short, like a text.') : undefined}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send(e.shiftKey) } }}
              className="w-full px-3 py-2.5 text-sm bg-white border border-border-gray rounded-md focus:outline-none focus:ring-2 focus:ring-off-black/10 focus:border-off-black/30 resize-y leading-relaxed"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="relative" ref={macro.ref}>
                <button data-macro-button onClick={() => macro.setOpen(v => !v)} className={btnSecondary} title="Insert a saved reply (m)"><Zap className="w-3.5 h-3.5" /> Macro</button>
                {macro.open && <MacroMenu macros={macros} onPick={insertMacro} onClose={() => macro.setOpen(false)} />}
              </div>
              {hasEmDash && <span className="text-[11px] text-red-600 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />No em dashes in anything a customer sees</span>}
              {ig && window?.open && window.mode === 'standard' && window.closesAt && <span className="text-[11px] text-off-black/45 inline-flex items-center gap-1" title="Instagram allows a reply within 24 hours of their last message"><Clock className="w-3 h-3" />Window closes {when(window.closesAt)}</span>}
              <span className="flex-1" />
              <span className="text-[11px] text-off-black/40 hidden md:inline">⌘↵ send · ⌘⇧↵ send and close</span>
              <button onClick={() => send(true)} disabled={!canSend} className={btnSecondary}>Send and close</button>
              <button onClick={() => send(false)} disabled={!canSend} className={btnPrimary}>
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 pb-3 relative">
            <textarea
              ref={noteRef} value={note} rows={4} disabled={sending} placeholder="Leave a note for the team..."
              onChange={e => onNoteChange(e.target.value, e.target.selectionStart)}
              onKeyDown={e => {
                if (mentionQ !== null && mentionMatches.length) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => Math.min(mentionMatches.length - 1, i + 1)); return }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx(i => Math.max(0, i - 1)); return }
                  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mentionMatches[mentionIdx]); return }
                  if (e.key === 'Escape') { setMentionQ(null); return }
                }
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); addNote() }
              }}
              className="w-full px-3 py-2.5 text-sm bg-white border border-amber-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-200 resize-y leading-relaxed"
            />
            {mentionQ !== null && mentionMatches.length > 0 && (
              <div className="absolute left-4 bottom-full mb-1 w-56 p-1 rounded-lg bg-white border border-border-gray shadow-[0_6px_24px_rgba(0,0,0,0.12)] z-30">
                {mentionMatches.map((u, i) => (
                  <button key={u.id} onMouseDown={e => { e.preventDefault(); pickMention(u) }} className={`w-full text-left px-2 py-1.5 text-sm rounded-md flex items-center gap-2 ${i === mentionIdx ? 'bg-subtle-gray' : ''}`}>
                    <Avatar user={u} size={18} />{u.firstName} {u.lastName}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] text-amber-900/60">Mentioned teammates see it under Mentions.</span>
              <span className="flex-1" />
              <button onClick={() => { setNote(''); setMentionIds([]); setMode('reply') }} className={btnGhost}><X className="w-3.5 h-3.5" /> Cancel</button>
              <button onClick={addNote} disabled={!note.trim() || sending} className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StickyNote className="w-3.5 h-3.5" />} Add note
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
