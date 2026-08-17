/**
 * A product shot, framed like everything else on the page.
 *
 * Falls back to the reserved-slot treatment when there is no image yet, so a
 * grid can mix shot and unshot without two components or a hole in it.
 *
 * These are concept renders rather than photographs of a finished product,
 * which the caller is expected to say out loud somewhere near them. The board
 * has not been designed yet, so anything legible inside these images is
 * illustrative and in several places is not real text at all.
 */
import { MONOPOLY, UI_RADIUS, guilloche } from './monopolyTheme'

interface Props {
  /** Public path, e.g. /monopoly/board.jpg. Omit to render the empty slot. */
  src?: string
  /** Describes the shot. Used as alt text, or as the slot label when empty. */
  label: string
  /** Tailwind aspect ratio class. Square by default, matching the box shots. */
  aspect?: string
}

export function ProductImage({ src, label, aspect = 'aspect-square' }: Props) {
  const frame = {
    backgroundColor: MONOPOLY.paper,
    border: `2px solid ${MONOPOLY.black}`,
    borderRadius: UI_RADIUS,
    overflow: 'hidden' as const,
  }

  if (!src) {
    return (
      <div
        className={`flex ${aspect} items-center justify-center px-4 text-center`}
        style={{ ...frame, ...guilloche('rgba(35,31,32,0.07)', 20) }}
      >
        <span
          style={{
            fontSize: 12,
            color: '#8A857C',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            lineHeight: 1.5,
          }}
        >
          {label}
        </span>
      </div>
    )
  }

  return (
    <div className={aspect} style={frame}>
      <img
        src={src}
        alt={label}
        loading="lazy"
        className="h-full w-full"
        style={{ objectFit: 'cover', display: 'block' }}
      />
    </div>
  )
}
