/**
 * The interactive board — the hero of /monopoly and the reference artefact on
 * /monopoly/model.
 *
 * An 11×11 CSS grid with corners on wider tracks, exactly like a physical
 * board. The whole thing is a container query context, so every child sizes
 * itself in `cqw` against the board's own width and the board renders correctly
 * anywhere from a 360px phone to a 780px hero with no breakpoints and no
 * JavaScript measurement.
 */
import { useMemo, useState } from 'react'
import type { BoardSpace as BoardSpaceData } from '@/lib/monopolyTypes'
import { BOARD_FELT } from '@/lib/monopolyBoardLayout'
import { BoardSpace, CORNER_CQW, SPACE_CQW } from './BoardSpace'
import { STATUS_COLORS } from './boardView'
import { MONOPOLY, UI_RADIUS } from './monopolyTheme'
import { GROUP_LABELS, edgeFor, gridPosition } from './../../lib/monopolyBoardLayout'
import { BoardCenter } from './BoardCenter'

interface Props {
  spaces: BoardSpaceData[]
  selectedPosition: number | null
  /** Set by ?p= personalization — pulses the visitor's own space. */
  highlightPosition?: number | null
  onSelectSpace: (position: number) => void
}

export function Board({
  spaces,
  selectedPosition,
  highlightPosition,
  onSelectSpace,
}: Props) {
  const ordered = useMemo(() => [...spaces].sort((a, b) => a.position - b.position), [spaces])
  const [hovered, setHovered] = useState<number | null>(null)
  const hoveredSpace = hovered == null ? null : ordered.find((s) => s.position === hovered) || null

  return (
    <div
      style={{ containerType: 'inline-size' }}
      className="relative aspect-square w-full select-none"
    >
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: '1.55fr repeat(9, 1fr) 1.55fr',
          gridTemplateRows: '1.55fr repeat(9, 1fr) 1.55fr',
          backgroundColor: BOARD_FELT,
          border: '0.45cqw solid #231F20',
          boxShadow: 'inset 0 0 0 0.14cqw rgba(35,31,32,0.35), 0 2cqw 5cqw rgba(35,31,32,0.2)',
        }}
      >
        {ordered.map((space) => (
          <BoardSpace
            key={space.position}
            space={space}
            isSelected={selectedPosition === space.position}
            isHighlighted={highlightPosition === space.position}
            isHovered={hovered === space.position}
            onSelect={onSelectSpace}
            onHover={setHovered}
          />
        ))}

        {/* One tooltip for the whole board rather than one per space: a space
            clips its own overflow and is rotated, so a child tooltip would be
            cut off and printed sideways. */}
        {hoveredSpace && <SpaceTooltip space={hoveredSpace} />}

        {/* Center panel: the printed edition's own artwork, not a generic
            Monopoly middle. Drawn in BoardCenter so this file stays about
            geometry. */}
        <div
          style={{ gridArea: '2 / 2 / 11 / 11' }}
          className="relative overflow-hidden"
        >
          <BoardCenter />
        </div>
      </div>
    </div>
  )
}

/**
 * Hover card, positioned from the hovered cell and pushed toward the board's
 * middle so it never runs off the edge. Sized in cqw like everything else, so
 * it stays proportional at any board size.
 */
function SpaceTooltip({ space }: { space: BoardSpaceData }) {
  const { row, col } = gridPosition(space.position)
  const edge = edgeFor(space.position)

  // Track offsets: corners are wider, so a cell's center is not a simple
  // fraction of eleven.
  const axis = (i: number) => {
    if (i === 1) return CORNER_CQW / 2
    if (i === 11) return 100 - CORNER_CQW / 2
    return CORNER_CQW + (i - 2) * SPACE_CQW + SPACE_CQW / 2
  }

  const nudge = CORNER_CQW * 0.95
  let left = axis(col)
  let top = axis(row)
  if (edge === 'bottom') top -= nudge
  else if (edge === 'top') top += nudge
  else if (edge === 'left') left += nudge
  else if (edge === 'right') left -= nudge
  else {
    left += col === 1 ? nudge : -nudge
    top += row === 1 ? nudge : -nudge
  }

  const status = STATUS_COLORS[space.status]
  const sellable = space.status !== 'not_for_sale'
  const kind =
    space.type === 'property'
      ? space.colorGroup
        ? `${GROUP_LABELS[space.colorGroup]} race space`
        : 'Race space'
      : space.type === 'station'
        ? 'Railroad'
        : space.type === 'utility'
          ? 'Utility'
          : space.type === 'corner'
            ? 'Corner'
            : space.type === 'tax'
              ? 'Tax square'
              : 'Card square'

  return (
    <div
      className="pointer-events-none absolute z-20"
      style={{
        left: `${left}cqw`,
        top: `${top}cqw`,
        transform: 'translate(-50%, -50%)',
        backgroundColor: MONOPOLY.black,
        color: '#FFFFFF',
        borderRadius: `${UI_RADIUS / 10}cqw`,
        padding: '1.1cqw 1.4cqw',
        width: 'max-content',
        maxWidth: '26cqw',
        boxShadow: '0 1cqw 3cqw rgba(35,31,32,0.35)',
      }}
    >
      <div style={{ fontSize: '1.5cqw', fontWeight: 700, lineHeight: 1.2 }}>{space.displayName}</div>
      <div style={{ fontSize: '1.15cqw', color: 'rgba(255,255,255,0.62)', marginTop: '0.3cqw' }}>
        {kind}
        {sellable && (
          <>
            {' · '}
            <span style={{ color: space.status === 'available' ? '#8BE8A8' : status.fill }}>
              {status.label}
            </span>
          </>
        )}
      </div>
      <div
        style={{
          fontSize: '1.1cqw',
          color: '#F5A3A7',
          marginTop: '0.55cqw',
          fontWeight: 700,
        }}
      >
        Click for more
      </div>
    </div>
  )
}

