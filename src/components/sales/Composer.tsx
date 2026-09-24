import { useEffect, useRef, useState, type DragEvent } from 'react'
import { ArrowLeft, ArrowRight, Command, RefreshCw, Loader2, Send, Paperclip, ChevronDown, ChevronRight, CheckCircle2, AlertCircle, X, FileText, Image as ImageIcon, Sparkles, ExternalLink, LayoutTemplate } from 'lucide-react'
import { MotionTag } from './Queue'
import type { LibraryTemplate, OutreachTemplate, TemplateFill } from '@/lib/salesApi'
import { menuFor } from '@/lib/salesTemplates'

/** The saved templates and their fill values, loaded once by the page. */
export interface TemplateLibrary { templates: LibraryTemplate[]; fill: TemplateFill }
import { btnPrimary, btnSecondary, btnGhost, inputBase, cardLabel, textLink } from '@/lib/ui'
import type { Asset, Deal, DraftResult, Person, Variant } from '@/types/sales'

/** What a library card carries when dragged. */
export const ASSET_DRAG_TYPE = 'application/x-trackstar-asset'

/**
 * The middle column: the email, and what to do with it.
 *
 * Subject and body are editable in place and checked against the house
 * rules when you click away. Attachments are chips under the body: drop a
 * card from the library on the right, or click one. A "change it" line asks
 * the model to rewrite to an instruction ("shorter", "mention their Boston
 * team") without losing the rest. Send goes through your Gmail after the
 * undo window; Skip is one key and lives at the other end of the row so it
 * cannot be hit by accident. Closing a deal out is done in Attio.
 */
