import { useState } from 'react'
import { X, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { btnPrimary, btnSecondary, btnGhost, fieldLabel, inputBase, segment, segmentGroup } from '@/lib/ui'
import { salesApi } from '@/lib/salesApi'
import type { ImportPreview, ImportResult, Pipeline } from '@/types/sales'

/**
 * Paste or drop a CSV, see how its columns map, then import.
 *
 * Preview first, always: a wrong column guess on a 200-row list is much
 * cheaper to catch here than in the queue.
 */
export default function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [pipeline, setPipeline] = useState<Pipeline>('RACE')
  const [csv, setCsv] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [overwrite, setOverwrite] = useState(false)
  const [busy, setBusy] = useState(false)

  const readFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => { setCsv(String(reader.result || '')); setPreview(null); setResult(null) }
    reader.readAsText(file)
  }

  const doPreview = async () => {
    setBusy(true)
    try { setPreview(await salesApi.importPreview(csv, pipeline)); setResult(null) }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }

  const doImport = async () => {
    setBusy(true)
    try {
      const r = await salesApi.importRun(csv, pipeline, overwrite)
      setResult(r)
      toast.success(`Imported: ${r.companiesCreated} new, ${r.companiesUpdated} updated`)
      onImported()
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }

  const FIELD_NAMES: Record<string, string> = {
    firstName: 'First name', lastName: 'Last name', fullName: 'Full name', email: 'Email', title: 'Title',
    linkedinUrl: 'LinkedIn', company: pipeline === 'RACE' ? 'Race' : 'Organisation', domain: 'Domain', website: 'Website',
    city: 'City', state: 'State', runnerCount: 'Runners', raceDate: 'Race date', identityTags: 'Identity tags',
    courseLandmark: 'Landmark', tier: 'Tier', stage: 'Stage', notes: 'Notes',
  }

  return (
    <div className="fixed inset-0 z-50 bg-off-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-gray">
          <h2 className="text-base font-semibold text-off-black">Import a list</h2>
          <button onClick={onClose} className={btnGhost}><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-4 text-sm">
          <div className="flex items-center gap-3">
            <span className={fieldLabel + ' mb-0'}>Pipeline</span>
            <div className={segmentGroup}>
              <button onClick={() => setPipeline('RACE')} className={segment(pipeline === 'RACE')}>Races</button>
              <button onClick={() => setPipeline('CHARITY')} className={segment(pipeline === 'CHARITY')}>Charities</button>
            </div>
          </div>

          <div>
            <label className={fieldLabel}>CSV</label>
            <textarea
              value={csv}
              onChange={e => { setCsv(e.target.value); setPreview(null); setResult(null) }}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) readFile(f) }}
              onDragOver={e => e.preventDefault()}
              rows={7}
              placeholder={'Paste CSV text here, or drop a file.\nHeaders like: Race, Contact Name, Email, Title, Runners, Website'}
              className={`${inputBase} w-full font-mono text-xs resize-y`}
            />
            <label className={`${btnGhost} mt-1 -ml-2 cursor-pointer`}>
              <Upload className="w-3.5 h-3.5" /> Choose file
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f) }} />
            </label>
          </div>

          {preview && (
            <div className="rounded-lg border border-border-gray bg-subtle-gray p-3 space-y-3">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span><b className="tabular-nums">{preview.total}</b> rows</span>
                <span><b className="tabular-nums">{preview.withContact}</b> with a person</span>
                <span><b className="tabular-nums">{preview.withEmail}</b> with an email</span>
                {preview.skipped.length > 0 && <span className="text-amber-700"><b className="tabular-nums">{preview.skipped.length}</b> skipped</span>}
              </div>
              <div>
                <span className={fieldLabel}>Columns recognised</span>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                  {Object.entries(preview.mapped).map(([field, header]) => (
                    <div key={field} className="flex justify-between gap-2"><span className="text-off-black/60">{FIELD_NAMES[field] || field}</span><span className="font-mono truncate">{header}</span></div>
                  ))}
                </div>
                {preview.unmapped.length > 0 && (
                  <p className="text-xs text-off-black/50 mt-1.5">Ignored: {preview.unmapped.join(', ')}</p>
                )}
              </div>
              <div>
                <span className={fieldLabel}>First rows</span>
                <ul className="text-xs space-y-0.5">
                  {preview.sample.map(s => (
                    <li key={s.line} className="truncate">
                      <span className="font-medium">{s.company.name}</span>
                      {s.contact && <span className="text-off-black/60"> · {s.contact.firstName} {s.contact.lastName}{s.contact.email ? ` <${s.contact.email}>` : ''}</span>}
                    </li>
                  ))}
                </ul>
              </div>
              {preview.skipped.length > 0 && (
                <ul className="text-xs text-amber-800 space-y-0.5">
                  {preview.skipped.slice(0, 5).map((s, i) => <li key={i}>Line {s.line}: {s.reason}</li>)}
                </ul>
              )}
              <label className="flex items-center gap-2 text-xs text-off-black/70">
                <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} />
                Overwrite fields that already have a value (default: fill blanks only)
              </label>
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-border-gray p-3 text-xs space-y-1">
              <p><b>{result.companiesCreated}</b> new, <b>{result.companiesUpdated}</b> updated · <b>{result.contactsCreated}</b> new contacts, <b>{result.contactsUpdated}</b> updated</p>
              {result.skipped.length > 0 && (
                <ul className="text-amber-800">{result.skipped.slice(0, 8).map((s, i) => <li key={i}>{s.company ? `${s.company}: ` : s.line ? `Line ${s.line}: ` : ''}{s.reason}</li>)}</ul>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-gray">
          <button onClick={onClose} className={btnSecondary}>{result ? 'Done' : 'Cancel'}</button>
          {!preview ? (
            <button onClick={doPreview} disabled={!csv.trim() || busy} className={btnPrimary}>
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Preview
            </button>
          ) : !result ? (
            <button onClick={doImport} disabled={busy || preview.total === 0} className={btnPrimary}>
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Import {preview.total} rows
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
