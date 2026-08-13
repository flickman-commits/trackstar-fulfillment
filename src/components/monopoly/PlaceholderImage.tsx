/**
 * A reserved slot for photography that does not exist yet.
 *
 * The page needs to show people playing this, not just the object: a race
 * director deciding whether 2,000 boxes will move is really asking whether
 * anybody wants one, and a photograph of a family around a board answers that
 * faster than a paragraph does. None of those photos have been shot, so these
 * hold the exact space the real images will fill and say plainly what belongs
 * there rather than pretending with stock.
 *
 * Deliberately obvious rather than subtle. A grey box that looks like a design
 * choice is one nobody remembers to replace.
 */
import { MONOPOLY, UI_RADIUS, guilloche } from './monopolyTheme'

interface Props {
  /** What this photo will show. Reads as a shot list to whoever briefs it. */
  label: string
  /** Tailwind aspect ratio class. Square by default, matching the box shots. */
  aspect?: string
}

export function PlaceholderImage({ label, aspect = 'aspect-square' }: Props) {
  return (
    <div
      className={`flex ${aspect} items-center justify-center px-4 text-center`}
      style={{
        backgroundColor: MONOPOLY.paper,
        border: `2px solid ${MONOPOLY.black}`,
        borderRadius: UI_RADIUS,
        ...guilloche('rgba(35,31,32,0.07)', 20),
      }}
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