export default function Composer({
  deal, person, draft, variants, index, drafting, writing, gmailConnected, canSend, capReached, aiActive,
  problems, checking, onCheck,
  attachments, onAttach, onDetach,
  onChange, onPrev, onNext, onRewrite, onRevise, onSend, onSkip, adhoc, signature, library,
}: {
  deal: Deal | null
  person: Person | null
  draft: DraftResult | null
  variants: Variant[]
  index: number
  drafting: boolean
  /** The model is writing (Rewrite), as opposed to a template being filled in. */
  writing?: boolean
  gmailConnected: boolean
  canSend: boolean
  capReached: boolean
  aiActive: boolean
  problems: string[] | null
  checking: boolean
  onCheck: () => void
  attachments: Asset[]
  onAttach: (asset: Asset) => void
  onDetach: (id: string) => void
  onChange: (v: Variant) => void
  onPrev: () => void
  onNext: () => void
  onRewrite: () => void
  onRevise: (instruction: string) => Promise<void>
  onSend: () => void
  onSkip: (reason?: string) => void
  /** Written from New email, outside the queue: any stage is fine, Skip means close. */
  adhoc?: boolean
  /** Your signature HTML, shown where it will sit in the sent email. */
  signature?: string
  /** The saved templates, for the Templates menu. Null until loaded. */
  library: TemplateLibrary | null
}) {
  const [whyOpen, setWhyOpen] = useState(false)
  const [skipOpen, setSkipOpen] = useState(false)
  const [skipReason, setSkipReason] = useState('')
  const [instruction, setInstruction] = useState('')
  const [revising, setRevising] = useState(false)
  const [over, setOver] = useState(false)

  if (!deal) {
    return (
      <div className="flex-1 min-w-0 flex items-center justify-center text-sm text-off-black/40 min-h-[320px]">
        Pick someone on the left.
      </div>
    )
  }

  const kbd = 'inline-flex h-5 items-center gap-0.5 rounded border border-white/30 bg-white/10 px-1.5 text-[10px] font-medium'
  const who = person ? person.fullName || `${person.firstName} ${person.lastName}`.trim() : 'Nobody to email'

  // Past Reached Out, a person is talking. That happens in Gmail and Attio.
  if (!adhoc && !['Not Contacted', 'Needs Enrichment', 'Reached Out'].includes(String(deal.stage))) {
    return (
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="px-6 py-4 border-b border-border-gray">
          <div className="text-lg font-bold text-off-black">{who} <span className="text-off-black/45 font-normal">· {deal.name}</span></div>
          <div className="text-xs text-success-green mt-0.5">{deal.stage}. The sequence is done here.</div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm text-off-black/65 max-w-[40ch]">This one is a conversation now. Write to them from Gmail and keep the deal current in Attio.</p>
          {deal.webUrl && <a href={deal.webUrl} target="_blank" rel="noopener noreferrer" className={`${btnPrimary} px-5 py-2.5 text-sm`}>Open in Attio <ExternalLink className="w-3.5 h-3.5" /></a>}
        </div>
      </div>
    )
  }

  const current = variants[index]
  const imageRequired = deal.pipeline === 'CHARITY' && draft?.touchNumber === 1
  const hasImage = attachments.some(a => a.kind === 'image')
  const missingRequired = imageRequired && !hasImage
  const blocked = Boolean(problems && problems.length)
  const sendDisabled = !current || drafting || !person?.email || missingRequired || !canSend || blocked || (deal.exhausted && !adhoc)
  const sendTitle = blocked ? (problems as string[])[0]
    : deal.exhausted && !adhoc ? 'The sequence has run out. Decide the stage on the right.'
    : !gmailConnected ? 'Connect Gmail in Settings to send'
    : capReached ? 'Today\'s cap is reached. Raise it in Settings if you mean to.'
    : missingRequired ? 'A charity first touch has to carry a co-branded example'
    : !person?.email ? 'No email on this person in Attio'
    : 'Send through your Gmail'

  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setOver(false)
    const raw = e.dataTransfer.getData(ASSET_DRAG_TYPE)
    if (!raw) return
    try { onAttach(JSON.parse(raw) as Asset) } catch { /* not ours */ }
  }
  const revise = async () => {
    const text = instruction.trim()
    if (!text || !current) return
    setRevising(true)
    try { await onRevise(text); setInstruction('') } finally { setRevising(false) }
  }

  return (
    <div
      className={`flex-1 min-w-0 flex flex-col min-h-0 transition-colors ${over ? 'bg-subtle-gray/60' : ''}`}
      onDragOver={e => { if (e.dataTransfer.types.includes(ASSET_DRAG_TYPE)) { e.preventDefault(); setOver(true) } }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-border-gray flex-shrink-0">
        <div className="min-w-0">
          <div className="text-lg font-bold text-off-black truncate flex items-center gap-2">
            <span className="truncate">{who} <span className="text-off-black/45 font-normal">· {deal.name}</span></span>
            <MotionTag motion={deal.motion} />
          </div>
          <div className="text-xs text-off-black/55 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{person?.email || <span className="text-red-600">{deal.genericOnly ? 'Only a generic inbox in Attio. Find a person.' : 'No email in Attio'}</span>}</span>
            {adhoc && <span className="px-2 py-0.5 rounded bg-off-black/10 text-off-black/60 font-medium">{deal.id.startsWith('adhoc:') ? 'One-off, no deal' : `Outside the queue · ${deal.stage}`}</span>}
            {draft && (
              <>
                {!adhoc && <span className="px-2 py-0.5 rounded bg-off-black/10 text-off-black/60 font-medium">
                  {draft.touchNumber === 1 ? 'First touch' : `Follow-up ${draft.touchNumber - 1}`}
                </span>}
                {draft.source === 'template' && <span className="text-amber-700">template, fill in the opener</span>}
                {draft.source === 'model' && <span>written just now</span>}
              </>
            )}
          </div>
        </div>
        <button onClick={() => setWhyOpen(o => !o)} className={`${textLink} shrink-0 mt-1.5 disabled:opacity-40`} disabled={!draft}>
          Why this email {whyOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </div>
      {whyOpen && draft && (
        <p className="text-xs text-off-black/60 bg-subtle-gray border-b border-border-gray px-6 py-2.5 leading-snug">{draft.step.purpose}</p>
      )}

      {drafting ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm text-off-black/50 min-h-[300px]">
          <Loader2 className="w-5 h-5 animate-spin" /> {writing ? 'Writing…' : 'Loading the draft…'}
        </div>
      ) : !current ? (
        <div className="flex-1 flex items-center justify-center text-sm text-off-black/40 px-6 text-center min-h-[300px]">
          {person?.email ? 'No draft yet. Press Rewrite.' : 'Add a person with an email to this deal in Attio first.'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[64px_1fr] items-center gap-2 px-6 py-2.5 border-b border-border-gray flex-shrink-0">
            <span className={cardLabel}>Subject</span>
            <input value={current.subject} onChange={e => onChange({ ...current, subject: e.target.value })} onBlur={onCheck} className={`${inputBase} w-full border-transparent bg-transparent px-1 font-medium focus:bg-white focus:border-border-gray`} />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
          <BodyEditor body={current.body} signature={signature} onChange={body => onChange({ ...current, body })} onBlur={onCheck} />

          {/* Change it: one instruction, the model does the rest. */}
          {aiActive && (
            <div className="grid grid-cols-[64px_1fr] items-center gap-2 px-6 pb-2">
              <span className={cardLabel}><Sparkles className="w-3 h-3 inline -mt-0.5" /></span>
              <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); revise() }}>
                <input value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="Change it: shorter, warmer, mention their Boston team…" className={`${inputBase} flex-1`} disabled={revising} />
                <button type="submit" disabled={revising || !instruction.trim()} className={btnSecondary}>{revising ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Apply'}</button>
              </form>
            </div>
          )}

          <div className="px-6 pb-2 pl-[96px] text-xs">
            {checking ? (
              <span className="inline-flex items-center gap-1.5 text-off-black/45"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking the house rules…</span>
            ) : problems === null ? (
              <span className="text-off-black/40">Edits are checked against the house rules when you click away.</span>
            ) : problems.length === 0 ? (
              <span className="inline-flex items-center gap-1.5 text-success-green"><CheckCircle2 className="w-3.5 h-3.5" /> Passes the house rules</span>
            ) : (
              <ul className="space-y-1">
                {problems.map((p, i) => <li key={i} className="flex items-start gap-1.5 text-red-700"><AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{p}</span></li>)}
              </ul>
            )}
          </div>

          {/* Attachments */}
          <div className={`mx-6 mb-4 ml-[96px] rounded-md border border-dashed px-3 py-2.5 text-xs flex flex-wrap items-center gap-2 ${over ? 'border-dark-fill bg-white' : missingRequired ? 'border-red-300 bg-red-50/40' : 'border-border-gray bg-subtle-gray'}`}>
            <Paperclip className={`w-3.5 h-3.5 ${missingRequired ? 'text-red-600' : 'text-off-black/40'}`} />
            {attachments.map(a => (
              <span key={a.id} className="inline-flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded border border-border-gray bg-white font-medium">
                {a.kind === 'image' && a.previewUrl ? <img src={a.previewUrl} alt="" className="h-5 w-auto rounded" /> : a.kind === 'image' ? <ImageIcon className="w-3.5 h-3.5 text-off-black/50" /> : <FileText className="w-3.5 h-3.5 text-off-black/50" />}
                <span className="max-w-[160px] truncate">{a.name}</span>
                <button onClick={() => onDetach(a.id)} className="text-off-black/40 hover:text-off-black" title="Remove"><X className="w-3 h-3" /></button>
              </span>
            ))}
            {attachments.length === 0 && (
              <span className={missingRequired ? 'text-red-600' : 'text-off-black/45'}>{missingRequired ? 'A charity first touch needs a co-branded example. Drag one in from the library.' : 'Drag a deck or image here from the library. Images show at the end of the email.'}</span>
            )}
          </div>
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-2 px-6 py-3 border-t border-border-gray flex-shrink-0">
        <div className="flex items-center gap-2 relative">
          {adhoc ? <button onClick={() => onSkip()} className={btnSecondary} title="Back to the queue (S)">Close</button> : <button onClick={() => setSkipOpen(o => !o)} className={btnSecondary} title="Hide until tomorrow (S)">Skip today</button>}
          {skipOpen && !adhoc && (
            <form
              className="absolute bottom-full left-0 mb-2 w-72 rounded-lg border border-border-gray bg-white shadow-lg p-3 flex flex-col gap-2 z-10"
              onSubmit={e => { e.preventDefault(); onSkip(skipReason.trim() || undefined); setSkipOpen(false); setSkipReason('') }}
            >
              <span className="text-xs text-off-black/60">Moves to tomorrow. Does not count as a touch. A reason becomes a note on the deal.</span>
              <input autoFocus value={skipReason} onChange={e => setSkipReason(e.target.value)} placeholder="Why? (optional)" className={`${inputBase} w-full`} onKeyDown={e => { if (e.key === 'Escape') { setSkipOpen(false); setSkipReason('') } }} />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => { setSkipOpen(false); setSkipReason('') }} className={btnGhost}>Cancel</button>
                <button type="submit" className={`${btnPrimary} px-3 py-1.5 text-xs`}>Skip</button>
              </div>
            </form>
          )}
          <TemplateMenu deal={deal} person={person} disabled={drafting || !current} onRewrite={onRewrite} aiActive={aiActive} library={library}
            onPick={t => current && onChange({ ...current, subject: t.subject ?? current.subject, body: t.body })} />
          {aiActive && (
            <button onClick={onRewrite} disabled={drafting || !person} className={btnSecondary} title="Write it again">
              <RefreshCw className={`w-3.5 h-3.5 ${drafting ? 'animate-spin' : ''}`} /> Rewrite
            </button>
          )}
          {variants.length > 1 && (
            <span className="flex items-center gap-1 ml-2 text-xs text-off-black/45">
              <button onClick={onPrev} disabled={index === 0} className={btnGhost} title="Previous version"><ArrowLeft className="w-3.5 h-3.5" /></button>
              {index + 1} of {variants.length}
              <button onClick={onNext} disabled={index >= variants.length - 1} className={btnGhost} title="Next version"><ArrowRight className="w-3.5 h-3.5" /></button>
            </span>
          )}
        </div>
        <button onClick={onSend} disabled={sendDisabled} className={`${btnPrimary} px-5 py-2.5 text-sm`} title={sendTitle}>
          <Send className="w-4 h-4" /> Send <kbd className={kbd}><Command className="w-3 h-3" />↵</kbd>
        </button>
      </div>
    </div>
  )
}

