import { useEffect, useState } from 'react'
import { Download, Paperclip, X } from 'lucide-react'
import type { Attachment } from '@/types/support'

/**
 * What came with a message. Photos show as thumbnails in the bubble and
 * open full size on click; anything else is a chip that downloads it.
 * Email files stream from Gmail through our API; an Instagram photo is
 * Meta's own link, which expires after a while.
 */
const SHOWABLE = /^image\/(jpe?g|png|gif|webp|avif)$/i

function source(messageId: string, i: number, a: Attachment): { src: string; isImage: boolean } | null {
  if (a.url) return { src: a.url, isImage: a.mimeType === 'instagram/image' || SHOWABLE.test(a.mimeType) }
  if (!a.attachmentId) return null
  return { src: `/api/support/attachment?message=${encodeURIComponent(messageId)}&i=${i}`, isImage: SHOWABLE.test(a.mimeType) }
}

export default function Attachments({ messageId, attachments, out }: { messageId: string; attachments: Attachment[]; out: boolean }) {
  const [open, setOpen] = useState<{ src: string; name: string } | null>(null)
  const [broken, setBroken] = useState<Set<number>>(new Set())
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const items = attachments.map((a, i) => ({ a, i, s: source(messageId, i, a) }))
  const images = items.filter(x => x.s?.isImage && !broken.has(x.i))
  const files = items.filter(x => !x.s?.isImage || broken.has(x.i))
  const chip = `inline-flex items-center gap-1 px-2 py-0.5 rounded border ${out ? 'border-white/20' : 'border-border-gray bg-white'}`

  return (
    <>
      {images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {images.map(({ a, i, s }) => (
            <button key={`${a.attachmentId}-${i}`} onClick={() => setOpen({ src: s!.src, name: a.filename })} title={a.filename}
              className={`block overflow-hidden rounded-lg border ${out ? 'border-white/20' : 'border-border-gray'} bg-white hover:opacity-90`}>
              <img src={s!.src} alt={a.filename} loading="lazy" onError={() => setBroken(b => new Set(b).add(i))}
                className="block max-h-56 max-w-[240px] w-auto h-auto object-contain" />
            </button>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className={`mt-2 flex flex-wrap gap-1.5 text-[11px] ${out ? 'text-white/70' : 'text-off-black/60'}`}>
          {files.map(({ a, i, s }) => s ? (
            <a key={`${a.attachmentId}-${i}`} href={a.url ? s.src : `${s.src}&download=1`} target={a.url ? '_blank' : undefined} rel="noopener noreferrer"
              className={`${chip} hover:underline`} title={a.url ? "Open in a new tab (Meta's link expires after a while)" : `Download · ${a.mimeType}${a.size ? ` · ${Math.round(a.size / 1024)} KB` : ''}`}>
              <Paperclip className="w-3 h-3" />{a.filename}
            </a>
          ) : (
            <span key={`${a.attachmentId}-${i}`} className={chip}><Paperclip className="w-3 h-3" />{a.filename}</span>
          ))}
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setOpen(null)}>
          <div className="absolute top-4 right-4 flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <a href={open.src.startsWith('/api/') ? `${open.src}&download=1` : open.src} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white/10 text-white hover:bg-white/20"><Download className="w-3.5 h-3.5" />{open.name}</a>
            <button onClick={() => setOpen(null)} className="p-1.5 rounded-md bg-white/10 text-white hover:bg-white/20" title="Close (Esc)"><X className="w-4 h-4" /></button>
          </div>
          <img src={open.src} alt={open.name} className="max-h-full max-w-full object-contain rounded-md shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </>
  )
}
