import { useState } from 'react'
import { AlertTriangle, ChevronDown, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { when } from '@/lib/supportDates'
import type { Note } from '@/types/support'

/**
 * Claude's draft in the timeline: the reply it would send, and its working
 * (what it found, what to check, which quick actions fit, whether Matt
 * should see it). Nothing goes anywhere until a person uses it and presses
 * Send. Every draft starts folded to one line, so the customer's message
 * stays readable; opened, the reply scrolls in a short box.
 */
export default function DraftCard({ n, latest, onUse, onRedraft }: { n: Note; latest: boolean; onUse: (text: string) => void; onRedraft: (instruction: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
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
    // Closed by default, so the customer's message stays the thing you read first.
    return (
      <div className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${latest ? 'border-[#4600D6]/25 bg-[#4600D6]/[0.03]' : 'border-dashed border-[#4600D6]/25'}`}>
        <button onClick={() => setOpen(true)} className={`flex-1 min-w-0 flex items-center gap-2 text-left ${latest ? 'text-[#4600D6]' : 'text-[#4600D6]/70 hover:text-[#4600D6]'}`}>
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span className={`truncate ${latest ? 'font-semibold' : ''}`}>{latest ? "Claude's suggested response" : 'Earlier draft'}{d.scenario ? <span className="font-normal text-off-black/45"> · {d.scenario}</span> : null}</span>
          {latest && d.escalate?.needed && <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-px rounded bg-red-50 border border-red-200 text-[10px] font-medium text-red-700"><AlertTriangle className="w-3 h-3" />Flag for Matt</span>}
          <ChevronDown className="w-3.5 h-3.5 ml-auto shrink-0" />
        </button>
        {latest && <button onClick={() => onUse(n.body)} className="shrink-0 px-2 py-0.5 rounded text-[11px] font-medium bg-[#4600D6] text-white hover:bg-[#3a00b3]">Use</button>}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[#4600D6]/25 bg-[#4600D6]/[0.03] px-3 py-2.5">
      <div className="flex items-center justify-between gap-3 text-[11px] text-[#4600D6]/80 mb-2">
        <button onClick={() => setOpen(false)} className="font-semibold inline-flex items-center gap-1.5 hover:underline underline-offset-2" title="Collapse"><Sparkles className="w-3.5 h-3.5" />{latest ? "Claude's suggested response" : 'Earlier draft'}{d.scenario ? ` · ${d.scenario}` : ''}</button>
        <span className="shrink-0 inline-flex items-center gap-1.5 tabular-nums text-off-black/40">{when(n.createdAt)}<button onClick={() => setOpen(false)} title="Collapse"><ChevronDown className="w-3.5 h-3.5 rotate-180" /></button></span>
      </div>
      {d.escalate?.needed && (
        <div className="mb-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-800 inline-flex items-start gap-1.5 w-full">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span><b>Flag for Matt.</b> {d.escalate.reason}</span>
        </div>
      )}
      {d.summary && <div className="text-xs text-off-black/60 mb-2">They want: {d.summary}</div>}
      <div className="max-h-40 overflow-y-auto text-[13px] whitespace-pre-wrap break-words leading-relaxed text-off-black bg-white border border-border-gray rounded-lg px-3 py-2">{n.body.replace(/\{\{rep\}\}/g, '…')}</div>
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
