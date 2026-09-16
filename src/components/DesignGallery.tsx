import { useState } from 'react'
import { Maximize2 } from 'lucide-react'
import ProofFullscreen from '@/components/ProofFullscreen'

/**
 * A read-only strip of designs the partner can still flip through after the
 * round is decided: in revision, or approved. Nothing here approves or
 * revises anything. Each card carries its outcome, and tapping one opens the
 * same full-screen viewer the live round uses, so a partner showing the
 * options to a colleague gets the whole image with pinch and arrows.
 */
export type GalleryProof = {
  id: string
  imageUrl: string
  thumbnailUrl: string | null
  fileName: string | null
  groupLabel: string | null
  status: 'pending' | 'approved' | 'revision_requested' | 'rejected'
}

const BADGE: Record<GalleryProof['status'], { label: string; bg: string; color: string }> = {
  approved: { label: 'Approved', bg: 'rgba(70, 0, 214, 0.1)', color: '#4600D6' },
  revision_requested: { label: 'In revision', bg: 'rgba(217, 119, 6, 0.12)', color: '#B45309' },
  rejected: { label: 'Not chosen', bg: 'rgba(0,0,0,0.06)', color: '#666666' },
  pending: { label: 'Pending', bg: 'rgba(0,0,0,0.06)', color: '#666666' },
}

function isPdf(url: string) { return url.toLowerCase().includes('.pdf') }

export default function DesignGallery({ proofs, title, muted = false }: {
  proofs: GalleryProof[]
  title?: string
  /** Earlier rounds sit back a little so the current one reads first. */
  muted?: boolean
}) {
  const [index, setIndex] = useState<number | null>(null)
  const images = proofs.filter(p => !isPdf(p.imageUrl))
  if (proofs.length === 0) return null

  return (
    <div>
      {title && (
        <p className="text-xs font-medium mb-2" style={{ color: '#999999', letterSpacing: '0.03em' }}>{title}</p>
      )}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:thin]">
        {proofs.map(proof => {
          const badge = BADGE[proof.status]
          const imgIdx = images.findIndex(p => p.id === proof.id)
          return (
            <div key={proof.id} className="relative shrink-0" style={{ width: 150, opacity: muted ? 0.7 : 1 }}>
              {isPdf(proof.imageUrl) ? (
                <a
                  href={proof.imageUrl} target="_blank" rel="noopener noreferrer"
                  className="flex flex-col items-center justify-center gap-1 rounded-lg"
                  style={{ height: 200, backgroundColor: '#FFFFFF', border: '1px solid #E7E4DD' }}
                >
                  <span className="text-2xl">📄</span>
                  <span style={{ fontSize: '11px', color: '#666666' }}>{proof.fileName || 'PDF'}</span>
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => setIndex(imgIdx)}
                  className="group block w-full rounded-lg overflow-hidden"
                  style={{ backgroundColor: '#E9EBEE', border: '1px solid #E7E4DD' }}
                  title="Open full screen"
                >
                  <div className="relative" style={{ height: 200 }}>
                    <img
                      src={proof.thumbnailUrl || proof.imageUrl}
                      alt={proof.groupLabel ? `${proof.groupLabel} option` : 'Design option'}
                      className="w-full h-full object-contain p-2"
                      draggable={false}
                      onContextMenu={e => e.preventDefault()}
                    />
                    <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: '#FFFFFF', color: '#1A1A1A', fontSize: '11px', border: '1px solid #E7E4DD' }}>
                      <Maximize2 className="w-3 h-3" /> Full screen
                    </span>
                  </div>
                </button>
              )}
              <span
                className="absolute top-2 left-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                style={{ backgroundColor: badge.bg, color: badge.color }}
              >
                {badge.label}
              </span>
              {proof.groupLabel && (
                <p className="mt-1 truncate" style={{ fontSize: '11px', color: '#666666' }}>{proof.groupLabel}</p>
              )}
            </div>
          )
        })}
      </div>

      {index !== null && images[index] && (
        <ProofFullscreen
          proofs={images}
          index={index}
          onIndexChange={setIndex}
          onClose={() => setIndex(null)}
          counterLabel={`${BADGE[images[index].status].label}${images.length > 1 ? ` · ${index + 1} of ${images.length}` : ''}`}
        />
      )}
    </div>
  )
}
