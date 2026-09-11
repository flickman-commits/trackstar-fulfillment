import { useState } from 'react'
import { ArrowLeft, ArrowRight, Command, RefreshCw, Loader2, Send, ExternalLink, Paperclip, ChevronDown, ChevronRight } from 'lucide-react'
import { btnPrimary, btnGhost, inputBase } from '@/lib/ui'
import type { Company, Contact, DraftResult, Mockup, Variant } from '@/types/sales'

/**
 * The middle column: the email, and what to do with it.
 *
 * No explainer by default. The one point this email has to make is behind a
 * "Why this email" toggle for the curious; a rep who has read the draft does
 * not need it narrated. Variants only show their carousel when there is more
 * than one. The primary action is Send; Skip and Not interested are one key
 * each and live at the other end of the row so they cannot be hit by
 * accident.
 *
 * A company with a reply waiting gets no composer at all: the answer is
 * written in Gmail, so the pane says so and links straight to the thread.
 */
export default function Composer({
  company, contact, draft, variants, index, drafting, gmailConnected, canSend, capReached,
  mockups, mockupId, onMockupChange, onManageMockups,
  onChange, onPrev, onNext, onRewrite, onSend, onSkip, onNotInterested,
}: {
  company: Company | null
  contact: Contact | null
  draft: DraftResult | null
  variants: Variant[]
  index: number
  drafting: boolean
  gmailConnected: boolean
  canSend: boolean
  capReached: boolean
  mockups: Mockup[]
  mockupId: string | null
  onMockupChange: (id: string) => void
  onManageMockups: () => void
  onChange: (v: Variant) => void
  onPrev: () => void
  onNext: () => void
  onRewrite: () => void
  onSend: () => void
  onSkip: () => void
  onNotInterested: () => void
}) {
  const [whyOpen, setWhyOpen] = useState(false)

  if (!company) {
    return (
      <div className="flex-1 min-w-0 flex items-center justify-center text-sm text-off-black/40 rounded-lg border border-dashed border-border-gray bg-white/60 min-h-[320px]">
        Pick someone on the left.
      </div>
    )
  }

  const kbd = 'inline-flex h-5 items-center gap-1 rounded border border-white/30 bg-white/10 px-1.5 font-mono text-[10px] font-medium'
  const kbdDark = 'inline-flex h-5 items-center rounded border border-off-black/20 bg-off-black/5 px-1.5 font-mono text-[10px] font-medium text-off-black/60'
  const who = contact ? `${contact.firstName} ${contact.lastName}`.trim() : 'No contact'

  // A reply is answered in Gmail, not here.
  if (company.replyPending) {
    const threadId = company.touches?.find(t => t.gmailThreadId)?.gmailThreadId || company.lastTouch?.gmailThreadId
    return (
      <div className="flex-1 min-w-0 flex flex-col rounded-lg border border-border-gray bg-white">
        <div className="px-4 py-3 border-b border-border-gray">
          <div className="text-[15px] font-bold">{who} <span className="text-off-black/45 font-normal">· {company.name}</span></div>
          <div className="text-xs text-success-green mt-0.5">Replied{company.lastReplyAt ? ` ${new Date(company.lastReplyAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : ''}. The sequence is paused.</div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm text-off-black/65 max-w-[40ch]">Answer in Gmail. When your message is the latest in the thread, this clears on its own.</p>
          <a
            href={threadId ? `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(threadId)}` : 'https://mail.google.com/'}
            target="_blank" rel="noopener noreferrer"
            className={`${btnPrimary} px-4 py-2 text-sm`}
          >
            Open the thread in Gmail <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <p className="text-xs text-off-black/45">Set the stage on the right when you know where it stands.</p>
        </div>
      </div>
    )
  }

  const current = variants[index]
  const mockupRequired = company.pipeline === 'CHARITY' && draft?.touchNumber === 1
  const chosen = mockups.find(m => m.id === mockupId) || null
  const missingRequired = mockupRequired && !chosen
  const sendDisabled = !current || drafting || !contact?.email || missingRequired || !canSend
  const sendTitle = !gmailConnected ? 'Connect Gmail in Settings to send'
    : capReached ? 'Today\'s cap is reached. Raise it in Settings if you mean to.'
    : missingRequired ? 'A charity first touch has to carry a mockup'
    : contact?.emailSource === 'guessed' ? 'This address was guessed; confirm it first'
    : 'Send through your Gmail'

  return (
    <div className="flex-1 min-w-0 flex flex-col rounded-lg border border-border-gray bg-white">
      {/* Who, and which touch */}
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border-gray">
        <div className="min-w-0">
          <div className="text-[15px] font-bold truncate">{who} <span className="text-off-black/45 font-normal">· {company.name}</span></div>
          <div className="text-xs text-off-black/55 mt-0.5 flex flex-wrap items-center gap-x-2">
            <span>{contact?.email || <span className="text-red-600">No email on file</span>}</span>
            {draft && (
              <>
                <span className="px-1.5 py-0.5 rounded bg-subtle-gray border border-border-gray text-off-black/70">
                  {draft.touchNumber === 1 ? 'First touch' : `Follow-up ${draft.touchNumber - 1}`}
                </span>
                {draft.exhausted && <span className="text-amber-700">sequence complete</span>}
                {draft.source === 'prepared' && <span>written overnight</span>}
                {draft.source === 'template' && <span className="text-amber-700">template, not written for them</span>}
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

      {/* The email */}
      {drafting ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm text-off-black/50 min-h-[300px]">
          <Loader2 className="w-5 h-5 animate-spin" /> Writing…
        </div>
      ) : !current ? (
        <div className="flex-1 flex items-center justify-center text-sm text-off-black/40 px-6 text-center min-h-[300px]">
          {contact ? 'No draft yet. Press Rewrite.' : 'Add a contact with an email on the right first.'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[64px_1fr] items-center gap-2 px-4 py-2 border-b border-border-gray">
            <span className="font-mono text-[10.5px] tracking-wider uppercase text-off-black/40">Subject</span>
            <input value={current.subject} onChange={e => onChange({ ...current, subject: e.target.value })} className={`${inputBase} w-full border-transparent bg-transparent px-1 focus:bg-white focus:border-border-gray`} />
          </div>
          <div className="flex-1 min-h-0 grid grid-cols-[64px_1fr] gap-2 px-4 pt-3 pb-2">
            <span className="font-mono text-[10.5px] tracking-wider uppercase text-off-black/40 pt-2">Body</span>
            <textarea
              value={current.body}
              onChange={e => onChange({ ...current, body: e.target.value })}
              className="w-full h-full min-h-[280px] resize-none text-[15px] leading-relaxed bg-transparent px-1 py-1 focus:outline-none focus:bg-subtle-gray/60 rounded"
            />
          </div>
          <div className="flex items-center gap-2 px-4 pb-3 pl-[88px] text-xs">
            <Paperclip className={`w-3.5 h-3.5 ${missingRequired ? 'text-red-600' : 'text-off-black/40'}`} />
            {mockups.length > 0 ? (
              <>
                {chosen?.previewUrl && <img src={chosen.previewUrl} alt="" className="h-7 w-auto rounded border border-border-gray" />}
                <select value={mockupId || ''} onChange={e => onMockupChange(e.target.value)} className={`bg-transparent max-w-[220px] truncate focus:outline-none ${missingRequired ? 'text-red-600' : 'text-off-black/70'}`}>
                  <option value="">No attachment</option>
                  {mockups.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </>
            ) : (
              <span className={missingRequired ? 'text-red-600' : 'text-off-black/45'}>{missingRequired ? 'A charity first touch needs a mockup' : 'No attachment'}</span>
            )}
            <button onClick={onManageMockups} className={btnGhost}>Manage</button>
            <span className="ml-auto text-off-black/40">Your signature is added when it sends.</span>
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-border-gray bg-subtle-gray rounded-b-lg">
        <div className="flex items-center gap-1">
          <button onClick={onSkip} className={btnGhost} title="Hide until tomorrow">Skip today <kbd className={kbdDark}>S</kbd></button>
          <button onClick={onNotInterested} className={btnGhost} title="Close this one out">Not interested <kbd className={kbdDark}>X</kbd></button>
          <button onClick={onRewrite} disabled={drafting || !contact} className={btnGhost} title="Write it again">
            <RefreshCw className={`w-3.5 h-3.5 ${drafting ? 'animate-spin' : ''}`} /> Rewrite
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
