import { useState } from 'react'
import { AlertTriangle, ChevronDown, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { when } from '@/lib/supportDates'
import type { Note } from '@/types/support'

/**
 * Claude's draft in the timeline: the reply it would send, and its working
 * (what it found, what to check, which quick actions fit, whether Matt
 * should see it). Nothing goes anywhere until a person uses it and presses
 * Send. Older drafts fold to one line.
 */
export default function DraftCard({ n, latest, onUse, onRedraft }: { n: Note; latest: boolean; onUse: (text: string) => void; onRedraft: (instruction: string) => Promise<void> }) {
  const [open, setOpen] = useState(latest)
  const [showWork, setShowWork] = useState(false)
  const [asking, setAsking] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const d = n.data || {}
  const redraft = async () => {
    setBusy(true)
    try { await onRedraft(instruction.trim()); setAsking(false); setInstruction('') }
    finally { setBusy(false) }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-[#4600D6]/25 text-[11px] text-[#4600D6]/70 hover:text-[#4600D6]">
        <Sparkles className="w-3 h-3" />Earlier draft{d.scenario ? `: ${d.scenario}` : ''} · {when(n.createdAt)}<ChevronDown className="w-3 h-3 ml-auto" />
      </button>
    )
  }

  return (
    <div className="rounded-2xl border border-[#4600D6]/25 bg-[#4600D6]/[0.03] px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-[11px] text-[#4600D6]/80 mb-2">
        <span className="font-semibold inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />Claude's draft{d.scenario ? ` · ${d.scenario}` : ''}</span>
        <span className="shrink-0 tabular-nums text-off-black/40">{when(n.createdAt)}</span>
      </div>
      {d.escalate?.needed && (
        <div className="mb-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-800 inline-flex items-start gap-1.5 w-full">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span><b>Flag for Matt.</b> {d.escalate.reason}</span>
        </div>
      )}
      {d.summary && <div className="text-xs text-off-black/60 mb-2">They want: {d.summary}</div>}
      <div className="text-sm whitespace-pre-wrap break-words leading-relaxed text-off-black bg-white border border-border-gray rounded-lg px-3 py-2.5">{n.body.replace(/\{\{rep\}\}/g, '…')}</div>
      {d.needsInfo && <div className="mt-2 text-xs text-amber-800">Missing: {d.needsInfo}</div>}
      {d.actions && d.actions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {d.actions.map(a => <span key={a.name} title={a.why} className="inline-flex items-center px-2 py-0.5 rounded-full border border-[#4600D6]/25 bg-white text-[11px] text-[#4600D6]">{a.name}</span>)}
          <span className="text-[11px] text-off-black/40 self-center">in the Actions panel</span>
        </div>
      )}
      {((d.keyFacts?.length || 0) + (d.steps?.length || 0)) > 0 && (
        <button onClick={() => setShowWork(v => !v)} className="mt-2 inline-flex items-center gap-1 text-[11px] text-off-black/50 hover:text-off-black">
          <ChevronDown className={`w-3 h-3 transition-transform ${showWork ? 'rotate-180' : ''}`} />{showWork ? 'Hide' : 'Show'} what it found
        </button>
      )}
      {showWork && (
        <div className="mt-1.5 grid gap-2 text-xs">
          {d.keyFacts && d.keyFacts.length > 0 && <div><div className="text-[10px] font-semibold uppercase tracking-wider text-off-black/40 mb-0.5">Key facts</div><ul className="list-disc pl-4 space-y-0.5 text-off-black/75">{d.keyFacts.map((f, i) => <li key={i}>{f}</li>)}</ul></div>}
          {d.steps && d.steps.length > 0 && <div><div className="text-[10px] font-semibold uppercase tracking-wider text-off-black/40 mb-0.5">Before you send</div><ul className="list-disc pl-4 space-y-0.5 text-off-black/75">{d.steps.map((f, i) => <li key={i}>{f}</li>)}</ul></div>}
        </div>
      )}
      {latest && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={() => onUse(n.body)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#4600D6] text-white hover:bg-[#3a00b3]">Use this draft</button>
          {asking ? (
            <div className="flex-1 min-w-[220px] flex items-center gap-1.5">
              <input autoFocus value={instruction} onChange={e => setInstruction(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') redraft(); if (e.key === 'Escape') setAsking(false) }}
                placeholder="What to change, e.g. they already sent the photos" className="flex-1 px-2 py-1 text-xs bg-white border border-border-gray rounded focus:outline-none focus:ring-1 focus:ring-[#4600D6]/30" />
              <button onClick={redraft} disabled={busy} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-[#4600D6]/30 text-[#4600D6] hover:bg-[#4600D6]/5 disabled:opacity-50">{busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}Redraft</button>
            </div>
          ) : (
            <button onClick={() => setAsking(true)} className="inline-flex items-center gap-1 text-xs font-medium text-[#4600D6] hover:underline underline-offset-2"><RefreshCw className="w-3 h-3" />Redraft</button>
          )}
        </div>
      )}
    </div>
  )
}
