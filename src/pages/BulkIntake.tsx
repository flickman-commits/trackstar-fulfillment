import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Trash2, Loader2, CheckCircle2, Upload, Download, Copy, Link2 } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || ''

/**
 * The partner's side of a bulk order: a form for the runner list.
 *
 * A partner has a spreadsheet of names and addresses and a deadline. This
 * takes both shapes: paste the sheet in, or type rows by hand. Nothing here
 * is personalized or approved; it exists so we never have to ask "can you
 * send that list again" and so Eli never retypes an address.
 */

type Row = { firstName: string; lastName: string; email: string; line1: string; line2: string; city: string; state: string; zip: string; country: string }
const blank = (): Row => ({ firstName: '', lastName: '', email: '', line1: '', line2: '', city: '', state: '', zip: '', country: 'United States' })

const T = { page: '#F6F5F2', card: '#FFFFFF', line: '#E7E4DD', accent: '#4600D6', bar: '#242424', font: "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif" }
const input = 'w-full px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-[#4600D6]/30'
const inputStyle = { border: `1px solid ${T.line}`, backgroundColor: '#FFFFFF' }

function parsePaste(text: string): Row[] {
  let lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (!lines.length) return []
  // A Markdown table: strip the outer pipes and the |---| divider, then treat as pipe-separated.
  const isMd = lines[0].startsWith('|')
  if (isMd) lines = lines.filter(l => !/^\|?\s*:?-{2,}/.test(l)).map(l => l.replace(/^\|/, '').replace(/\|$/, ''))
  const sep = isMd ? '|' : lines[0].includes('\t') ? '\t' : ','
  const split = (l: string) => sep !== ',' ? l.split(sep) : l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map(c => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')).filter((_, i, arr) => i < arr.length - 1 || _ !== '')
  const head = split(lines[0]).map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''))
  const idx = (...names: string[]) => head.findIndex(h => names.includes(h))
  const iF = idx('firstname', 'first'), iL = idx('lastname', 'last', 'surname'), iN = idx('name', 'fullname', 'runner', 'runnername')
  const hasHeader = iF >= 0 || iN >= 0
  const iE = idx('email'), i1 = idx('address', 'addressline1', 'address1', 'street'), i2 = idx('addressline2', 'address2', 'apt', 'unit')
  const iC = idx('city', 'town'), iS = idx('state', 'province', 'region'), iZ = idx('zip', 'zipcode', 'postalcode', 'postcode'), iK = idx('country')
  const rows: Row[] = []
  for (const l of lines.slice(hasHeader ? 1 : 0)) {
    const c = split(l).map(x => x.trim())
    const g = (i: number) => (i >= 0 ? c[i] || '' : '')
    let first = '', last = ''
    if (hasHeader) {
      if (iF >= 0) { first = g(iF); last = g(iL) } else { const p = g(iN).split(/\s+/); first = p[0] || ''; last = p.slice(1).join(' ') }
    } else {
      // No header: assume First, Last, Address, City, State, Zip
      first = c[0] || ''; last = c[1] || ''
    }
    if (!first && !last) continue
    rows.push({
      firstName: first, lastName: last, email: hasHeader ? g(iE) : '',
      line1: hasHeader ? g(i1) : c[2] || '', line2: hasHeader ? g(i2) : '',
      city: hasHeader ? g(iC) : c[3] || '', state: hasHeader ? g(iS) : c[4] || '', zip: hasHeader ? g(iZ) : c[5] || '',
      country: (hasHeader ? g(iK) : c[6]) || 'United States',
    })
  }
  return rows
}

