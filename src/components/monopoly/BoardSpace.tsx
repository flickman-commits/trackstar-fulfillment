/**
 * A single space on the board.
 *
 * Two things make this work at any size without media queries:
 *
 *  1. Everything is measured in `cqw` — container query units resolved against
 *     the board's own width. The board is the container, so one set of numbers
 *     renders correctly at 360px on a phone and 780px on a laptop. No breakpoints.
 *
 *  2. Each side is rotated inward (bottom 0°, left 90°, top 180°, right 270°),
 *     which is how a physical board is laid out: the colour band always faces
 *     the centre. The content is authored once as if it were a bottom-row space
 *     and the rotation does the rest.
 */
import { memo } from 'react'
import type { BoardSpace as BoardSpaceData } from '@/lib/monopolyTypes'
import { GROUP_COLORS, edgeFor, gridPosition } from '@/lib/monopolyBoardLayout'
import { fillFor, textColorFor, isTaken, STATUS_COLORS } from './boardView'

// Grid track sizing: corners are wider than regular spaces, as on a real board.
// Total = 1.55 + 9 + 1.55 = 12.1 tracks across.
const TOTAL_TRACKS = 12.1
export const CORNER_CQW = (1.55 / TOTAL_TRACKS) * 100 // ≈ 12.81
export const SPACE_CQW = (1 / TOTAL_TRACKS) * 100 // ≈ 8.26

const ROTATION: Record<string, number> = { bottom: 0, left: 90, top: 180, right: 270 }

/**
 * Corner text runs along the bisector of its two adjacent sides, which is how a
 * physical board reads — GO points up-and-right out of the bottom-right corner,
 * Free Parking down-and-right out of the top-left, and so on.
 */
const CORNER_ROTATION: Record<number, number> = { 0: -45, 10: 45, 20: 135, 30: 225 }

interface Props {
  space: BoardSpaceData
  isSelected: boolean
  isHighlighted: boolean
  onSelect: (position: number) => void
}

function BoardSpaceImpl({ space, isSelected, isHighlighted, onSelect }: Props) {
  const edge = edgeFor(space.position)
  const { row, col } = gridPosition(space.position)
  const isCorner = edge === 'corner'
  const fill = fillFor(space)
  const textColor = textColorFor(space)
  const sellable = space.status !== 'not_for_sale'

  // Pre-rotation box. For the left/right rails the cell's width and height are
  // swapped relative to the bottom row, so the inner box swaps them back before
  // the rotation puts it right.
  const vertical = edge === 'left' || edge === 'right'
  const innerStyle: React.CSSProperties = isCorner
    ? {
        width: '100%',
        height: '100%',
        transform: `rotate(${CORNER_ROTATION[space.position] ?? 0}deg)`,
      }
    : vertical
      ? {
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: `${SPACE_CQW}cqw`,
          height: `${CORNER_CQW}cqw`,
          transform: `translate(-50%, -50%) rotate(${ROTATION[edge]}deg)`,
        }
      : {
          width: '100%',
          height: '100%',
          transform: `rotate(${ROTATION[edge]}deg)`,
        }

  return (
    <button
      type="button"
      onClick={() => onSelect(space.position)}
      aria-label={`${space.displayName}${sellable ? `, ${space.status}` : ''}`}
      className="relative overflow-hidden transition-[filter,transform] duration-150 hover:z-10 focus:z-10 focus:outline-none"
      style={{
        gridRow: row,
        gridColumn: col,
        backgroundColor: fill,
        border: '0.09cqw solid rgba(35,31,32,0.6)',
        cursor: sellable ? 'pointer' : 'default',
        filter: isSelected ? 'brightness(1.08)' : undefined,
        boxShadow: isSelected
          ? 'inset 0 0 0 0.35cqw #ED1C24'
          : isHighlighted
            ? 'inset 0 0 0 0.35cqw #ED1C24, 0 0 2cqw rgba(237,28,36,0.55)'
            : undefined,
      }}
    >
      <div style={innerStyle} className="flex flex-col">
        {/* Colour band — always faces the board centre once rotated. */}
        {space.colorGroup && !isCorner && (
          <div
            style={{
              height: '22%',
              backgroundColor: GROUP_COLORS[space.colorGroup],
              borderBottom: '0.09cqw solid rgba(35,31,32,0.6)',
              flexShrink: 0,
            }}
          />
        )}

        <div
          className="flex flex-1 flex-col items-center justify-center text-center"
          style={{ padding: isCorner ? '4%' : '5% 4%', minHeight: 0 }}
        >
          <span
            style={{
              // GO is two characters and the anchor of the whole board — it
              // carries the weight the other corners get from their word count.
              fontSize: space.position === 0 ? '2.6cqw' : isCorner ? '1.3cqw' : '1.02cqw',
              lineHeight: 1.12,
              fontWeight: 700,
              // GO is red on every Monopoly board ever printed.
              color: space.position === 0 ? '#ED1C24' : textColor,
              letterSpacing: '-0.01em',
              textTransform: 'uppercase',
              // Long race names wrap to three lines and then clip rather than
              // pushing the price out of the space.
              display: '-webkit-box',
              WebkitLineClamp: isCorner ? 3 : 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              overflowWrap: 'anywhere',
            }}
          >
            {space.displayName}
          </span>

          {space.boardValue && !isCorner && (
            <span
              style={{
                fontSize: '0.88cqw',
                marginTop: '0.35cqw',
                color: textColor,
                opacity: 0.75,
                fontWeight: 500,
              }}
            >
              {space.boardValue}
            </span>
          )}
        </div>

        {/* Availability pip. Open spaces read as a hollow ring, spoken-for ones
            as a filled dot in their status colour. Always on: this is the one
            thing a partner is scanning the board for. */}
        {sellable && (
          <div
            style={{
              position: 'absolute',
              top: '6%',
              right: '6%',
              width: '1.1cqw',
              height: '1.1cqw',
              borderRadius: '50%',
              backgroundColor: isTaken(space.status) ? STATUS_COLORS[space.status].fill : 'transparent',
              border: `0.16cqw solid ${isTaken(space.status) ? STATUS_COLORS[space.status].fill : 'rgba(35,31,32,0.45)'}`,
              opacity: 0.95,
            }}
          />
        )}
      </div>
    </button>
  )
}

export const BoardSpace = memo(BoardSpaceImpl)