/**
 * The Templates button: the saved templates from Settings, filled in for
 * this person (this deal's motion first), plus the sequence's copy for this touch. Picking one
 * replaces the body; a template marked "stay on the thread" keeps the subject.
 */
function TemplateMenu({ deal, person, disabled, onPick, onRewrite, aiActive, library }: {
  deal: Deal
  person: Person | null
  disabled: boolean
  onPick: (t: { subject: string | null; body: string }) => void
  onRewrite: () => void
  aiActive: boolean
  library: TemplateLibrary | null
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown); window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  // Loaded with the page and filled here from the person on screen: no wait.
  const items = library ? menuFor(library.templates, deal, person, library.fill) : []
  const groups = items.reduce<Record<string, OutreachTemplate[]>>((acc, t) => {
    (acc[t.group] = acc[t.group] || []).push(t); return acc
  }, {})

  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen(o => !o)} disabled={disabled} className={btnSecondary} title="Choose a template">
        <LayoutTemplate className="w-3.5 h-3.5" /> Templates <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-[380px] max-h-[60vh] overflow-y-auto rounded-lg border border-border-gray bg-white shadow-lg z-20">
          {!aiActive && (
            <button onClick={() => { onRewrite(); setOpen(false) }} className="w-full text-left px-4 py-3 border-b border-border-gray hover:bg-subtle-gray">
              <span className="block text-sm font-medium text-off-black">This touch in the sequence</span>
              <span className="block text-xs text-off-black/50 mt-0.5">The tool's own copy for where this deal is. Edit it in Settings.</span>
            </button>
          )}
          {!library && <div className="px-4 py-4 text-xs text-off-black/50 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading the templates…</div>}
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <div className="px-4 py-2 bg-subtle-gray border-b border-border-gray text-[10px] font-semibold text-off-black/50 uppercase tracking-wider">{group}</div>
              {items.map(t => (
                <button key={t.id} onClick={() => { onPick(t); setOpen(false) }} className="w-full text-left px-4 py-3 border-b border-border-gray last:border-b-0 hover:bg-subtle-gray">
                  <span className="block text-sm font-medium text-off-black">{t.title}</span>
                  {t.useFor && <span className="block text-xs text-off-black/55 mt-0.5 leading-snug">{t.useFor}</span>}
                  <span className="block text-[11px] text-off-black/40 mt-1 truncate">{t.subject ? `Subject: ${t.subject}` : 'Replies on the thread, keeps the subject'}</span>
                </button>
              ))}
            </div>
          ))}
          {library && items.length === 0 && <div className="px-4 py-3 text-xs text-off-black/50">No saved templates yet.</div>}
          {library && <div className="px-4 py-2.5 border-t border-border-gray text-[11px] text-off-black/45">Add or change these in Settings, under Templates.</div>}
        </div>
      )}
    </div>
  )
}

