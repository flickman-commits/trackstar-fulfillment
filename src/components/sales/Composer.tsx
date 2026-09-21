import { useState, type DragEvent } from 'react'
import { ArrowLeft, ArrowRight, Command, RefreshCw, Loader2, Send, Paperclip, ChevronDown, ChevronRight, CheckCircle2, AlertCircle, X, FileText, Image as ImageIcon, Sparkles, ExternalLink } from 'lucide-react'
import { OverdueBadge } from './Queue'
import { btnPrimary, btnGhost, inputBase } from '@/lib/ui'
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
  deal, person, draft, variants, index, drafting, gmailConnected, canSend, capReached, aiActive,
  problems, checking, onCheck,
  attachments, onAttach, onDetach, suggested,
  onChange, onPrev, onNext, onRewrite, onRevise, onSend, onSkip, adhoc,
}: {
  deal: Deal | null
  person: Person | null
  draft: DraftResult | null
  variants: Variant[]
  index: number
  drafting: boolean
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
  suggested: Asset | null
  onChange: (v: Variant) => void
  onPrev: () => void
  onNext: () => void
  onRewrite: () => void
  onRevise: (instruction: string) => Promise<void>
  onSend: () => void
  onSkip: (reason?: string) => void
  /** Written from New email, outside the queue: any stage is fine, Skip means close. */
  adhoc?: boolean
}) {
  const [whyOpen, setWhyOpen] = useState(false)
  const [skipOpen, setSkipOpen] = useState(false)
  const [skipReason, setSkipReason] = useState('')
  const [instruction, setInstruction] = useState('')
  const [revising, setRevising] = useState(false)
  const [over, setOver] = useState(false)

  if (!deal) {
    return (
      <div className="flex-1 min-w-0 flex items-center justify-center text-sm text-off-black/40 rounded-lg border border-dashed border-border-gray bg-white/60 min-h-[320px]">
        Pick someone on the left.
      </div>
    )
  }

  const kbd = 'inline-flex h-5 items-center gap-1 rounded border border-white/30 bg-white/10 px-1.5 font-mono text-[10px] font-medium'
  const kbdDark = 'inline-flex h-5 items-center rounded border border-off-black/20 bg-off-black/5 px-1.5 font-mono text-[10px] font-medium text-off-black/60'
  const who = person ? person.fullName || `${person.firstName} ${person.lastName}`.trim() : 'Nobody to email'

  // Past Reached Out, a person is talking. That happens in Gmail and Attio.
  if (!adhoc && !['Not Contacted', 'Needs Enrichment', 'Reached Out'].includes(String(deal.stage))) {
    return (
      <div className="flex-1 min-w-0 flex flex-col rounded-lg border border-border-gray bg-white">
        <div className="px-4 py-3 border-b border-border-gray">
          <div className="text-[15px] font-bold">{who} <span className="text-off-black/45 font-normal">· {deal.name}</span></div>
          <div className="text-xs text-success-green mt-0.5">{deal.stage}. The sequence is done here.</div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm text-off-black/65 max-w-[40ch]">This one is a conversation now. Write to them from Gmail and keep the deal current in Attio.</p>
          {deal.webUrl && <a href={deal.webUrl} target="_blank" rel="noopener noreferrer" className={`${btnPrimary} px-4 py-2 text-sm`}>Open in Attio <ExternalLink className="w-3.5 h-3.5" /></a>}
        </div>
      </div>
    )
  }

  const current = variants[index]
  const imageRequired = deal.pipeline === 'CHARITY' && draft?.touchNumber === 1
  const hasImage = attachments.some(a => a.kind === 'image')
  const missingRequired = imageRequired && !hasImage && !suggested
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
      className={`flex-1 min-w-0 flex flex-col rounded-lg border bg-white transition-colors ${over ? 'border-dark-fill ring-2 ring-dark-fill/20' : 'border-border-gray'}`}
      onDragOver={e => { if (e.dataTransfer.types.includes(ASSET_DRAG_TYPE)) { e.preventDefault(); setOver(true) } }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border-gray">
        <div className="min-w-0">
          <div className="text-[15px] font-bold truncate flex items-center gap-2">
            <span className="truncate">{who} <span className="text-off-black/45 font-normal">· {deal.name}</span></span>
            <OverdueBadge days={deal.overdueDays} />
          </div>
          <div className="text-xs text-off-black/55 mt-0.5 flex flex-wrap items-center gap-x-2">
            <span>{person?.email || <span className="text-red-600">{deal.genericOnly ? 'Only a generic inbox in Attio. Find a person.' : 'No email in Attio'}</span>}</span>
            {adhoc && <span className="px-1.5 py-0.5 rounded bg-subtle-gray border border-border-gray text-off-black/70">{deal.id.startsWith('adhoc:') ? 'One-off, no deal' : `Outside the queue · ${deal.stage}`}</span>}
            {draft && (
              <>
                {!adhoc && <span className="px-1.5 py-0.5 rounded bg-subtle-gray border border-border-gray text-off-black/70">
                  {draft.touchNumber === 1 ? 'First touch' : `Follow-up ${draft.touchNumber - 1}`}
                </span>}
                {draft.source === 'prepared' && <span>written overnight</span>}
                {draft.source === 'template' && <span className="text-amber-700">template, fill in the opener</span>}
                {draft.source === 'model' && <span>written just now</span>}
              </>
            )}
          </div>
        </div>
        <button onClick={() => setWhyOpen(o => !o)} className={`${btnGhost} shrink-0`} disabled={!draft}>
          Why this email {whyOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </div>
      {whyOpen && draft && (
        <p className="text-xs text-off-black/60 bg-subtle-gray border-b border-border-gray px-4 py-2 leading-snug">{draft.step.purpose}</p>
      )}

      {drafting ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm text-off-black/50 min-h-[300px]">
          <Loader2 className="w-5 h-5 animate-spin" /> Writing…
        </div>
      ) : !current ? (
        <div className="flex-1 flex items-center justify-center text-sm text-off-black/40 px-6 text-center min-h-[300px]">
          {person?.email ? 'No draft yet. Press Rewrite.' : 'Add a person with an email to this deal in Attio first.'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[64px_1fr] items-center gap-2 px-4 py-2 border-b border-border-gray">
            <span className="font-mono text-[10.5px] tracking-wider uppercase text-off-black/40">Subject</span>
            <input value={current.subject} onChange={e => onChange({ ...current, subject: e.target.value })} onBlur={onCheck} className={`${inputBase} w-full border-transparent bg-transparent px-1 focus:bg-white focus:border-border-gray`} />
          </div>
          <div className="flex-1 min-h-0 grid grid-cols-[64px_1fr] gap-2 px-4 pt-3 pb-2">
            <span className="font-mono text-[10.5px] tracking-wider uppercase text-off-black/40 pt-2">Body</span>
            <textarea
              value={current.body}
              onChange={e => onChange({ ...current, body: e.target.value })}
              onBlur={onCheck}
              className="w-full h-full min-h-[240px] resize-none text-[15px] leading-relaxed bg-transparent px-1 py-1 focus:outline-none focus:bg-subtle-gray/60 rounded"
            />
          </div>

          {/* Change it: one instruction, the model does the rest. */}
          {aiActive && (
            <div className="grid grid-cols-[64px_1fr] items-center gap-2 px-4 pb-2">
              <span className="font-mono text-[10.5px] tracking-wider uppercase text-off-black/40"><Sparkles className="w-3 h-3 inline -mt-0.5" /></span>
              <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); revise() }}>
                <input value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="Change it: shorter, warmer, mention their Boston team…" className={`${inputBase} flex-1`} disabled={revising} />
                <button type="submit" disabled={revising || !instruction.trim()} className={btnGhost}>{revising ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Apply'}</button>
              </form>
            </div>
          )}

          <div className="px-4 pb-2 pl-[88px] text-xs">
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
          <div className={`mx-4 mb-3 ml-[88px] rounded-lg border border-dashed px-3 py-2 text-xs flex flex-wrap items-center gap-2 ${over ? 'border-dark-fill bg-subtle-gray' : missingRequired ? 'border-red-300 bg-red-50/40' : 'border-border-gray'}`}>
            <Paperclip className={`w-3.5 h-3.5 ${missingRequired ? 'text-red-600' : 'text-off-black/40'}`} />
            {attachments.map(a => (
              <span key={a.id} className="inline-flex items-center gap-1.5 pl-1 pr-1.5 py-0.5 rounded-md border border-border-gray bg-white">
                {a.kind === 'image' && a.previewUrl ? <img src={a.previewUrl} alt="" className="h-5 w-auto rounded" /> : a.kind === 'image' ? <ImageIcon className="w-3.5 h-3.5 text-off-black/50" /> : <FileText className="w-3.5 h-3.5 text-off-black/50" />}
                <span className="max-w-[160px] truncate">{a.name}</span>
                <button onClick={() => onDetach(a.id)} className="text-off-black/40 hover:text-off-black" title="Remove"><X className="w-3 h-3" /></button>
              </span>
            ))}
            {attachments.length === 0 && suggested && (
              <button onClick={() => onAttach(suggested)} className="inline-flex items-center gap-1.5 pl-1 pr-1.5 py-0.5 rounded-md border border-dashed border-border-gray text-off-black/60 hover:text-off-black hover:bg-white" title="Auto-picked for this deal; click to attach">
                {suggested.previewUrl ? <img src={suggested.previewUrl} alt="" className="h-5 w-auto rounded opacity-70" /> : <ImageIcon className="w-3.5 h-3.5" />}
                <span className="max-w-[160px] truncate">{suggested.name}</span>
                <span className="text-off-black/40">· will attach</span>
              </button>
            )}
            {attachments.length === 0 && !suggested && (
              <span className={missingRequired ? 'text-red-600' : 'text-off-black/45'}>{missingRequired ? 'A charity first touch needs a co-branded example. Drag one in from the library.' : 'Drag a deck or image here from the library.'}</span>
            )}
            <span className="ml-auto text-off-black/40">Your signature is added when it sends.</span>
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-border-gray bg-subtle-gray rounded-b-lg">
        <div className="flex items-center gap-1 relative">
          {adhoc ? <button onClick={() => onSkip()} className={btnGhost} title="Back to the queue">Close <kbd className={kbdDark}>S</kbd></button> : <button onClick={() => setSkipOpen(o => !o)} className={btnGhost} title="Hide until tomorrow">Skip today <kbd className={kbdDark}>S</kbd></button>}
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
          <button onClick={onRewrite} disabled={drafting || !person} className={btnGhost} title={aiActive ? 'Write it again' : 'Reset to the template'}>
            <RefreshCw className={`w-3.5 h-3.5 ${drafting ? 'animate-spin' : ''}`} /> {aiActive ? 'Rewrite' : 'Template'}
          </button>
          {variants.length > 1 && (
            <span className="flex items-center gap-1 ml-2 text-xs text-off-black/45">
              <button onClick={onPrev} disabled={index === 0} className={btnGhost} title="Previous variant (J)"><ArrowLeft className="w-3.5 h-3.5" /></button>
              {index + 1} of {variants.length}
              <button onClick={onNext} disabled={index >= variants.length - 1} className={btnGhost} title="Next variant (L)"><ArrowRight className="w-3.5 h-3.5" /></button>
            </span>
          )}
        </div>
        <button onClick={onSend} disabled={sendDisabled} className={`${btnPrimary} px-4 py-2 text-sm`} title={sendTitle}>
          <Send className="w-4 h-4" /> Send <kbd className={kbd}><Command className="w-3 h-3" />↵</kbd>
        </button>
      </div>
    </div>
  )
}