export default function BulkIntake() {
  const { token } = useParams<{ token: string }>()
  const [info, setInfo] = useState<{ partnerName: string; raceName: string; raceYear: number; quantity: number; entered: number; note: string | null; product: string; runnerLink: string | null } | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'gone' | 'sent'>('loading')
  const [rows, setRows] = useState<Row[]>([blank()])
  const [paste, setPaste] = useState('')
  const [mode, setMode] = useState<'form' | 'paste'>('paste')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ added: number; duplicates: number; rejected: { name?: string; reason: string }[] } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/public/bulk-intake?token=${encodeURIComponent(token || '')}`)
      .then(async r => { if (!r.ok) throw new Error(); setInfo(await r.json()); setState('ready') })
      .catch(() => setState('gone'))
  }, [token])

  const usable = rows.filter(r => r.firstName.trim() && r.lastName.trim())
  const incomplete = usable.filter(r => !r.line1.trim() || !r.city.trim() || !r.zip.trim()).length

  const submit = async () => {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`${API_BASE}/api/public/bulk-intake`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, runners: usable.map(r => ({ firstName: r.firstName, lastName: r.lastName, email: r.email, address: { line1: r.line1, line2: r.line2, city: r.city, state: r.state, zip: r.zip, country: r.country } })) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error()
      setResult(data)
      setInfo(i => (i ? { ...i, entered: data.entered } : i))
      setState('sent')
    } catch { setErr('Something went wrong sending the list. Please try again, or email us the spreadsheet.') } finally { setBusy(false) }
  }

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen" style={{ backgroundColor: T.page, fontFamily: T.font }}>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 pl-1.5 pr-4 py-1.5 mb-6" style={{ backgroundColor: T.bar, borderRadius: 24 }}>
          <span className="flex items-center justify-center shrink-0 overflow-hidden" style={{ backgroundColor: '#F3F3F3', borderRadius: 999, padding: '2px 10px' }}>
            <img src="/trackstar-logo.png" alt="Trackstar" className="h-8 w-auto" />
          </span>
          {info && <span style={{ color: '#FFFFFF', fontSize: '15px', fontWeight: 600 }}>{info.partnerName}</span>}
        </div>
        {children}
        <p className="mt-10 text-center" style={{ fontSize: '11px', color: '#999999', letterSpacing: '0.05em' }}>Trackstar - Celebrating athletic achievement.</p>
      </div>
    </div>
  )

  if (state === 'loading') return <Shell><div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: '#999' }} /></div></Shell>
  if (state === 'gone' || !info) return <Shell><div className="rounded-2xl p-8 text-center" style={{ backgroundColor: T.card, border: `1px solid ${T.line}` }}><h1 className="text-lg font-bold mb-2">This link is no longer active</h1><p className="text-sm" style={{ color: '#666' }}>Ask your Trackstar contact for a fresh one.</p></div></Shell>

  if (state === 'sent' && result) return (
    <Shell>
      <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: T.card, border: `1px solid ${T.line}` }}>
        <CheckCircle2 className="w-8 h-8 mx-auto mb-3" style={{ color: T.accent }} />
        <h1 className="text-xl font-bold mb-2">Got it. {result.added} runner{result.added === 1 ? '' : 's'} added.</h1>
        <p className="text-sm" style={{ color: '#666' }}>
          {info.entered} on the list so far{info.quantity ? ` of ${info.quantity}` : ''}.
          {result.duplicates ? ` ${result.duplicates} were already on it.` : ''}
        </p>
        {result.rejected.length > 0 && (
          <div className="mt-4 text-left rounded-xl p-3 text-sm" style={{ backgroundColor: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.3)', color: '#92400E' }}>
            <p className="font-semibold mb-1">{result.rejected.length} could not be added:</p>
            <ul className="space-y-0.5">{result.rejected.map((x, i) => <li key={i}>{x.name || `Row ${i + 1}`}: {x.reason === 'address' ? 'address is incomplete' : 'name is missing'}</li>)}</ul>
          </div>
        )}
        <button onClick={() => { setRows([blank()]); setPaste(''); setResult(null); setState('ready') }} className="mt-6 px-4 py-2.5 text-sm font-semibold rounded-md" style={{ backgroundColor: T.accent, color: '#fff' }}>Add more</button>
      </div>
    </Shell>
  )

  return (
    <Shell>
      <div className="rounded-2xl p-6 mb-4" style={{ backgroundColor: T.card, border: `1px solid ${T.line}` }}>
        <span className="inline-flex items-center px-2.5 py-1 rounded-md mb-3" style={{ backgroundColor: T.accent, color: '#fff', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Runner list</span>
        <h1 className="text-xl font-bold" style={{ color: '#1A1A1A' }}>{info.raceName} {info.raceYear}</h1>
        <p className="text-sm mt-1" style={{ color: '#666' }}>
          We need each runner's first and last name and the address their print ships to. We find their finish time and bib ourselves.
          {info.quantity ? ` ${info.entered} of ${info.quantity} entered so far.` : info.entered ? ` ${info.entered} entered so far.` : ''}
        </p>
        <p className="text-xs mt-1" style={{ color: '#999' }}>Each print: {info.product}.</p>
        {info.note && <p className="text-sm mt-3 rounded-xl p-3" style={{ backgroundColor: 'rgba(70,0,214,0.05)', border: '1px solid rgba(70,0,214,0.15)', color: '#1A1A1A' }}>{info.note}</p>}
      </div>

      <div className="flex gap-1 mb-3">
        {(['paste', 'form'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)} className="px-3 py-1.5 text-xs font-semibold rounded-md" style={mode === m ? { backgroundColor: T.bar, color: '#fff' } : { backgroundColor: '#fff', color: '#666', border: `1px solid ${T.line}` }}>
            {m === 'paste' ? 'Upload a spreadsheet' : 'Type them in'}
          </button>
        ))}
      </div>

      {mode === 'paste' ? (
        <div className="rounded-2xl p-4 mb-4 space-y-3" style={{ backgroundColor: T.card, border: `1px solid ${T.line}` }}>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/trackstar-runner-list.xlsx" download className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-md" style={{ backgroundColor: '#fff', color: '#1A1A1A', border: `1px solid ${T.line}` }}>
              <Download className="w-4 h-4" /> Download the template
            </a>
            <span className="text-xs" style={{ color: '#666' }}>Fill it in, then upload it here. Excel, CSV or Markdown all work.</span>
          </div>
          <label className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold uppercase tracking-wide rounded-md cursor-pointer" style={{ backgroundColor: T.accent, color: '#fff' }}>
            <Upload className="w-4 h-4" /> Upload your list
            <input type="file" accept=".xlsx,.xls,.csv,.txt,.md,.markdown,text/csv,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={async e => {
              const f = e.target.files?.[0]; e.target.value = ''
              if (!f) return
              let text = ''
              if (/\.xlsx?$/i.test(f.name)) {
                // Excel: read the first sheet to CSV, then the same parser.
                const XLSX = await import('xlsx')
                const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' })
                text = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]])
              } else {
                text = await f.text()
              }
              const parsed = parsePaste(text)
              if (!parsed.length) { setErr('Could not read any rows from that file.'); return }
              setRows(parsed); setMode('form'); setErr(null)
            }} />
          </label>
          <details>
            <summary className="text-xs cursor-pointer" style={{ color: '#666' }}>Or paste the rows straight from Excel or Google Sheets</summary>
            <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={6} className={`${input} font-mono text-xs mt-2`} style={inputStyle} placeholder={'First Name\tLast Name\tAddress\tCity\tState\tZip'} />
            <button onClick={() => { const parsed = parsePaste(paste); if (!parsed.length) { setErr('Could not read any rows.'); return } setRows(parsed); setMode('form'); setErr(null) }} className="mt-2 px-4 py-2 text-sm font-semibold rounded-md" style={{ backgroundColor: T.bar, color: '#fff' }}>Read rows</button>
          </details>
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {rows.map((r, i) => (
            <div key={i} className="rounded-2xl p-3" style={{ backgroundColor: T.card, border: `1px solid ${T.line}` }}>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                <input value={r.firstName} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, firstName: e.target.value } : x))} placeholder="First name" className={input} style={inputStyle} />
                <input value={r.lastName} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, lastName: e.target.value } : x))} placeholder="Last name" className={input} style={inputStyle} />
                <input value={r.line1} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, line1: e.target.value } : x))} placeholder="Street address" className={`${input} col-span-2 md:col-span-4`} style={inputStyle} />
                <input value={r.line2} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, line2: e.target.value } : x))} placeholder="Apt / unit" className={input} style={inputStyle} />
                <input value={r.city} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, city: e.target.value } : x))} placeholder="City" className={input} style={inputStyle} />
                <input value={r.state} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, state: e.target.value } : x))} placeholder="State" className={input} style={inputStyle} />
                <input value={r.zip} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, zip: e.target.value } : x))} placeholder="Zip" className={input} style={inputStyle} />
                <input value={r.country} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, country: e.target.value } : x))} placeholder="Country" className={input} style={inputStyle} />
                <button onClick={() => setRows(rs => rs.length === 1 ? [blank()] : rs.filter((_, j) => j !== i))} className="inline-flex items-center justify-center rounded-md" style={{ color: '#999', border: `1px solid ${T.line}` }} title="Remove"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
          <button onClick={() => setRows(rs => [...rs, blank()])} className="w-full py-2.5 text-sm font-semibold rounded-2xl inline-flex items-center justify-center gap-1.5" style={{ backgroundColor: '#fff', color: '#1A1A1A', border: `1px dashed ${T.line}` }}><Plus className="w-4 h-4" /> Another runner</button>
        </div>
      )}

      {info.runnerLink && (
        <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: T.card, border: `1px solid ${T.line}` }}>
          <div className="flex items-start gap-3">
            <Link2 className="w-5 h-5 mt-0.5 shrink-0" style={{ color: T.accent }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: '#1A1A1A' }}>Don't have everyone's address? Send your runners this link.</p>
              <p className="text-xs mt-0.5" style={{ color: '#666' }}>Each person enters their own name and shipping address and lands on your list here. No spreadsheet needed.</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <code className="text-[12px] px-2 py-1 rounded-md truncate max-w-full" style={{ backgroundColor: T.page, color: '#666' }}>{window.location.origin}{info.runnerLink}</code>
                <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}${info.runnerLink}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {}) }} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md" style={{ backgroundColor: T.bar, color: '#fff' }}>
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy link'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {err && <p className="text-sm mb-3" style={{ color: '#DC2626' }}>{err}</p>}
      {incomplete > 0 && <p className="text-xs mb-3" style={{ color: '#92400E' }}>{incomplete} runner{incomplete === 1 ? ' has' : 's have'} an incomplete address and will be held back.</p>}
      <button onClick={submit} disabled={busy || usable.length === 0} className="w-full py-3 text-sm font-bold uppercase tracking-wide rounded-md disabled:opacity-40" style={{ backgroundColor: T.accent, color: '#fff' }}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : `Send ${usable.length} runner${usable.length === 1 ? '' : 's'}`}
      </button>
    </Shell>
  )
}