/** A textarea that grows with its text, so the pane scrolls rather than the box. */
function AutoGrow({ value, onChange, onBlur, className, placeholder, minRows = 3 }: {
  value: string; onChange: (v: string) => void; onBlur?: () => void; className?: string; placeholder?: string; minRows?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return <textarea ref={ref} rows={minRows} value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} className={`${className || ''} resize-none overflow-hidden`} />
}

/** Where a P.S. starts: a paragraph that opens with "P.S.", as composeHtml splits it on send. */
const PS_START = /(^|\n[ \t]*\n)(?=[ \t]*p\.?s\.?[\s:.-])/i
const IS_PS = /^\s*p\.?s\.?[\s:.-]/i

function splitBody(body: string) {
  const m = PS_START.exec(body)
  if (!m) return { main: body, ps: '' }
  const at = m.index + m[1].length
  return { main: body.slice(0, at).replace(/\s+$/, ''), ps: body.slice(at).trim() }
}

/**
 * The email as one page: what you write, your signature where it will sit,
 * and room under it for a P.S. It stays one string underneath; on send the
 * server puts anything from "P.S." on below the signature, so text typed
 * under the signature gets a "P.S." if it does not start with one.
 * Attachments are not in here: they are chips below and go at the very end.
 * Local text is kept while typing so nothing jumps under the cursor.
 */
