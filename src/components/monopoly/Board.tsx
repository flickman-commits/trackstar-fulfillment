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

const LOGO_SRC = '/Marathon Monopoly Logo.png'

interface Props {
  spaces: BoardSpaceData[]
  selectedPosition: number | null
  /** Set by ?p= personalisation — pulses the visitor's own space. */
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
          border: '0.35cqw solid #231F20',
          boxShadow: '0 2cqw 5cqw rgba(35,31,32,0.2)',
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

        {/* Centre medallion: the wordmark plus the two card decks. This is the
            single cue that makes the whole thing read as Monopoly before anyone
            reads a word on it. */}
        <div
          style={{ gridArea: '2 / 2 / 11 / 11' }}
          className="relative flex items-center justify-center overflow-hidden"
        >
          {/* Chance and Community Chest, angled into opposite quadrants the way
              they sit on the original. The deck names are fixed by the licence;
              the card contents are where the running edition lives. */}
          <CardDeck label="Chance" color="#F7941D" corner="topRight" />
          <CardDeck label="Community Chest" color="#5BA4D9" corner="bottomLeft" />

          {/* The real Marathon Monopoly artwork, angled 45° the way the wordmark
              sits on the printed board. Falls back to nothing rather than a
              broken image if the file is ever missing. */}
          <img
            src={LOGO_SRC}
            alt="Marathon Monopoly"
            style={{
              transform: 'rotate(-45deg)',
              width: '46%',
              height: 'auto',
              filter: 'drop-shadow(0 0.4cqw 1cqw rgba(35,31,32,0.22))',
            }}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />

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

  // Track offsets: corners are wider, so a cell's centre is not a simple
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

/**
 * A card deck resting on the board's centre. Rotated the same 45° as the
 * wordmark so the three elements read as one composition rather than three
 * things that happen to be in the middle.
 */
function CardDeck({
  label,
  color,
  corner,
}: {
  label: string
  color: string
  corner: 'topRight' | 'bottomLeft'
}) {
  const isTopRight = corner === 'topRight'
  return (
    <div
      className="absolute flex items-center justify-center"
      style={{
        top: isTopRight ? '12%' : undefined,
        right: isTopRight ? '11%' : undefined,
        bottom: isTopRight ? undefined : '12%',
        left: isTopRight ? undefined : '11%',
        width: '25%',
        height: '15%',
        backgroundColor: color,
        border: '0.18cqw solid #1A1A1A',
        transform: 'rotate(-45deg)',
        boxShadow: '0.3cqw 0.3cqw 0 rgba(26,26,26,0.22)',
      }}
    >
      <span
        style={{
          fontSize: '1.15cqw',
          fontWeight: 700,
          letterSpacing: '0.1cqw',
          textTransform: 'uppercase',
          color: '#1A1A1A',
          textAlign: 'center',
          lineHeight: 1.1,
          padding: '0 4%',
        }}
      >
        {label}
      </span>
    </div>
  )
}
