import { ArrowLeft, ArrowRight, Command, RefreshCw, Loader2, Send, Check } from 'lucide-react'
import { btnPrimary, btnSecondary, btnGhost, inputBase } from '@/lib/ui'
import type { Company, Contact, DraftResult, Variant } from '@/types/sales'

/**
 * The middle column: the email you are about to file.
 *
 * Five variants, one visible at a time. J and L flip between them, edits
 * stick to the variant you are on, and Cmd+Enter files whichever one is
 * showing. Everything in here is controlled by the page so the keyboard
 * handler up there can drive it.
 */
export default function Composer({
  company,
  contact,
  draft,
  variants,
  index,
  drafting,
  queueing,
  gmailConnected,
  onChange,
  onPrev,
  onNext,
  onRegenerate,
  onQueue,
  onMarkSent,
}: {
  company: Company | null
  contact: Contact | null
  draft: DraftResult | null
  variants: Variant[]
  index: number
  drafting: boolean
  queueing: boolean
  gmailConnected: boolean
  onChange: (v: Variant) => void
  onPrev: () => void
  onNext: () => void
  onRegenerate: () => void
  onQueue: () => void
  onMarkSent: () => void
}) {
  if (!company) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-off-black/40">
        Pick someone on the left, or import a list.
      </div>
    )
  }

  const current = variants[index]
  const hasQueuedDraft = company.lastTouch?.kind === 'EMAIL_DRAFT' && !company.lastTouch.sentAt
  const kbd = 'inline-flex h-5 items-center gap-1 rounded border border-white/30 bg-white/10 px-1.5 font-mono text-[10px] font-medium'
  const kbdDark = 'inline-flex h-5 items-center rounded border border-off-black/20 bg-off-black/5 px-1.5 font-mono text-[10px] font-medium text-off-black/60'

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Who and which touch */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-off-black truncate">
            {contact ? `${contact.firstName} ${contact.lastName}`.trim() : 'No contact'}{' '}
            <span className="text-off-black/45 font-normal">· {company.name}</span>
          </h2>
          <p className="text-xs text-off-black/55 mt-0.5">
            {contact?.email || <span className="text-red-600">No email on file</span>}
            {draft && (
              <>
                {' · '}Touch {draft.touchNumber} · <span className="font-medium">{draft.step.angle}</span>
                {draft.exhausted && <span className="text-amber-700"> · sequence complete</span>}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasQueuedDraft && (
            <button onClick={onMarkSent} className={btnSecondary} title="The draft went out from Gmail">
              <Check className="w-3.5 h-3.5" /> Mark sent
            </button>
          )}
          <button onClick={onRegenerate} disabled={drafting || !contact} className={btnGhost} title={draft?.source === 'template' ? 'Rebuild this draft from the template' : 'Write five new variants'}>
            <RefreshCw className={`w-3.5 h-3.5 ${drafting ? 'animate-spin' : ''}`} /> Regenerate
          </button>
        </div>
      </div>

      {draft && (
        <p className="text-xs text-off-black/55 bg-subtle-gray border border-border-gray rounded-md px-3 py-2 mb-3">
          <span className="font-semibold text-off-black/70">This email's job:</span> {draft.step.purpose}
          {draft.source === 'template' && (
            <span className="block mt-1 text-amber-700">
              Written from the cadence template, not a model. Edit it before you send.
            </span>
          )}
        </p>
      )}

      {/* The email */}
      <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-border-gray bg-white">
        {drafting ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm text-off-black/50">
            <Loader2 className="w-5 h-5 animate-spin" />
            {variants.length === 1 && draft?.source === 'template' ? 'Filling in the template…' : 'Writing five ways to say it…'}
          </div>
        ) : !current ? (
          <div className="flex-1 flex items-center justify-center text-sm text-off-black/40 px-6 text-center">
            {contact ? 'No draft yet. Press Regenerate.' : 'Add a contact with an email on the right before drafting.'}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-4 pt-3">
              <span className="text-xs font-semibold text-off-black/50 w-14">Subject</span>
              <input
                value={current.subject}
                onChange={e => onChange({ ...current, subject: e.target.value })}
                className={`${inputBase} flex-1`}
              />
            </div>
            <div className="flex items-start gap-2 px-4 pt-2 pb-3 flex-1 min-h-0">
              <span className="text-xs font-semibold text-off-black/50 w-14 pt-2">Body</span>
              <textarea
                value={current.body}
                onChange={e => onChange({ ...current, body: e.target.value })}
                className={`${inputBase} flex-1 h-full min-h-[260px] resize-none leading-relaxed`}
              />
            </div>
          </>
        )}
      </div>

      {/* Variant nav + file it */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-2">
          <button onClick={onPrev} disabled={index === 0 || drafting} className={btnGhost} title="Previous variant (J)">
            <ArrowLeft className="w-4 h-4" /> <kbd className={kbdDark}>J</kbd>
          </button>
          <div className="flex items-center gap-1.5 px-1">
            {variants.map((_, i) => (
              <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === index ? 'bg-dark-fill' : 'bg-off-black/20'}`} />
            ))}
            {variants.length > 0 && <span className="text-xs text-off-black/45 ml-1.5">{index + 1} of {variants.length}</span>}
          </div>
          <button onClick={onNext} disabled={index >= variants.length - 1 || drafting} className={btnGhost} title="Next variant (L)">
            <kbd className={kbdDark}>L</kbd> <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={onQueue}
          disabled={!current || queueing || drafting || !contact?.email}
          className={`${btnPrimary} px-4 py-2 text-sm`}
          title={gmailConnected ? 'Create the draft in Gmail' : 'Gmail is not connected; the draft is saved here only'}
        >
          {queueing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {gmailConnected ? 'Draft to Gmail' : 'Save draft'}
          <kbd className={kbd}><Command className="w-3 h-3" />↵</kbd>
        </button>
      </div>
    </div>
  )
}