function BodyEditor({ body, signature, onChange, onBlur }: {
  body: string; signature?: string; onChange: (body: string) => void; onBlur: () => void
}) {
  const [parts, setParts] = useState(() => splitBody(body))
  const emitted = useRef(body)
  useEffect(() => {
    if (body !== emitted.current) { setParts(splitBody(body)); emitted.current = body }
  }, [body])
  const update = (main: string, ps: string) => {
    setParts({ main, ps })
    const extra = ps.trim()
    const next = extra ? `${main.replace(/\s+$/, '')}\n\n${IS_PS.test(extra) ? extra : `P.S. ${extra}`}` : main
    emitted.current = next
    onChange(next)
  }
  const box = 'block w-full text-sm leading-relaxed text-off-black bg-transparent px-1 focus:outline-none placeholder:text-off-black/30'
  return (
    <div className="px-6 pt-3 pb-2 grid grid-cols-[64px_1fr] gap-x-2">
      <span className={`${cardLabel} pt-2`}>Body</span>
      <div className="rounded-md px-1 py-1 focus-within:bg-subtle-gray/50 transition-colors">
        <AutoGrow value={parts.main} onChange={v => update(v, parts.ps)} onBlur={onBlur} minRows={8} className={box} />
        <div className="px-1 pt-3 pb-2 text-sm text-off-black" title="Your signature, added on send. Change it in Settings, under Me.">
          {signature
            ? <div dangerouslySetInnerHTML={{ __html: signature }} />
            : <span className="text-xs text-off-black/40">No signature yet. Add one in Settings, under Me.</span>}
        </div>
        <AutoGrow value={parts.ps} onChange={v => update(parts.main, v)} onBlur={onBlur} minRows={1} placeholder="P.S. (optional)" className={box} />
      </div>
    </div>
  )
}
