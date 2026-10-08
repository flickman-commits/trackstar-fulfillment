import { useState } from 'react'
import { Check, Copy, ExternalLink, Lock, Paperclip, Loader2 } from 'lucide-react'
import { btnSecondary, cardLabel, textLink } from '@/lib/ui'
import type { Asset, Deal, Send } from '@/types/sales'

/**
 * An email that already went out, shown as it was sent: read only, but the
 * text selects and copies, so a good line can go into the next email.
 */

const MD_LINK = /\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g
const PS_START = /(^|\n[ \t]*\n)(?=[ \t]*p\.?s\.?[\s:.-])/i

function splitBody(body: string) {
  const m = PS_START.exec(body)
  if (!m) return { main: body, ps: '' }
  const at = m.index + m[1].length
  return { main: body.slice(0, at).replace(/\s+$/, ''), ps: body.slice(at).trim() }
}

/** One paragraph with its [text](url) links as links. */
function Paragraph({ text }: { text: string }) {
  const out: (string | JSX.Element)[] = []
  let last = 0
  for (const m of text.matchAll(MD_LINK)) {
    if (m.index! > last) out.push(text.slice(last, m.index))
    out.push(<a key={m.index} href={m[2]} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{m[1]}</a>)
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <p className="whitespace-pre-wrap">{out}</p>
}

function paragraphs(text: string) {
  return text.split(/\n[ \t]*\n/).map(p => p.trim()).filter(Boolean)
}

/** Plain text for the clipboard: links keep their words, the address goes in brackets. */
function plain(text: string) {
  return text.replace(MD_LINK, (_, t, u) => `${t} (${u})`)
}

export default function SentEmail({ deal, sentAt, signature, assets }: {
  deal: Deal
  sentAt?: string | null
  signature?: string
  assets: Asset[]
}) {
  const [copied, setCopied] = useState(false)
  const sends = deal.sends
  // Today's send for this deal: the latest one.
  const send: Send | undefined = sends?.[sends.length - 1]
  const time = (send?.sentAt || sentAt) ? new Date(send?.sentAt || sentAt as string).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null
  const to = deal.person?.email || deal.people?.find(p => p.email)?.email || null

  const copy = async () => {
    if (!send?.body) return
    await navigator.clipboard.writeText(plain(send.body))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const { main, ps } = splitBody(send?.body || '')
  const files = (send?.attachments || []).map(id => assets.find(a => a.id === id)?.name || id.split('/').pop() || id)

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-border-gray bg-green-50/60">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-6 h-6 rounded-full bg-success-green/15 grid place-items-center shrink-0"><Check className="w-3.5 h-3.5 text-success-green" /></span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-off-black">Sent{time ? ` at ${time}` : ''}</div>
            <div className="text-xs text-off-black/55 truncate">The next touch comes back under Follow Ups when it is due.</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-off-black/5 text-[11px] font-medium text-off-black/55"><Lock className="w-3 h-3" /> Read only</span>
          {send?.body && <button onClick={copy} className={btnSecondary}>{copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy text'}</button>}
          {deal.webUrl && <a href={deal.webUrl} target="_blank" rel="noopener noreferrer" className={textLink}>Open in Attio <ExternalLink className="w-3 h-3" /></a>}
        </div>
      </div>

      {!sends ? (
        <div className="flex-1 grid place-items-center text-off-black/40"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : !send ? (
        <div className="flex-1 grid place-items-center text-sm text-off-black/50 px-6 text-center">This email went out, but its text was not kept here.</div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-6 py-4 space-y-3 select-text cursor-text">
            <div className="grid grid-cols-[64px_1fr] gap-x-3 gap-y-1.5 text-sm">
              {to && <><span className={cardLabel}>To</span><span className="text-off-black/80">{to}</span></>}
              <span className={cardLabel}>Subject</span><span className="text-off-black font-medium">{send.subject}</span>
            </div>
            <div className="rounded-md bg-subtle-gray/60 border border-border-gray/70 px-4 py-3 text-sm text-off-black leading-relaxed space-y-3">
              {paragraphs(main).map((p, i) => <Paragraph key={i} text={p} />)}
              {signature && <div className="text-off-black/70" dangerouslySetInnerHTML={{ __html: signature }} />}
              {ps && paragraphs(ps).map((p, i) => <Paragraph key={`ps${i}`} text={p} />)}
            </div>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {files.map(f => <span key={f} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border-gray bg-white text-xs text-off-black/70"><Paperclip className="w-3 h-3" />{f}</span>)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
