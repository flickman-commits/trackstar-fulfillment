/**
 * The one print picker: the store's race prints with their pictures and a
 * search box. Tools > Samples, a creator's Send a sample and the creator
 * application all use it, fed by the same catalog
 * (server/domain/catalog/printCatalog.js), so there is one thing to keep up.
 */
import { useState } from 'react'
import { ChevronDown, Loader2, Search } from 'lucide-react'

export interface PrintOption { title: string; label: string; image: string | null }

const box = 'w-full px-3 py-2 text-sm border border-border-gray rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-off-black/10'

function Thumb({ url, small = false }: { url: string | null; small?: boolean }) {
  const cls = small ? 'w-7 h-9' : 'w-9 h-11'
  return url
    ? <img src={`${url}${url.includes('?') ? '&' : '?'}width=90`} alt="" className={`${cls} object-cover rounded bg-subtle-gray shrink-0`} />
    : <span className={`${cls} rounded bg-subtle-gray shrink-0`} />
}

export default function PrintPicker<T extends PrintOption>({ value, onChange, options, placeholder = 'Choose a print' }: {
  /** The chosen print's title, or null. */
  value: string | null
  onChange: (option: T) => void
  options: T[] | null
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  if (!options) return <div className={`${box} text-off-black/40 inline-flex items-center gap-2`}><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading the store's prints</div>
  const chosen = options.find(o => o.title === value) || null
  const shown = options.filter(o => !q.trim() || o.label.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} className={`${box} flex items-center gap-2 text-left py-1.5`}>
        <Thumb url={chosen?.image || null} />
        <span className={`flex-1 truncate ${chosen ? 'text-off-black' : 'text-off-black/40'}`}>{chosen?.label || placeholder}</span>
        <ChevronDown className="w-4 h-4 text-off-black/40 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-40 left-0 right-0 mt-1 bg-white border border-border-gray rounded-md shadow-[0_8px_30px_rgba(0,0,0,0.14)] p-1.5">
          <div className="relative mb-1.5">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-off-black/40" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search races" className={`${box} pl-8`} />
          </div>
          <div className="max-h-80 overflow-y-auto">
            {shown.map(o => (
              <button key={o.title} type="button" onClick={() => { onChange(o); setOpen(false); setQ('') }}
                className={`w-full flex items-center gap-2.5 px-1.5 py-1 rounded text-left text-sm hover:bg-subtle-gray ${o.title === value ? 'bg-subtle-gray font-medium' : ''}`}>
                <Thumb url={o.image} small /><span className="truncate">{o.label}</span>
              </button>
            ))}
            {!shown.length && <div className="px-2 py-3 text-sm text-off-black/45">No print matches.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
