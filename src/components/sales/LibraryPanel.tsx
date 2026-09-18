import { useRef, useState, type DragEvent } from 'react'
import { FileText, Image as ImageIcon, Loader2, Plus, Trash2, Upload, Check } from 'lucide-react'
import { toast } from 'sonner'
import { btnGhost, fieldLabel } from '@/lib/ui'
import { salesApi } from '@/lib/salesApi'
import { ASSET_DRAG_TYPE } from './Composer'
import type { Asset } from '@/types/sales'

/**
 * The content library, on the right.
 *
 * Every deck, mockup and image the team sends, as cards. Drag a card onto
 * the email to attach it, or click the plus. Drop files here (or click
 * Upload) to add to the library; they go straight to storage. Names carry
 * meaning: a mockup named for its race is what gets auto-picked for a
 * charity that runs that race, so name files for what they are.
 */
function fmtSize(n: number | null) {
  if (!n) return ''
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`
}

export default function LibraryPanel({ assets, configured, attachedIds, onAttach, onChanged, compact }: {
  assets: Asset[]
  configured: boolean
  attachedIds: Set<string>
  onAttach: (a: Asset) => void
  onChanged: () => void
  compact?: boolean
}) {
  const [over, setOver] = useState(false)
  const [uploading, setUploading] = useState<Record<string, number>>({})
  const [filter, setFilter] = useState<'all' | 'image' | 'deck'>('all')
  const fileInput = useRef<HTMLInputElement>(null)

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length) return
    for (const f of list) {
      setUploading(u => ({ ...u, [f.name]: 0 }))
      try {
        await salesApi.uploadAsset(f, frac => setUploading(u => ({ ...u, [f.name]: frac })))
        toast.success(`Added ${f.name}`)
      } catch (e) {
        toast.error(`${f.name}: ${(e as Error).message}`)
      } finally {
        setUploading(u => { const n = { ...u }; delete n[f.name]; return n })
      }
    }
    onChanged()
  }
  const remove = async (a: Asset) => {
    if (!window.confirm(`Remove ${a.name} from the library? Emails already sent keep their copy.`)) return
    try { await salesApi.deleteAsset(a.id); toast.message(`Removed ${a.name}`); onChanged() }
    catch (e) { toast.error((e as Error).message) }
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setOver(false)
    if (e.dataTransfer.files?.length) upload(e.dataTransfer.files)
  }

  const shown = assets.filter(a => filter === 'all' || a.kind === filter)

  if (!configured) {
    return (
      <section className="rounded-lg border border-border-gray bg-white px-3.5 py-3 text-xs text-off-black/55">
        <span className={fieldLabel}>Library</span>
        Storage is not configured on the server (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY), so there is nowhere to keep decks and mockups yet.
      </section>
    )
  }

  return (
    <section
      className={`rounded-lg border bg-white flex flex-col min-h-0 transition-colors ${over ? 'border-dark-fill ring-2 ring-dark-fill/20' : 'border-border-gray'}`}
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true) } }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3 pb-2">
        <span className={`${fieldLabel} mb-0`}>Library <span className="normal-case tracking-normal font-normal text-off-black/40">· drag onto the email</span></span>
        <div className="flex items-center gap-1">
          <select value={filter} onChange={e => setFilter(e.target.value as 'all' | 'image' | 'deck')} className="text-[11px] bg-transparent text-off-black/55 focus:outline-none">
            <option value="all">All</option><option value="image">Images</option><option value="deck">Decks</option>
          </select>
          <button onClick={() => fileInput.current?.click()} className={btnGhost} title="Upload files"><Upload className="w-3.5 h-3.5" /></button>
          <input ref={fileInput} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.pptx,.ppt,.key" className="hidden" onChange={e => { if (e.target.files) upload(e.target.files); e.target.value = '' }} />
        </div>
      </div>

      <div className={`px-2 pb-2 grid gap-1.5 ${compact ? 'grid-cols-3' : 'grid-cols-2'} overflow-y-auto max-h-[42vh]`}>
        {Object.entries(uploading).map(([name, frac]) => (
          <div key={name} className="rounded-md border border-dashed border-border-gray p-2 text-[11px] text-off-black/55">
            <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" />{name}
            <div className="h-1 mt-1.5 rounded bg-subtle-gray overflow-hidden"><div className="h-full bg-dark-fill" style={{ width: `${Math.round(frac * 100)}%` }} /></div>
          </div>
        ))}
        {shown.map(a => {
          const attached = attachedIds.has(a.id)
          return (
            <div
              key={a.id}
              draggable
              onDragStart={e => { e.dataTransfer.setData(ASSET_DRAG_TYPE, JSON.stringify(a)); e.dataTransfer.effectAllowed = 'copy' }}
              onDoubleClick={() => onAttach(a)}
              className={`group relative rounded-md border overflow-hidden cursor-grab active:cursor-grabbing ${attached ? 'border-dark-fill' : 'border-border-gray hover:border-off-black/40'}`}
              title={`${a.name}${a.size ? ` · ${fmtSize(a.size)}` : ''}. Drag onto the email, or double-click.`}
            >
              <div className="aspect-[4/3] bg-subtle-gray grid place-items-center overflow-hidden">
                {a.kind === 'image' && a.previewUrl ? (
                  <img src={a.previewUrl} alt="" className="w-full h-full object-cover" draggable={false} />
                ) : a.kind === 'image' ? <ImageIcon className="w-6 h-6 text-off-black/30" /> : (
                  <div className="text-center"><FileText className="w-6 h-6 text-off-black/40 mx-auto" /><div className="font-mono text-[9px] uppercase text-off-black/40 mt-1">{a.filename.split('.').pop()}</div></div>
                )}
              </div>
              <div className="px-1.5 py-1 text-[11px] leading-tight truncate">{a.name}</div>
              <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => onAttach(a)} className="w-6 h-6 rounded bg-white/95 border border-border-gray grid place-items-center hover:bg-subtle-gray" title={attached ? 'Attached' : 'Attach to this email'}>
                  {attached ? <Check className="w-3.5 h-3.5 text-success-green" /> : <Plus className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => remove(a)} className="w-6 h-6 rounded bg-white/95 border border-border-gray grid place-items-center hover:bg-red-50 hover:text-red-700" title="Remove from the library"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              {attached && <div className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-dark-fill text-white grid place-items-center"><Check className="w-2.5 h-2.5" strokeWidth={3} /></div>}
            </div>
          )
        })}
        {shown.length === 0 && Object.keys(uploading).length === 0 && (
          <div className={`${compact ? 'col-span-3' : 'col-span-2'} rounded-md border border-dashed border-border-gray px-3 py-5 text-center text-[11.5px] text-off-black/50`}>
            Drop decks, mockups and images here.<br />Name files for what they are: <span className="font-mono">Chicago_SIR_Mockup.png</span>.
          </div>
        )}
      </div>
    </section>
  )
}
