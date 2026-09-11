import { useEffect, useRef, useState } from 'react'
import { X, Loader2, Upload, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { btnSecondary, btnGhost, btnDanger } from '@/lib/ui'
import { useEscape } from '@/lib/useEscape'
import { salesApi } from '@/lib/salesApi'
import type { Mockup } from '@/types/sales'

/**
 * The co-branded examples a cold email carries.
 *
 * Keep the race in the filename ("Berlin_SIR_Mockup.png"): that is what the
 * auto-pick matches against, so a charity running Berlin gets the Berlin
 * image without anyone choosing it.
 */
export default function MockupsModal({ onClose, onChanged }: { onClose: () => void; onChanged: (m: Mockup[]) => void }) {
  useEscape(onClose)
  const [mockups, setMockups] = useState<Mockup[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [configured, setConfigured] = useState(true)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await salesApi.mockups()
      setMockups(r.mockups)
      setConfigured(r.configured)
      onChanged(r.mockups)
    } catch (e) { toast.error((e as Error).message) }
    finally { setLoading(false) }
  }
  // Load once when the modal opens. `load` is rebuilt every render, so listing
  // it as a dependency would refetch in a loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      for (const file of Array.from(files)) {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          // readAsDataURL gives "data:image/png;base64,AAAA"; the API wants
          // only what follows the comma.
          reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
          reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
          reader.readAsDataURL(file)
        })
        await salesApi.uploadMockup({ filename: file.name, contentType: file.type || 'image/png', data })
      }
      toast.success(files.length === 1 ? 'Mockup added' : `${files.length} mockups added`)
      await load()
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = '' }
  }

  const remove = async (m: Mockup) => {
    if (!confirm(`Remove ${m.name}?`)) return
    setBusy(true)
    try { await salesApi.deleteMockup(m.id); await load() }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-off-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-gray">
          <div>
            <h2 className="text-base font-semibold text-off-black">Mockups</h2>
            <p className="text-xs text-off-black/55 mt-0.5">Co-branded examples. Every charity first touch sends one.</p>
          </div>
          <button onClick={onClose} className={btnGhost}><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          {!configured ? (
            <p className="text-sm text-amber-700">Storage is not configured, so mockups cannot be saved.</p>
          ) : loading ? (
            <div className="flex items-center justify-center h-24 text-off-black/40"><Loader2 className="w-4 h-4 animate-spin" /></div>
          ) : mockups.length === 0 ? (
            <div
              className="border-2 border-dashed border-border-gray rounded-lg p-8 text-center"
              onDrop={e => { e.preventDefault(); upload(e.dataTransfer.files) }}
              onDragOver={e => e.preventDefault()}
            >
              <p className="text-sm font-medium text-off-black">No mockups yet</p>
              <p className="text-xs text-off-black/55 mt-1">
                Drop the co-branded images here. Keep the race in the filename, like Berlin_SIR_Mockup.png,
                so the right one gets picked automatically.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {mockups.map(m => (
                <div key={m.id} className="border border-border-gray rounded-lg overflow-hidden bg-subtle-gray">
                  <div className="aspect-[4/3] bg-white flex items-center justify-center overflow-hidden">
                    {m.previewUrl
                      ? <img src={m.previewUrl} alt={m.name} className="max-w-full max-h-full object-contain" />
                      : <span className="text-xs text-off-black/40">No preview</span>}
                  </div>
                  <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                    <span className="text-[11px] text-off-black/70 truncate" title={m.id}>{m.name}</span>
                    <button onClick={() => remove(m)} disabled={busy} className={btnGhost} title="Remove">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border-gray">
          <label className={`${btnSecondary} cursor-pointer`}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Add images
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={e => upload(e.target.files)}
            />
          </label>
          <button onClick={onClose} className={btnDanger.replace('bg-red-600', 'bg-dark-fill').replace('hover:bg-red-700', 'hover:bg-off-black/85')}>Done</button>
        </div>
      </div>
    </div>
  )
}
